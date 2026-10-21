import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { createAuditLog } from './audit.js';
import { prisma } from '../index.js';

const router = Router();

// flash-latest answers in a few seconds and calls the right report tool. The lite tier
// is the one Google sheds with 503 for long stretches, so it waits as the backup instead
// of burning three retries in front of every question the owner asks.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const SECONDARY_MODEL = process.env.GEMINI_SECONDARY_MODEL || 'gemini-flash-lite-latest';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';
const RETRYABLE = [408, 429, 500, 502, 503, 504];
// A hung provider call is worse than a missing answer — the chat looks frozen the whole time.
const CALL_TIMEOUT_MS = 25000;
// One question can need two reads (this month, last month) before it can answer.
const MAX_TOOL_ROUNDS = 3;
const SELF_BASE_URL = `http://127.0.0.1:${process.env.PORT || 3000}`;

// The assistant never reads the database itself. It calls the same admin endpoints the
// screens call, carrying the caller's own session cookie, so branch scoping and every
// permission rule keep applying exactly as they do on the page.
async function callOwnApi(req: Request, path: string, params: Record<string, any> = {}) {
  const url = new URL(path, SELF_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, {
    headers: { cookie: req.headers.cookie || '' },
    signal: AbortSignal.timeout(15000)
  });

  if (response.status === 403) {
    return { denied: true, message: 'الحساب ده ماعندوش صلاحية لبيانات دي' };
  }
  if (!response.ok) {
    return { error: `التقرير رجّع خطأ (${response.status})` };
  }
  return { json: await response.json() };
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// One round of the model, with the capacity-shedding retries handled here so the
// tool loop only ever sees an answer or a final failure.
async function callGemini(apiKey: string, payload: Record<string, any>) {
  const plans = [
    // Only the lite tiers accept thinkingLevel; asking the heaviest one for it is a 400.
    { model: GEMINI_MODEL, attempts: 2, minimalThinking: false },
    { model: SECONDARY_MODEL, attempts: 1, minimalThinking: false },
    { model: FALLBACK_MODEL, attempts: 1, minimalThinking: true }
  ];
  let lastStatus: number | string = 0;
  let lastDetail = '';

  for (const plan of plans) {
    for (let attempt = 1; attempt <= plan.attempts; attempt++) {
      try {
        const call = await fetch(`${GEMINI_API}/${plan.model}:generateContent`, {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            generationConfig: {
              temperature: 0,
              ...(plan.minimalThinking && { thinkingConfig: { thinkingLevel: 'MINIMAL' } })
            }
          }),
          signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
        });
        if (call.ok) return { json: await call.json(), model: plan.model };
        lastStatus = call.status;
        lastDetail = await call.text();
        // A rejection like an refused parameter isn't going to heal by retrying the same
        // model, but the other model may take it — so move down the list, don't give up.
        if (!RETRYABLE.includes(call.status)) break;
      } catch (error) {
        lastStatus = 'network';
        lastDetail = String(error);
      }
      if (attempt < plan.attempts) await wait(400 * attempt);
    }
  }

  console.error('Gemini failed after retries', lastStatus, lastDetail.slice(0, 300));
  return { error: `HTTP ${lastStatus || 'network'}`, detail: lastDetail.slice(0, 300) };
}

// The list endpoints stop at midnight of the day you pass, so the last day of a range
// would silently drop its afternoon traffic. The assistant closes the day instead.
function endOfDay(value: string) {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCSeconds(d.getUTCSeconds() - 1);
  return d.toISOString();
}

const toPounds = (piasters: number) => Math.round((piasters || 0) / 100);

const piastersToPounds = (value: any) =>
  typeof value === 'number' ? toPounds(value) : value;

function pickPounds(source: any, ...keys: string[]) {
  const out: Record<string, number> = {};
  keys.forEach(key => {
    if (typeof source?.[key] === 'number') out[key.replace('Piasters', '')] = toPounds(source[key]);
  });
  return out;
}

type ToolResult = { ok: boolean; data?: any; message?: string };

const tools: {
  name: string;
  description: string;
  parameters: { properties: Record<string, { type: string; description: string }>; required: string[] };
  run: (req: Request, args: any) => Promise<ToolResult>;
}[] = [
  {
    name: 'list_branches',
    description: 'الفروع الموجودة في النظام ومعها id كل فرع. اديها الفرع الأول عشان تعرف يقصد أنهي فرع.',
    parameters: { properties: {}, required: [] },
    async run(req) {
      const r = await callOwnApi(req, '/api/branches');
      if (r.denied || r.error) return { ok: false, message: r.message || r.error };
      const list = Array.isArray(r.json) ? r.json : r.json?.data || [];
      return {
        ok: true,
        data: list.map((b: any) => ({ id: b.id, name: b.name, code: b.code }))
      };
    }
  },
  {
    name: 'financial_summary',
    description:
      'الإيراد والمصروف وصافي الربح والمبالغ المتأخرة على الأعضاء في فترة. كل الأرقام بالجنيه المصري. محتاجة from و to بصيغة YYYY-MM-DD.',
    parameters: {
      properties: {
        from: { type: 'STRING', description: 'أول يوم في الفترة YYYY-MM-DD' },
        to: { type: 'STRING', description: 'آخر يوم في الفترة YYYY-MM-DD' },
        branchId: { type: 'STRING', description: 'id الفرع، وسيبه فاضي لكل الفروع' }
      },
      required: ['from', 'to']
    },
    async run(req, args) {
      const r = await callOwnApi(req, '/api/reports/financial', { from: args.from, to: args.to, branchId: args.branchId });
      if (r.denied || r.error) return { ok: false, message: r.message || r.error };
      const j = r.json || {};
      return {
        ok: true,
        data: {
          period: `${args.from} ← ${args.to}`,
          branchId: args.branchId || 'كل الفروع',
          ...pickPounds(j, 'revenue', 'expenses', 'profit', 'outstanding'),
          currency: 'EGP',
          salesCount: j.salesCount,
          subscriptionPaymentsCount: j.paymentsCount,
          expensesCount: j.expensesCount
        }
      };
    }
  },
  {
    name: 'branch_comparison',
    description:
      'مقارنة بين الفروع في فترة: الإيراد والمصروف والربح والمتأخرات بالجنيه، وعدد الأعضاء النشطين والاشتراكات الحية وعدد العمليات. دي الأداة اللي تستخدمها لأي سؤال «أنهي فرع أحسن».',
    parameters: {
      properties: {
        from: { type: 'STRING', description: 'أول يوم في الفترة YYYY-MM-DD' },
        to: { type: 'STRING', description: 'آخر يوم في الفترة YYYY-MM-DD' }
      },
      required: ['from', 'to']
    },
    async run(req, args) {
      const r = await callOwnApi(req, '/api/reports/branches', { from: args.from, to: args.to });
      if (r.denied || r.error) return { ok: false, message: r.message || r.error };
      const rows = (Array.isArray(r.json) ? r.json : []).map((row: any) => ({
        branch: row.branch?.name,
        ...pickPounds(row, 'revenue', 'expenses', 'profit', 'outstanding'),
        activeMembers: row.activeMembers,
        activeSubscriptions: row.activeSubscriptions,
        salesCount: row.salesCount,
        subscriptionPaymentsCount: row.paymentsCount
      }));
      return { ok: true, data: { period: `${args.from} ← ${args.to}`, currency: 'EGP', branches: rows } };
    }
  },
  {
    name: 'members_census',
    description: 'جرد الأعضاء: عدد كل حالة (نشط/منتهي/مجمّد/متوقف/غير مفعّل) والإجمالي. عدد الأعضاء الجداد في فترة بيجي من daily_journal في counts.MEMBER.',
    parameters: {
      properties: {
        branchId: { type: 'STRING', description: 'id الفرع، وسيبه فاضي لكل الفروع' }
      },
      required: []
    },
    async run(req, args) {
      const r = await callOwnApi(req, '/api/members', { branchId: args.branchId, pageSize: 1 });
      if (r.denied || r.error) return { ok: false, message: r.message || r.error };
      return {
        ok: true,
        data: {
          byStatus: r.json?.statusCounts,
          total: r.json?.pagination?.total,
          branch: args.branchId || 'كل الفروع'
        }
      };
    }
  },
  {
    name: 'attendance_counts',
    description: 'عدد مرات دخول الأعضاء للجيم في فترة (زيارات)، وملخص اليوم الحالي (اللي جوّه لسه/طلعوا/المعلّمين).',
    parameters: {
      properties: {
        from: { type: 'STRING', description: 'أول يوم في الفترة YYYY-MM-DD' },
        to: { type: 'STRING', description: 'آخر يوم في الفترة YYYY-MM-DD' },
        branchId: { type: 'STRING', description: 'id الفرع، وسيبه فاضي لكل الفروع' }
      },
      required: ['from', 'to']
    },
    async run(req, args) {
      const history = await callOwnApi(req, '/api/attendance/history', {
        startDate: args.from, endDate: endOfDay(args.to), branchId: args.branchId, pageSize: 1
      });
      if (history.denied || history.error) return { ok: false, message: history.message || history.error };
      const today = await callOwnApi(req, '/api/attendance/today', { branchId: args.branchId });
      return {
        ok: true,
        data: {
          period: `${args.from} ← ${args.to}`,
          visitsInPeriod: history.json?.pagination?.total,
          today: today.json?.summary
        }
      };
    }
  },
  {
    name: 'expenses_breakdown',
    description: 'مصروفات فترة مجمّعة على البنود (إيجار/رواتب/كهربا…)، الإجمالي بالجنيه وعدد العمليات.',
    parameters: {
      properties: {
        from: { type: 'STRING', description: 'أول يوم في الفترة YYYY-MM-DD' },
        to: { type: 'STRING', description: 'آخر يوم في الفترة YYYY-MM-DD' },
        branchId: { type: 'STRING', description: 'id الفرع، وسيبه فاضي لكل الفروع' }
      },
      required: ['from', 'to']
    },
    async run(req, args) {
      const r = await callOwnApi(req, '/api/reports/expenses', { from: args.from, to: args.to, branchId: args.branchId });
      if (r.denied || r.error) return { ok: false, message: r.message || r.error };
      const byCategory = r.json?.byCategory || {};
      return {
        ok: true,
        data: {
          period: `${args.from} ← ${args.to}`,
          currency: 'EGP',
          total: toPounds(r.json?.total),
          categories: Object.entries(byCategory).map(([category, v]: [string, any]) => ({
            category,
            total: toPounds(v.total),
            count: v.count
          }))
        }
      };
    }
  },
  {
    name: 'daily_journal',
    description:
      'سجل عمليات اليوم أو الفترة: كل فاتورة ودفعة اشتراك ومصروف وراتب وعضو جديد ودخول، والتجميعات (إيراد/خروج/صافي) بالجنيه. استخدمها لسؤال «حصل إيه النهارده» أو «كام فاتورة».',
    parameters: {
      properties: {
        from: { type: 'STRING', description: 'أول يوم YYYY-MM-DD' },
        to: { type: 'STRING', description: 'آخر يوم YYYY-MM-DD' },
        branchId: { type: 'STRING', description: 'id الفرع، وسيبه فاضي لكل الفروع' }
      },
      required: ['from', 'to']
    },
    async run(req, args) {
      const r = await callOwnApi(req, '/api/reports/activity', { from: args.from, to: args.to, branchId: args.branchId });
      if (r.denied || r.error) return { ok: false, message: r.message || r.error };
      const s = r.json?.summary || {};
      return {
        ok: true,
        data: {
          period: `${args.from} ← ${args.to}`,
          currency: 'EGP',
          ...pickPounds(s, 'incomePiasters', 'outflowPiasters', 'netPiasters'),
          counts: s.counts,
          listedCount: (r.json?.items || []).length
        }
      };
    }
  },
  {
    name: 'subscriptions_watch',
    description: 'الاشتراكات اللي هتخلص خلال أيام (عدد واسم العضو وخطة وتاريخ الانتهاء) — للجرد اليومي ومتابعة التجديدات.',
    parameters: {
      properties: { days: { type: 'NUMBER', description: 'عدد الأيام، الافتراضي 7' } },
      required: []
    },
    async run(req, args) {
      const r = await callOwnApi(req, '/api/subscriptions/expiring', { days: args.days || 7 });
      if (r.denied || r.error) return { ok: false, message: r.message || r.error };
      const list = Array.isArray(r.json) ? r.json : r.json?.data || [];
      return {
        ok: true,
        data: {
          withinDays: args.days || 7,
          count: list.length,
          items: list.slice(0, 25).map((s: any) => ({
            member: s.member?.name,
            memberCode: s.member?.code,
            plan: s.plan?.nameAr || s.plan?.name,
            endDate: s.endDate
          }))
        }
      };
    }
  },
  {
    name: 'stock_check',
    description:
      'جرد البضاعة: عدد الأصناف وكمياتها الموجودة واللي خلصت والكمية المنخفضة، بالجنيه لأسعار البيع. لو عايز صنف معين اكتب search.',
    parameters: {
      properties: {
        branchId: { type: 'STRING', description: 'id الفرع، وسيبه فاضي لكل الفروع' },
        search: { type: 'STRING', description: 'اسم الصنف أو الباركود' }
      },
      required: []
    },
    async run(req, args) {
      const r = await callOwnApi(req, '/api/products', { branchId: args.branchId, search: args.search });
      if (r.denied || r.error) return { ok: false, message: r.message || r.error };
      const list = r.json?.data || [];
      const out = list.filter((p: any) => p.quantity <= 0).length;
      const low = list.filter((p: any) => p.quantity > 0 && p.quantity <= (p.lowStockThreshold ?? 5)).length;
      return {
        ok: true,
        data: {
          productsCount: list.length,
          // An empty product table must not be read back as a healthy stock.
          ...(list.length === 0 && { note: 'مفيش أصناف مسجلة في النظام أصلاً، فمتقولش المخزون تمام' }),
          outOfStockCount: out,
          lowStockCount: low,
          unitsOnShelf: list.reduce((sum: number, p: any) => sum + (p.quantity || 0), 0),
          items: list.slice(0, 30).map((p: any) => ({
            name: p.nameAr || p.name,
            quantity: p.quantity,
            lowStockThreshold: p.lowStockThreshold,
            price: piastersToPounds(p.pricePiasters),
            branch: p.branch?.name
          }))
        }
      };
    }
  },
  {
    name: 'sales_check',
    description: 'فواتير البوفيه/البيع في فترة: عدد الفواتير وإجماليها بالجبيه وأكتر الأصناف مبيعاً.',
    parameters: {
      properties: {
        from: { type: 'STRING', description: 'أول يوم YYYY-MM-DD' },
        to: { type: 'STRING', description: 'آخر يوم YYYY-MM-DD' },
        branchId: { type: 'STRING', description: 'id الفرع، وسيبه فاضي لكل الفروع' }
      },
      required: ['from', 'to']
    },
    async run(req, args) {
      const r = await callOwnApi(req, '/api/sales', { startDate: args.from, endDate: endOfDay(args.to), branchId: args.branchId });
      if (r.denied || r.error) return { ok: false, message: r.message || r.error };
      const list = r.json?.data || [];
      const perProduct: Record<string, { quantity: number; total: number }> = {};
      list.forEach((sale: any) => {
        (sale.items || []).forEach((item: any) => {
          const key = item.product?.nameAr || item.product?.name || 'صنف محذوف';
          perProduct[key] = perProduct[key] || { quantity: 0, total: 0 };
          perProduct[key].quantity += item.quantity || 0;
          perProduct[key].total += (item.totalPiasters || 0);
        });
      });
      return {
        ok: true,
        data: {
          period: `${args.from} ← ${args.to}`,
          currency: 'EGP',
          invoices: list.length,
          total: toPounds(list.reduce((sum: number, s: any) => sum + (s.finalTotalPiasters || 0), 0)),
          topProducts: Object.entries(perProduct)
            .sort((a, b) => b[1].quantity - a[1].quantity)
            .slice(0, 8)
            .map(([name, v]) => ({ name, quantity: v.quantity, total: toPounds(v.total) }))
        }
      };
    }
  },
  {
    name: 'find_member',
    description: 'تدور على عضو بالاسم أو كود العضو أو الموبايل، وترجّع حالته وفرعه وتاريخ انتهاء اشتراكه.',
    parameters: {
      properties: {
        search: { type: 'STRING', description: 'اسم أو كود أو رقم موبايل' }
      },
      required: ['search']
    },
    async run(req, args) {
      const r = await callOwnApi(req, '/api/members', { search: args.search, pageSize: 6 });
      if (r.denied || r.error) return { ok: false, message: r.message || r.error };
      return {
        ok: true,
        data: (r.json?.data || []).map((m: any) => ({
          name: m.person?.name,
          memberCode: m.memberCode,
          status: m.status,
          branch: m.branch?.name,
          subscriptionEnd: m.subscriptions?.[0]?.endDate || null
        }))
      };
    }
  },
  {
    name: 'staff_shifts',
    description:
      'الموظفين والمدربين: كام واحد موجود النهارده دلوقتي، كام واحد دخل، مين غايب، وعدد ساعات كل واحد النهارده والشهر. أي سؤال عن مدرب أو شفت أو حضور موظف ده تقريره.',
    parameters: {
      properties: {
        branchId: { type: 'STRING', description: 'id الفرع، وسيبه فاضي لكل الفروع' },
        role: { type: 'STRING', description: 'TRAINER لو يسأل عن المدربين بس، وسيبه فاضي لكل الموظفين' }
      },
      required: []
    },
    async run(req, args) {
      const r = await callOwnApi(req, '/api/staff', { branchId: args.branchId, role: args.role });
      if (r.denied || r.error) return { ok: false, message: r.message || r.error };
      const list = r.json?.data || [];
      const summary = r.json?.summary || {};
      // Wages are deliberately left out: this report is readable by accounts that
      // are not allowed to see payroll.
      return {
        ok: true,
        data: {
          staffTotal: summary.total ?? list.length,
          presentNow: summary.present ?? list.filter((s: any) => s.present).length,
          checkedInToday: summary.checkedInToday ?? list.filter((s: any) => (s.todayShifts || []).length > 0).length,
          absentToday: summary.absent ?? list.filter((s: any) => s.isActive && (s.todayShifts || []).length === 0).length,
          onDuty: list.filter((s: any) => s.present).map((s: any) => ({
            name: s.name,
            role: s.role,
            branch: s.branchName,
            hoursToday: s.hoursTodayLabel
          })),
          byPerson: list.slice(0, 25).map((s: any) => ({
            name: s.name,
            role: s.role,
            staffCode: s.staffCode,
            present: s.present,
            hoursToday: s.hoursTodayLabel,
            hoursMonth: s.hoursMonthLabel
          }))
        }
      };
    }
  }
];

const declarations = tools.map(tool => ({
  name: tool.name,
  description: tool.description,
  parameters: {
    type: 'OBJECT',
    properties: tool.parameters.properties,
    required: tool.parameters.required
  }
}));

// He asked to be talked to as «دكتور أحمد»; every other account keeps its own name.
const OWNER_ADDRESS = 'دكتور أحمد';

function addressOf(sessionUser: any) {
  return sessionUser.role === 'OWNER' ? OWNER_ADDRESS : sessionUser.name || sessionUser.email || 'المدير';
}

function systemInstruction(userName: string) {
  return [
    `انت مساعد ذكي لمدير جيم POWER 111، واللي بيسألك هو: ${userName} — ناديّه بالاسم ده في الرد بطريقة طبيعية، مرة واحدة كفاية.`,
    `بتتكلم عربي مصري بسيط ومختصر، وفرفوش خفيف الظل: تحية أو تعليق لطيف في أول الرد أو آخره بكلمتين، ومتطولش ومتزودش حشو — الأرقام هي اللي يهمه.`,
    `من غير إيموجي خالص، ومتكترش علامات التعجب.`,
    `القاعدة الأولى وأهم قاعدة: أي سؤال فيه «كام» أو «قد إيه» أو عدد أو فلوس أو مقارنة أو حالة — لازم تنادي أداة قبل ما تكتب أي كلام. ممنوع تطلب من المستخدم توضيح قبل ما تنادي أداة، وممنوع تخمّن أو تحسب أي رقم من عندك.`,
    `لو مافيش أداة بتديده المطلوب، قول «مافيش تقرير بيغطي ده» وبس.`,
    `لو المستخدم نطق اسم فرع، ناديه على list_branches الأول خد الـ id الصحيح، ومتخمنش id خالص.`,
    `أي سؤال عن مدرب أو موظف أو شفت أو مين موجود في الجيم دلوقتي أو ساعات العمل → أداة staff_shifts (هي تقرير الموظفين)، ومتستعملش attendance_counts اللي هو حضور الأعضاء.`,
    `لو السؤال عام زي «إيه حالة الجيم النهارده» أو «قولي ملخص»، نادى كل الأدوات اللي تلزم (أعضاء + حضور + اشتراكات + بيع + مصروفات) مرة واحدة في نفس الرد، وبعدين اعمل ملخص من الأرقام كلها.`,
    `لو قال «الشهر دا» أو «الشهر اللي فات» أو «النهارده»، احسب من وتاريخ بنفسك ونادي الأداة. اليوم الحالي ${new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })}.`,
    `مقارنة شهرين أو فرعين: ناديه على نفس الأداة مرتين (مرة لكل ناحية) في نفس الرد، وبعدين قارن بالأرقام اللي جاتلك وقول أنهي واحد أحسن وليه من الأرقام نفسها.`,
    `كل الفلوس اللي ترجع من financial_summary أو branch_comparison أو expenses_breakdown أو sales_check أو daily_journal هي بالجنيه المصري بالظبط (currency: EGP) — متقسمش في 100 ولا تضرب في أي حاجة.`,
    `لو الأداة رجعت denied، قول بصراحة «الحساب ده ماعندوش صلاحية للبيانات دي» ومتخمنش قيمتها.`,
    `متكتبش سطر «المصدر» بنفسك — الواجهة عرضة تحت الرد، واكتب الرد من غير أي اسم أداة أو اسم متغير إنجليزي.`,
    `اكتب كلام عادي بس: متحطش نجوم ولا markdown ولا بينات إنجليزية، والسطر القصير كفاية.`,
    `ممنوع تكتب أي رقم — عدد أو فلوس أو نسبة أو تاريخ حركة — إلا لو جاي حرفياً من رد أداة في السؤال ده. الرقم اللي مجاش من أداة امحي الجملة اللي فيه خالص.`,
    `لو السؤال تحية أو كلام عام مالوش دعوة بالداتا، رد بتحية دافية قصيرة على ${userName} من غير أداة — ومتخلطش التحية بحالة الجيم أو أرقام النهاردة، التحية كلام بس.`
  ].join('\n');
}

// Only the spoken turns travel back to the model; tool payloads are re-fetched each
// question, so a stale number can never be quoted as a fresh one.
function toHistoryEntries(history: any[]) {
  return (history || [])
    .filter(m => m && typeof m.text === 'string' && m.text.trim() && (m.role === 'user' || m.role === 'assistant'))
    .slice(-8)
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text.slice(0, 2000) }]
    }));
}

router.get('/status', requireAuth, (_req: Request, res: Response) => {
  res.json({ success: true, enabled: Boolean(process.env.GEMINI_API_KEY), model: GEMINI_MODEL });
});

// The journal of what this account asked and what the reports answered.
router.get('/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'Assistant', userId: sessionUser.id },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, createdAt: true, data: true }
    });
    res.json({
      success: true,
      data: logs.map(log => ({
        id: log.id,
        at: log.createdAt,
        question: (log.data as any)?.question,
        answer: (log.data as any)?.answer,
        tools: (log.data as any)?.tools
      }))
    });
  } catch (error) {
    console.error('Error fetching assistant history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// The thread he sees is this journal, so clearing it is a real delete: nothing comes back
// on the next login or the next phone until he asks again.
router.delete('/history', requireAuth, requirePermission('VIEW_DASHBOARD'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { count } = await prisma.auditLog.deleteMany({
      where: { entityType: 'Assistant', userId: sessionUser.id }
    });
    res.json({ success: true, deleted: count });
  } catch (error) {
    console.error('Error clearing assistant history:', error);
    res.status(500).json({ error: 'Failed to clear history', message: 'معرفتش أمسح المحادثة — حاول تاني' });
  }
});

router.post('/ask', requireAuth, requirePermission('VIEW_DASHBOARD'), async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Assistant is not configured',
      message: 'مفتاح الذكاء متسجلش على السيرفر — المساعد متوقف مؤقتاً'
    });
  }

  const sessionUser = (req.session as any).user;
  const question = String(req.body?.message || '').trim();
  if (!question) return res.status(400).json({ error: 'Question required', message: 'اكتب سؤالك الأول' });
  if (question.length > 500) {
    return res.status(400).json({ error: 'Question too long', message: 'السؤال طويل أوي، اختصره' });
  }

  const contents: any[] = [
    ...toHistoryEntries(req.body?.history),
    { role: 'user', parts: [{ text: question }] }
  ];

  const address = addressOf(sessionUser);
  const usedTools: { name: string; args: any }[] = [];
  // Reports that actually handed back data on this question. A figure with none of them
  // behind it is a figure the model made up, and he banned made-up numbers outright.
  let readReports = 0;
  let forceToolsNextRound = false;
  const unverifiedAnswerLine = `معلش يا ${address}، معرفتش أقرأ الأرقام دي من التقارير دلوقتي — ومش هقول رقم النظام ماطلعوش. اسألني عن حضور النهاردة أو البيع أو الاشتراكات وهجيبهولك من التقارير نفسها.`;

  // The UI renders the source badges itself, and the model likes to repeat them in
  // plain text with the raw tool names, so the trailing line is dropped here.
  // The bubble is plain text, so the markdown it sometimes answers in is flattened too.
  const spokenText = (parts: any[]) => parts.filter(p => !p.functionCall).map(p => p.text).filter(Boolean).join('\n')
    .replace(/\*\*(.+?)\*\*/gu, '$1')
    .replace(/^\s*[*•-]\s+/gmu, '• ')
    .replace(/\n*المصدر:.*$/u, '')
    .trim();

  const reply = (answer: string) => {
    createAuditLog(sessionUser.id, 'assistant.ask', 'Assistant', undefined, sessionUser.branchIds?.[0], {
      question,
      answer: answer.slice(0, 1200),
      tools: usedTools.map(t => t.name)
    }).catch(() => {});
    res.json({ success: true, answer, tools: usedTools });
  };

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const out = await callGemini(apiKey, {
        contents,
        systemInstruction: { parts: [{ text: systemInstruction(address) }] },
        tools: [{ functionDeclarations: declarations }],
        toolConfig: { functionCallingConfig: { mode: forceToolsNextRound ? 'ANY' : 'AUTO' } }
      });

      if (out.error) {
        return res.status(502).json({
          error: 'Assistant provider failed',
          message: 'خدمة الذكاء زحمة عند الشركة المزودة دلوقتي — استنى ٢٠ ثانية وابعت السؤال تاني'
        });
      }

      const payload = out.json;
      const parts: any[] = payload?.candidates?.[0]?.content?.parts || [];
      if (!parts.length) {
        return res.status(502).json({ error: 'Empty answer', message: 'المساعد مرجّعش رد — حاول بصيغة تانية للسؤال' });
      }

      contents.push({ role: 'model', parts });

      const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);
      if (!calls.length) {
        const text = spokenText(parts);
        // It answered with numbers but never read a report — that text is invented. Send
        // the same question back with tool use forced, and if even that comes up empty,
        // say so plainly instead of shipping figures he'd act on.
        if (/\d/.test(text) && readReports === 0) {
          if (!forceToolsNextRound && round + 1 < MAX_TOOL_ROUNDS) {
            forceToolsNextRound = true;
            contents.push({ role: 'user', parts: [{ text: 'كتبت أرقام من غير ما تنادي أي أداة تقارير، وده ممنوع. نادي الأدوات اللي تجيب الكلام ده، وارّد من اللي يرجعلك بس.' }] });
            continue;
          }
          return reply(unverifiedAnswerLine);
        }
        return reply(text);
      }
      forceToolsNextRound = false;

      const responses: any[] = await Promise.all(calls.map(async (fc: any) => {
        const tool = tools.find(t => t.name === fc.name);
        usedTools.push({ name: fc.name, args: fc.args || {} });
        let result: ToolResult;
        if (!tool) {
          result = { ok: false, message: 'الأداة دي مش موجودة في النظام' };
        } else {
          try {
            result = await tool.run(req, fc.args || {});
          } catch (error) {
            console.error('Assistant tool failed:', fc.name, error);
            result = { ok: false, message: 'التقرير ماعرفش يطلّع البيانات دي' };
          }
        }
        if (result.ok) readReports++;
        return {
          functionResponse: {
            name: fc.name,
            response: result.ok ? { result: result.data } : { denied: true, message: result.message }
          }
        };
      }));
      contents.push({ role: 'user', parts: responses });
    }

    // Rounds are spent but every report it asked for is already in the conversation, so
    // make it answer from that instead of bouncing the question back at the owner.
    const forced = await callGemini(apiKey, {
      contents,
      systemInstruction: { parts: [{ text: systemInstruction(address) }] },
      tools: [{ functionDeclarations: declarations }],
      toolConfig: { functionCallingConfig: { mode: 'NONE' } }
    });
    const forcedAnswer = forced.error ? '' : spokenText(forced.json?.candidates?.[0]?.content?.parts || []);
    if (forcedAnswer && !(/\d/.test(forcedAnswer) && readReports === 0)) return reply(forcedAnswer);

    if (/\d/.test(forcedAnswer) && readReports === 0) return reply(unverifiedAnswerLine);

    return res.status(504).json({
      error: 'Assistant ran out of tool rounds',
      message: 'السؤال محتاج تقارير كتير — قسّمه على سؤالين'
    });
  } catch (error) {
    console.error('Assistant request failed:', error);
    res.status(500).json({ error: 'Assistant failed', message: 'حصل خطأ في المساعد — حاول تاني' });
  }
});

export default router;
