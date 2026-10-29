import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { createAuditLog } from './audit.js';
import { prisma } from '../index.js';

const router = Router();

// Measured on this key: the lite tier reads the right report and answers in ~2 seconds,
// while flash-latest took 11s just to pick the tool and over 70s to write the answer, on
// top of 503 "high demand" spells. So lite carries every question and flash only steps in
// when both lite tiers fail.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const SECONDARY_MODEL = process.env.GEMINI_SECONDARY_MODEL || 'gemini-3.1-flash-lite';
const QUALITY_MODEL = process.env.GEMINI_QUALITY_MODEL || 'gemini-flash-latest';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';
const RETRYABLE = [408, 429, 500, 502, 503, 504];
// A hung provider call is worse than a missing answer — the chat looks frozen the whole time.
const CALL_TIMEOUT_MS = 12000;
// The heavy tier is slow by nature, so it gets longer but still can't hang the chat open.
const QUALITY_TIMEOUT_MS = 20000;
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
    { model: GEMINI_MODEL, attempts: 2, thinking: { thinkingLevel: 'MINIMAL' }, timeoutMs: CALL_TIMEOUT_MS },
    // A tier that rejects thinkingLevel is worth one plain try before moving down the list.
    { model: GEMINI_MODEL, attempts: 1, timeoutMs: CALL_TIMEOUT_MS },
    { model: SECONDARY_MODEL, attempts: 1, thinking: { thinkingLevel: 'MINIMAL' }, timeoutMs: CALL_TIMEOUT_MS },
    // flash accepts LOW but answers 400 to MINIMAL, which is the lite tier's knob.
    { model: QUALITY_MODEL, attempts: 1, thinking: { thinkingLevel: 'LOW' }, timeoutMs: QUALITY_TIMEOUT_MS }
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
              // An answer is two or three spoken sentences; a ceiling stops a rambling run
              // from keeping the chat spinner turning for nothing.
              maxOutputTokens: 1200,
              ...(plan.thinking && { thinkingConfig: plan.thinking })
            }
          }),
          signal: AbortSignal.timeout(plan.timeoutMs)
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

/* ── Arithmetic the server does itself ─────────────────────────────────────────
   He wants the assistant to answer ordinary questions too, including جمع وطرح, so
   a calculation never depends on the model's mental maths. This is a small recursive
   descent parser over a filtered character set — no eval, no Function(), nothing the
   caller can steer. */

function toLatinDigits(text: string) {
  return text
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));
}

// Words he types instead of keyboard signs. Only ever read on text that has already been
// checked for being a calculation, so an ordinary «في» inside a sentence can't become ×.
function withOperatorWords(text: string) {
  return text
    .replace(/[٫]/g, '.')
    .replace(/[×✕✖]/g, '*')
    .replace(/÷/g, '/')
    .replace(/(?:زائد|موجب|زيادة)/g, '+')
    .replace(/(?:ناقص|طرح|خصم)/g, '-')
    .replace(/(?:مضروبة في|ضرب|في)/g, '*')
    .replace(/(?:مقسوم على|قسمة على|على)/g, '/')
    .replace(/(?:يساوي|تساوي)/g, '=')
    .replace(/(\d)\s*%/g, '$1/100')
    .replace(/(?:من)/g, '*');
}

function parseExpression(raw: string): { expression: string; value: number } | null {
  const src = withOperatorWords(toLatinDigits(String(raw ?? ''))).split('=')[0]?.trim() || '';
  if (!src || src.length > 160 || !/\d/.test(src)) return null;

  let i = 0;
  const skipSpaces = () => {
    while (i < src.length && (src[i] === ' ' || src[i] === '\n' || src[i] === '\t')) i++;
  };

  function readNumber(): number | null {
    const match = /^\d[\d,]*(?:\.\d+)?/u.exec(src.slice(i));
    if (!match) return null;
    i += match[0].length;
    return Number(match[0].replace(/,/g, ''));
  }

  function factor(): number | null {
    skipSpaces();
    const char = src[i];
    if (char === '(') {
      i++;
      const inner = sum();
      if (inner === null) return null;
      skipSpaces();
      if (src[i] !== ')') return null;
      i++;
      return inner;
    }
    if (char === '-') {
      i++;
      const value = factor();
      return value === null ? null : -value;
    }
    if (char === '+') {
      i++;
      return factor();
    }
    return readNumber();
  }

  function product(): number | null {
    let left = factor();
    if (left === null) return null;
    for (;;) {
      skipSpaces();
      const char = src[i];
      if (char !== '*' && char !== '/') return left;
      i++;
      const right = factor();
      if (right === null) return null;
      if (char === '/' && right === 0) return null;
      left = char === '*' ? left * right : left / right;
    }
  }

  function sum(): number | null {
    let left = product();
    if (left === null) return null;
    for (;;) {
      skipSpaces();
      const char = src[i];
      if (char !== '+' && char !== '-') return left;
      i++;
      const right = product();
      if (right === null) return null;
      left = char === '+' ? left + right : left - right;
    }
  }

  const value = sum();
  skipSpaces();
  if (value === null || i !== src.length || !Number.isFinite(value) || Math.abs(value) > 1e15) return null;
  return { expression: src, value: Math.round(value * 1e6) / 1e6 };
}

// True only when the whole message is the calculation, so it can be answered on the spot
// without spending a model round trip or a report read. Polite filler words are dropped
// first; anything left that isn't a digit or a sign means it is a sentence, not a sum.
const CALC_FILLER = /(?:كام|كم|احسبلي|احسب|حسبلي|حسب|حساب|نسبة|النسبة|المية|مئوية|منها|منه|قد إيه|قد ايه|قولي|عايز|هات|يساوي|ساوي|الناتج|يعني|جنيهات|جنيه|فضلا|لو سمحت|بس|ليا|لي|الـ|ال)/g;

function arithmeticOnly(text: string) {
  const stripped = toLatinDigits(text)
    .replace(CALC_FILLER, ' ')
    .replace(/[؟?!]/g, ' ')
    .trim();
  if (!stripped || stripped.length > 120) return null;
  const parsed = parseExpression(stripped);
  if (!parsed) return null;
  if (!/^[\d+\-*/().,\s]+$/u.test(parsed.expression)) return null;
  if (!/[+\-*/]/u.test(parsed.expression)) return null;
  // A leading sign means a word became an operator inside a sentence («خصم ١٥٪ من ٤٨٠»),
  // which is not the sum the calculator can answer honestly — leave it to the model.
  if (/^[+\-*/]/u.test(parsed.expression.trim())) return null;
  return parsed;
}

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const showNumber = (value: number) => numberFormatter.format(value);

// True when every digit written in an answer is a number this server's own calculator
// produced for the same question — arithmetic we did, not a report figure invented.
function everyFigureCalculated(text: string, facts: string[]) {
  if (!facts.length) return false;
  const known = new Set(facts.map(fact => fact.replace(/,/g, '').replace(/\.0+$/u, '').replace(/\.+$/u, '')));
  const runs = text.match(/\d[\d.,]*/gu) || [];
  if (!runs.length) return true;
  return runs.every(run => {
    const clean = run.replace(/,/g, '').replace(/\.0+$/u, '').replace(/\.+$/u, '');
    return known.has(clean) || Array.from(known).some(fact => fact.split('.')[0] === clean);
  });
}

// Anything that talks about the club's own records reads them through the report tools.
// Words alone are not enough — «كام» on its own is how everybody asks for arithmetic too —
// so the list is subjects and time windows, not question words.
const CLUB_DATA_WORDS = [
  'عدد', 'إجمالي', 'اجمالي', 'إيراد', 'ايراد', 'يراد', 'مصروف', 'مصاريف', 'ربح', 'خسار',
  'متأخر', 'مستحق', 'حضور', 'حاضر', 'غياب', 'عضو', 'أعضاء', 'اعضاء', 'اشتراك', 'تجديد', 'باقة',
  'بيع', 'مبيعات', 'فاتورة', 'مخزون', 'بضاعة', 'صنف', 'موظف', 'موظفين', 'مدرب', 'شفت', 'ساعات',
  'جلسة', 'جلسات', 'علاج', 'فرع', 'فروع', 'تقرير', 'تقارير', 'نهارده', 'نهاردة', 'اليوم',
  'امبارح', 'أمبارح', 'الشهر', 'شهر', 'جيم', 'نادي', 'دخول', 'خروج', 'مسجل',
  'تسجيل', 'حالة', 'حالته', 'فلوس', 'جنيه', 'راتب', 'كسبنا', 'كسب', 'خسرنا', 'حصّلنا', 'حصلا'
];

function mentionsClubData(text: string) {
  const flat = text.replace(/\s+/g, ' ');
  return CLUB_DATA_WORDS.some(word => flat.includes(word));
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
      // Accounts without the census permission get the rows but no totals, so say plainly
      // that this number isn't theirs instead of answering with an empty object.
      if (!r.json?.statusCounts && r.json?.pagination?.total === null) {
        return { ok: false, message: 'عدد الأعضاء ده للمالك والمحاسب، ومش مسموح للحسابات التانية' };
      }
      return {
        ok: true,
        data: {
          membersByStatus: r.json?.statusCounts,
          totalMembers: r.json?.pagination?.total,
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
      // Two different reports, no dependency between them, so they run at the same time —
      // one after the other just doubled the wait for the same answer.
      const [history, today] = await Promise.all([
        callOwnApi(req, '/api/attendance/history', {
          startDate: args.from, endDate: endOfDay(args.to), branchId: args.branchId, pageSize: 1
        }),
        callOwnApi(req, '/api/attendance/today', { branchId: args.branchId })
      ]);
      if (history.denied || history.error) return { ok: false, message: history.message || history.error };
      return {
        ok: true,
        data: {
          period: `${args.from} ← ${args.to}`,
          visitsInPeriod: history.json?.pagination?.total,
          todayVisits: today.json?.summary?.total ?? 0,
          insideNow: today.json?.summary?.checkedIn ?? 0,
          checkedOutToday: today.json?.summary?.checkedOut ?? 0,
          flaggedToday: today.json?.summary?.flagged ?? 0
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
          expensesTotalEgp: toPounds(r.json?.total),
          categories: Object.entries(byCategory).map(([category, v]: [string, any]) => ({
            category,
            totalEgp: toPounds(v.total),
            operationsCount: v.count
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
          expiringCount: list.length,
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
          invoicesCount: list.length,
          revenueEgp: toPounds(list.reduce((sum: number, s: any) => sum + (s.finalTotalPiasters || 0), 0)),
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
  },
  {
    name: 'physio_sessions',
    description:
      'جلسات العلاج الطبيعي اللي الأعضاء طلبوها: كام طلب مستني المراجعة، مين اتقبل وسعره كام، مين اترض وسبب الرفض إيه، ومواعيد الجلسات. أي سؤال عن علاج طبيعي أو جلسة أو طلب حجز أو سبب رفض ده تقريره.',
    parameters: {
      properties: {
        status: { type: 'STRING', description: 'PENDING أو APPROVED أو DECLINED، وسيبه فاضي لكل الطلبات' },
        branchId: { type: 'STRING', description: 'id الفرع، وسيبه فاضي لكل الفروع' }
      },
      required: []
    },
    async run(req, args) {
      const r = await callOwnApi(req, '/api/physio', { status: args.status || 'ALL', branchId: args.branchId });
      if (r.denied || r.error) return { ok: false, message: r.message || r.error };
      const list = Array.isArray(r.json) ? r.json : [];
      const byStatus = (s: string) => list.filter((b: any) => b.status === s);
      const row = (b: any) => ({
        member: b.member?.person?.name,
        memberCode: b.member?.memberCode,
        branch: b.branch?.name,
        sessionDate: b.requestedDate,
        note: b.note || null
      });
      return {
        ok: true,
        data: {
          totalRequests: list.length,
          pendingCount: byStatus('PENDING').length,
          approvedCount: byStatus('APPROVED').length,
          declinedCount: byStatus('DECLINED').length,
          pending: byStatus('PENDING').slice(0, 25).map((b: any) => row(b)),
          approved: byStatus('APPROVED').slice(0, 25).map((b: any) => ({
            ...row(b),
            priceEgp: b.pricePiasters === null ? null : b.pricePiasters / 100,
            decidedBy: b.decidedBy?.name || null
          })),
          declined: byStatus('DECLINED').slice(0, 25).map((b: any) => ({
            ...row(b),
            declineReason: b.declineReason || null
          }))
        }
      };
    }
  },
  {
    name: 'calculate',
    description:
      'بتحسب عملية حسابية واحدة وترجّع الناتج صح: جمع (+)، طرح (-)، ضرب (*)، قسمة (/)، نسبة (%). استخدمها قبل أي جمع أو طرح أو قسمة أو نسبة بدل ما تحسبها في دماغك، خصوصاً لو بتقارن رقمين من التقارير أو طلّعت فرق أو نسبة زيادة. اكتب expression فيها أرقام وعلامات بس زي "50000-32000" أو "(480-390)÷390×100".',
    parameters: {
      properties: {
        expression: { type: 'STRING', description: 'العملية نفسها: أرقام و+ - * / و% وأقواس' }
      },
      required: ['expression']
    },
    async run(_req, args) {
      const parsed = parseExpression(String(args?.expression ?? ''));
      if (!parsed) return { ok: false, message: 'الشكل ده مش عملية حسابية أفهمها' };
      return { ok: true, data: { expression: parsed.expression, result: parsed.value, currencyNote: 'نتج حسابي عادي، مش رقم من تقرير' } };
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
    `القاعدة الأولى وأهم قاعدة: أي رقم عن الجيم نفسه — عدد أعضاء أو حضور أو فلوس أو مقارنة أو حالة اشتراك — لازم تنادي أداة التقارير قبل ما تكتبه. ممنوع تطلب من المستخدم توضيح قبل ما تنادي أداة، وممنوع تخمّن أو تحسب أي رقم عن الجيم من عندك.`,
    `أي عملية حساب (جمع أو طرح أو ضرب أو قسمة أو نسبة أو فرق أو زيادة نصفة) نادى عليها calculate ومتحسبش في دماغك — حتى لو الأرقام جاتك من التقارير.`,
    `لو السؤال مالوش دعوة بداتا الجيم (تحية، معلومة عامة، نصايح، صياغة رسالة، حساب عددي عادي)، رد عليه على طول من غير ما تنادي أي تقرير، ومتقولش «مافيش تقرير بيغطي ده» — هو مش مطلوب من التقارير أصلاً.`,
    `لو السؤال عن حاجة المفروض تكون في النظام ومافيش أداة بتديدها، قول «مافيش تقرير بيغطي ده» وبس.`,
    `لو المستخدم نطق اسم فرع، ناديه على list_branches الأول خد الـ id الصحيح، ومتخمنش id خالص.`,
    `أي سؤال عن مدرب أو موظف أو شفت أو مين موجود في الجيم دلوقتي أو ساعات العمل → أداة staff_shifts (هي تقرير الموظفين)، ومتستعملش attendance_counts اللي هو حضور الأعضاء.`,
    `أي سؤال عن علاج طبيعي أو جلسة أو طلب حجز أو مين مستني رد أو سبب رفض أو سعر الجلسة → أداة physio_sessions، ومتستعملش تقارير الأعضاء بدلها.`,
    `لو السؤال عام زي «إيه حالة الجيم النهارده» أو «قولي ملخص»، نادى كل الأدوات اللي تلزم (أعضاء + حضور + اشتراكات + بيع + مصروفات) مرة واحدة في نفس الرد، وبعدين اعمل ملخص من الأرقام كلها.`,
    `لو قال «الشهر دا» أو «الشهر اللي فات» أو «النهارده»، احسب من وتاريخ بنفسك ونادي الأداة. اليوم الحالي ${new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })}.`,
    `مقارنة شهرين أو فرعين: ناديه على نفس الأداة مرتين (مرة لكل ناحية) في نفس الرد، وبعدين قارن بالأرقام اللي جاتلك وقول أنهي واحد أحسن وليه من الأرقام نفسها.`,
    `كل الفلوس اللي ترجع من financial_summary أو branch_comparison أو expenses_breakdown أو sales_check أو daily_journal أو physio_sessions هي بالجنيه المصري بالظبط (currency: EGP) — متقسمش في 100 ولا تضرب في أي حاجة.`,
    `لو الأداة رجعت denied، قول بصراحة «الحساب ده ماعندوش صلاحية للبيانات دي» ومتخمنش قيمتها.`,
    `لو السؤال عن فترة مالشهاش سجلات في النظام، متقلش «مافيش تقرير بيغطي ده» — قوله «النظام ماسجلش أي عمليات للفترة دي» وعدّي لغيرها من غير ما تخترع رقم.`,
    `متكتبش سطر «المصدر» بنفسك — الواجهة عرضة تحت الرد، واكتب الرد من غير أي اسم أداة أو اسم متغير إنجليزي.`,
    `اكتب كلام عادي بس: متحطش نجوم ولا markdown ولا بينات إنجليزية، والسطر القصير كفاية.`,
    `ممنوع تكتب أي رقم عن الجيم — عدد أو فلوس أو نسبة أو تاريخ حركة — إلا لو جاي حرفياً من رد أداة في السؤال ده. الرقم اللي مجاش من أداة امحي الجملة اللي فيه خالص.`,
    `خلي كل رقم بالأرقام (389) مش بالحروف، وخد كل رقم من التقرير اللي بيتكلم عنه بالظبط: عدد الأعضاء من members_census بس، والفلوس من التقارير المالية بس — متنقلش رقم من تقرير وتحطه في تقرير تاني.`,
    `لو السؤال تحية أو كلام عام مالوش دعوة بالداتا، رد بتحية دافية قصيرة على ${userName} من غير أداة — ومتخلطش التحية بحالة الجيم أو أرقام النهاردة، التحية كلام بس.`
  ].join('\n');
}

// Ordinary questions never touch the reports, so they go without any function declarations:
// fewer tokens in, no tool round, and the answer comes back in one call.
function generalInstruction(userName: string) {
  return [
    `انت مساعد ذكي لمدير جيم POWER 111، واللي بيسألك هو: ${userName} — ناديّه بالاسم ده بطريقة طبيعية، مرة واحدة كفاية.`,
    `السؤال ده مالوش دعوة بتقارير النظام، فمفيش أدوات متاحة دلوقتي — رد عليه من معلوماتك عادي كأنك زميل شاطر: معلومة، نصايح، صياغة رسالة أو إعلان، شرح حاجة، أو حساب عددي.`,
    `لو الحساب العددي محتاج جمع أو طرح أو ضرب أو قسمة أو نسبة، احسب صح واتأكد من الناتج، واورّي السطر اللي وصلت بيه لو السؤال طلب كده.`,
    `لو طلع السؤال في الحقيقة عايز أرقام من جيم POWER 111 (عدد أعضاء، حضور، فلوس، اشتراكات…)، متختَرعش أي رقم ومتقولش رقم قاله تقرير — اعتذر بكلمتين وقوله يسألك عن التقارير مباشرة.`,
    `بتتكلم عربي مصري بسيط ومختصر، وفرفوش خفيف الظل: كلمة لطيفة في الأول أو الآخر، ومتطولش.`,
    `من غير إيموجي خالص، ومن غير نجوم ولا markdown ولا بينات إنجليزية — كلام عادي بس، والسطر القصير كفاية.`,
    `لو الرد فيه أرقام، خليها بالأرقام (389) مش بالحروف.`
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

// Every assistant endpoint is behind its own permission, so an account that was not given
// the reader cannot reach it by typing the URL either.
router.get('/status', requireAuth, requirePermission('USE_ASSISTANT'), (_req: Request, res: Response) => {
  res.json({ success: true, enabled: Boolean(process.env.GEMINI_API_KEY), model: GEMINI_MODEL });
});

// The journal of what this account asked and what the reports answered.
router.get('/history', requireAuth, requirePermission('USE_ASSISTANT'), async (req: Request, res: Response) => {
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
router.delete('/history', requireAuth, requirePermission('USE_ASSISTANT'), async (req: Request, res: Response) => {
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

router.post('/ask', requireAuth, requirePermission('USE_ASSISTANT'), async (req: Request, res: Response) => {
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
  // Every number the server-side calculator produced on this question. A figure that is
  // one of these is arithmetic we did ourselves, not a report the model imagined.
  const calculatedNumbers: string[] = [];
  let forceToolsNextRound = false;
  // Report tools only ride along when the question could be about the club's own records.
  // Ordinary talk answers in a single round trip with no declarations in the prompt at all.
  const useTools = mentionsClubData(question);
  const unverifiedAnswerLine = `معلش يا ${address}، معرفتش أقرأ الأرقام دي من التقارير دلوقتي — ومش هقول رقم النظام ماطلعوش. اسألني عن حضور النهاردة أو البيع أو الاشتراكات وهجيبهولك من التقارير نفسها.`;

  // The invented-number rule in one place: a figure about the club needs a report behind
  // it, unless it is only arithmetic the calculator itself just did. Questions the words
  // alone put outside the club's records answer in one round with no gate — whether a digit
  // is a club figure is settled by the question, and the model has no report to fake here.
  const figuresUnverified = (text: string) => useTools
    && /\d/.test(text) && readReports === 0 && !everyFigureCalculated(text, calculatedNumbers);

  // The UI renders the source badges itself, and the model likes to repeat them in
  // plain text with the raw tool names, so the trailing line is dropped here.
  // The bubble is plain text, so the markdown it sometimes answers in is flattened too.
  const spokenText = (parts: any[]) => parts.filter(p => !p.functionCall).map(p => p.text).filter(Boolean).join('\n')
    .replace(/\*\*(.+?)\*\*/gu, '$1')
    .replace(/^\s*[*•-]\s+/gmu, '• ')
    .replace(/\n*المصدر:.*$/u, '')
    .trim();

  // The lite model keeps answering "مافيش تقرير بيغطي ده" — the exact phrasing he told me to
  // drop — whenever a question has no records behind it. The fact is right, the line isn't,
  // so it is replaced on the way out with one that says what actually happened.
  const noRecordsLine = `النظام ماسجلش أي عمليات للفترة اللي سألت عنها، فمفيش رقم أقدر قولهولك. اسألني عن النهاردة أو الشهر دا وهقراه من التقارير نفسها.`;
  const saysNoRecords = (text: string) => /تقر/.test(text) && /(فيش|متغطي|موجودش|لا يوجد|مش متاح)/.test(text);

  const reply = (answer: string) => {
    const clean = saysNoRecords(answer) ? noRecordsLine : answer;
    createAuditLog(sessionUser.id, 'assistant.ask', 'Assistant', undefined, sessionUser.branchIds?.[0], {
      question,
      answer: clean.slice(0, 1200),
      tools: usedTools.map(t => t.name)
    }).catch(() => {});
    res.json({ success: true, answer: clean, tools: usedTools });
  };

  // A message that is nothing but a calculation answers on the spot: no model call, so it
  // is instant, and the number is one this server counted rather than one it guessed.
  const calc = arithmeticOnly(question);
  if (calc) {
    return reply(`اتفضل يا ${address}، الناتج ${showNumber(calc.value)} — دي حاسبة من النظام حسبت «${calc.expression}».`);
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const out = await callGemini(apiKey, {
        contents,
        systemInstruction: { parts: [{ text: useTools ? systemInstruction(address) : generalInstruction(address) }] },
        ...(useTools && {
          tools: [{ functionDeclarations: declarations }],
          toolConfig: { functionCallingConfig: { mode: forceToolsNextRound ? 'ANY' : 'AUTO' } }
        })
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
        // It answered with system figures but never read a report — that text is invented.
        // Send the same question back with the tools forced on, and if even that comes up
        // empty, say so plainly instead of shipping figures he'd act on. Numbers that are
        // only the calculator's own arithmetic are fine, that is what he asked for.
        if (figuresUnverified(text)) {
          if (!forceToolsNextRound && round + 1 < MAX_TOOL_ROUNDS) {
            forceToolsNextRound = true;
            contents.push({ role: 'user', parts: [{ text: 'كتبت أرقام عن الجيم من غير ما تنادي أي أداة تقارير، وده ممنوع. نادي الأدوات اللي تجيب الكلام ده، وارّد من اللي يرجعلك بس.' }] });
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
        // The calculator is arithmetic, not a report, so it never clears the invented-number
        // gate by itself — only the figures it actually printed can do that.
        if (result.ok && fc.name === 'calculate') {
          calculatedNumbers.push(String(result.data?.result), showNumber(result.data?.result));
          String(result.data?.expression || '').split(/[^\d.]+/u).forEach(token => {
            if (token) calculatedNumbers.push(token);
          });
        } else if (result.ok) {
          readReports++;
        }
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
      systemInstruction: { parts: [{ text: useTools ? systemInstruction(address) : generalInstruction(address) }] },
      ...(useTools && {
        tools: [{ functionDeclarations: declarations }],
        toolConfig: { functionCallingConfig: { mode: 'NONE' } }
      })
    });
    const forcedAnswer = forced.error ? '' : spokenText(forced.json?.candidates?.[0]?.content?.parts || []);
    if (forcedAnswer && !figuresUnverified(forcedAnswer)) return reply(forcedAnswer);

    if (forcedAnswer && figuresUnverified(forcedAnswer)) return reply(unverifiedAnswerLine);

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
