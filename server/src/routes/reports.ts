import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { userHasPermission } from '../utils/permissions.js';
import { parseDate } from '../utils/money.js';

const router = Router();

// A report with no dates used to read every row the club has ever written, and one request
// could outgrow the server's memory. The lists are capped and say so; the money totals keep
// coming from aggregate queries, so a capped list never reports a smaller number than the truth.
const REPORT_ROWS_LIMIT = 5000;
// Outstanding balances are read row by row because "what is left" is not something SQL can
// sum; a club this size stays far under the ceiling.
const SUBSCRIPTION_SCAN_LIMIT = 50000;

// Both dates are optional and come from the browser, so a bad value is ignored rather than
// handed to Prisma (which would throw and turn the report into a 500).
function rangeFilter(from: unknown, to: unknown): any {
  const filter: any = {};
  const start = parseDate(from);
  if (start) filter.gte = start;
  const end = parseDate(to);
  if (end) {
    end.setUTCDate(end.getUTCDate() + 1);
    end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
    filter.lt = end;
  }
  return filter;
}

// An employee only ever reports on the branches they belong to; the owner may narrow to one.
function scopeBranch(sessionUser: any, branchId: unknown): any {
  if (sessionUser.role !== 'OWNER') return { id: { in: sessionUser.branchIds } };
  return typeof branchId === 'string' && branchId ? { id: branchId } : {};
}

// Financial summary
router.get('/financial', requireAuth, requirePermission('VIEW_FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { branchId, from, to } = req.query;

    const branchFilter = scopeBranch(sessionUser, branchId);

    const dateFilter = rangeFilter(from, to);

    // Sales revenue
    const salesWhere: any = {};
    if (Object.keys(branchFilter).length > 0) salesWhere.branch = branchFilter;
    if (Object.keys(dateFilter).length > 0) salesWhere.createdAt = dateFilter;

    const salesTotal = await prisma.sale.aggregate({
      where: salesWhere,
      _sum: { finalTotalPiasters: true },
      _count: true
    });

    // Expenses
    const expensesWhere: any = {};
    if (Object.keys(branchFilter).length > 0) expensesWhere.branch = branchFilter;
    if (Object.keys(dateFilter).length > 0) expensesWhere.date = dateFilter;

    const expensesTotal = await prisma.expense.aggregate({
      where: expensesWhere,
      _sum: { amountPiasters: true },
      _count: true
    });

    // Subscription payments
    const paymentsWhere: any = {};
    if (Object.keys(branchFilter).length > 0) paymentsWhere.branch = branchFilter;
    if (Object.keys(dateFilter).length > 0) paymentsWhere.createdAt = dateFilter;

    const paymentsTotal = await prisma.payment.aggregate({
      where: paymentsWhere,
      _sum: { amountPiasters: true },
      _count: true
    });

    const revenue = (salesTotal._sum.finalTotalPiasters || 0) + (paymentsTotal._sum.amountPiasters || 0);
    const expenses = expensesTotal._sum.amountPiasters || 0;
    const profit = revenue - expenses;

    // Outstanding receivables: total price minus total paid across all active subscriptions
    const outstandingWhere: any = { status: 'ACTIVE' };
    if (Object.keys(branchFilter).length > 0) outstandingWhere.branch = branchFilter;
    const subscriptions = await prisma.subscription.findMany({
      where: outstandingWhere,
      select: { pricePiasters: true, paidPiasters: true },
      take: SUBSCRIPTION_SCAN_LIMIT
    });
    const outstanding = subscriptions.reduce((sum, s) => sum + Math.max(0, s.pricePiasters - s.paidPiasters), 0);

    res.json({
      revenue,
      expenses,
      profit,
      outstanding,
      salesCount: salesTotal._count,
      expensesCount: expensesTotal._count,
      paymentsCount: paymentsTotal._count
    });
  } catch (error) {
    console.error('Error fetching financial report:', error);
    res.status(500).json({ error: 'Failed to fetch financial report' });
  }
});

// Sales report
router.get('/sales', requireAuth, requirePermission('VIEW_REPORTS'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { branchId, from, to } = req.query;

    const branchFilter = scopeBranch(sessionUser, branchId);

    const where: any = {};
    if (Object.keys(branchFilter).length > 0) where.branch = branchFilter;
    const dateFilter = rangeFilter(from, to);
    if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter;

    const [found, aggregate] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { name: true, nameAr: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: REPORT_ROWS_LIMIT + 1
      }),
      prisma.sale.aggregate({
        where,
        _count: true,
        _sum: { finalTotalPiasters: true }
      })
    ]);

    const truncated = found.length > REPORT_ROWS_LIMIT;
    res.json({
      sales: truncated ? found.slice(0, REPORT_ROWS_LIMIT) : found,
      count: aggregate._count,
      totalPiasters: aggregate._sum.finalTotalPiasters || 0,
      truncated,
      limit: REPORT_ROWS_LIMIT
    });
  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).json({ error: 'Failed to fetch sales report' });
  }
});

// Expenses report
router.get('/expenses', requireAuth, requirePermission('VIEW_REPORTS'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { branchId, from, to, category } = req.query;

    const branchFilter = scopeBranch(sessionUser, branchId);

    const where: any = {};
    if (Object.keys(branchFilter).length > 0) where.branch = branchFilter;
    const dateFilter = rangeFilter(from, to);
    if (Object.keys(dateFilter).length > 0) where.date = dateFilter;
    if (typeof category === 'string' && category) {
      where.category = category;
    }

    const [found, grouped] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true } }
        },
        orderBy: { date: 'desc' },
        take: REPORT_ROWS_LIMIT + 1
      }),
      prisma.expense.groupBy({
        by: ['category'],
        where,
        _count: true,
        _sum: { amountPiasters: true }
      })
    ]);

    const truncated = found.length > REPORT_ROWS_LIMIT;
    const expenses = truncated ? found.slice(0, REPORT_ROWS_LIMIT) : found;

    // The category totals come from the database over every row in the range, so a long
    // period still adds up correctly even when the list below it stops at the limit.
    const byCategory: Record<string, { count: number; total: number }> = {};
    let total = 0;
    for (const row of grouped) {
      const sum = row._sum.amountPiasters || 0;
      byCategory[row.category] = { count: row._count, total: sum };
      total += sum;
    }

    res.json({
      expenses,
      byCategory,
      total,
      count: grouped.reduce((sum, row) => sum + row._count, 0),
      truncated,
      limit: REPORT_ROWS_LIMIT
    });
  } catch (error) {
    console.error('Error fetching expenses report:', error);
    res.status(500).json({ error: 'Failed to fetch expenses report' });
  }
});

// Branch comparison
router.get('/branches', requireAuth, requirePermission('VIEW_DASHBOARD'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { from, to } = req.query;

    let branchFilter: any = {};
    if (sessionUser.role !== 'OWNER') {
      branchFilter = { id: { in: sessionUser.branchIds } };
    }

    const dateFilter = rangeFilter(from, to);

    const branches = await prisma.branch.findMany({
      where: Object.keys(branchFilter).length > 0 ? branchFilter : {},
      select: {
        id: true,
        name: true,
        code: true
      }
    });

    const [canRevenue, canExpenses, canProfit, canOutstanding, canMemberStats] = await Promise.all([
      userHasPermission(sessionUser.id, 'VIEW_DASHBOARD_REVENUE'),
      userHasPermission(sessionUser.id, 'VIEW_DASHBOARD_EXPENSES'),
      userHasPermission(sessionUser.id, 'VIEW_DASHBOARD_PROFIT'),
      userHasPermission(sessionUser.id, 'VIEW_DASHBOARD_OUTSTANDING'),
      userHasPermission(sessionUser.id, 'VIEW_MEMBER_STATS')
    ]);

    const branchStats = await Promise.all(branches.map(async (branch) => {
      const salesWhere: any = { branchId: branch.id };
      const expensesWhere: any = { branchId: branch.id };
      const paymentsWhere: any = { branchId: branch.id };

      if (Object.keys(dateFilter).length > 0) {
        salesWhere.createdAt = dateFilter;
        expensesWhere.date = dateFilter;
        paymentsWhere.createdAt = dateFilter;
      }

      const [sales, expenses, payments, members, activeSubscriptions, outstandingSubs] = await Promise.all([
        prisma.sale.aggregate({
          where: salesWhere,
          _sum: { finalTotalPiasters: true },
          _count: true
        }),
        prisma.expense.aggregate({
          where: expensesWhere,
          _sum: { amountPiasters: true },
          _count: true
        }),
        prisma.payment.aggregate({
          where: paymentsWhere,
          _sum: { amountPiasters: true },
          _count: true
        }),
        // No census permission → the count query never runs, so it can't leak in a response
        // or cost the page time. How many subscriptions are live is the same kind of club
        // total as how many members are, so it follows the same permission.
        canMemberStats
          ? prisma.member.count({ where: { branchId: branch.id, status: 'ACTIVE' } })
          : Promise.resolve(null),
        canMemberStats
          ? prisma.subscription.count({
              where: {
                branchId: branch.id,
                status: 'ACTIVE',
                endDate: { gte: new Date() }
              }
            })
          : Promise.resolve(null),
        // The live balance is read row by row, and only the outstanding card uses it, so
        // an account that cannot see it does not pay for reading every subscription.
        canOutstanding
          ? prisma.subscription.findMany({
              where: { branchId: branch.id, status: 'ACTIVE' },
              select: { pricePiasters: true, paidPiasters: true },
              take: SUBSCRIPTION_SCAN_LIMIT
            })
          : Promise.resolve([] as { pricePiasters: number; paidPiasters: number }[])
      ]);

      const revenue = (sales._sum.finalTotalPiasters || 0) + (payments._sum.amountPiasters || 0);
      const expensesTotal = expenses._sum.amountPiasters || 0;
      const outstanding = outstandingSubs.reduce((sum, s) => sum + Math.max(0, s.pricePiasters - s.paidPiasters), 0);

      return {
        branch,
        ...(canRevenue ? { revenue } : {}),
        ...(canExpenses ? { expenses: expensesTotal } : {}),
        ...(canProfit ? { profit: revenue - expensesTotal } : {}),
        ...(canOutstanding ? { outstanding } : {}),
        salesCount: sales._count,
        expensesCount: expenses._count,
        paymentsCount: payments._count,
        ...(canMemberStats ? { activeSubscriptions } : {}),
        ...(canMemberStats ? { activeMembers: members } : {})
      };
    }));

    res.json(branchStats);
  } catch (error) {
    console.error('Error fetching branch comparison:', error);
    res.status(500).json({ error: 'Failed to fetch branch comparison' });
  }
});

// One journal for the whole club: every sale, subscription payment, expense, salary
// payout, new member and visit in the chosen range, newest first.
const ACTIVITY_LIMIT = 800;
// A member import or a busy door can produce over a thousand rows of one kind, and the
// journal is read for money first. The bulk kinds get a smaller share of the list while
// their exact totals still come from the count queries below.
const ACTIVITY_BULK_LIMIT = 200;

const checkInMethodLabels: Record<string, string> = {
  MANUAL: 'يدوي',
  QR_CODE: 'كيو آر',
  BARCODE: 'باركود',
  OFFLINE_SYNC: 'بدون إنترنت'
};

// The gym runs on Cairo time, but the server clock may be UTC, so an Arabic day
// name is only right when it is formatted against the club's own timezone.
function arActivityDay(value: Date): string {
  return value.toLocaleDateString('ar-EG-u-nu-latn', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Cairo'
  });
}

router.get('/activity', requireAuth, requirePermission('VIEW_REPORTS'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { branchId, from, to } = req.query;

    const branchFilter = scopeBranch(sessionUser, branchId);
    const scoped = Object.keys(branchFilter).length > 0;

    const dateFilter = rangeFilter(from, to);
    const dated = Object.keys(dateFilter).length > 0;

    const branchWhere = scoped ? { branch: branchFilter } : {};

    const salesWhere: any = { ...branchWhere };
    if (dated) salesWhere.createdAt = dateFilter;
    const paymentsWhere: any = { ...branchWhere };
    if (dated) paymentsWhere.createdAt = dateFilter;
    const expensesWhere: any = { ...branchWhere };
    if (dated) expensesWhere.date = dateFilter;
    const salaryWhere: any = { ...branchWhere };
    if (dated) salaryWhere.createdAt = dateFilter;
    const membersWhere: any = { ...branchWhere };
    if (dated) membersWhere.createdAt = dateFilter;
    const visitsWhere: any = { ...branchWhere };
    if (dated) visitsWhere.checkInTime = dateFilter;

    // A payroll payout already books its own expense row, so the journal shows the salary
    // once and keeps the mirrored expense out — otherwise the same money leaves twice.
    const salaryExpenseIds = (
      await prisma.salaryPayment.findMany({ where: salaryWhere, select: { expenseId: true } })
    ).map(row => row.expenseId).filter((id): id is string => Boolean(id));
    if (salaryExpenseIds.length) {
      expensesWhere.NOT = { id: { in: salaryExpenseIds } };
    }

    const [
      sales, payments, expenses, salaries, newMembers, visits,
      salesAgg, paymentsAgg, expensesAgg, salariesAgg, memberCount, visitCount
    ] = await Promise.all([
      prisma.sale.findMany({
        where: salesWhere,
        orderBy: { createdAt: 'desc' },
        take: ACTIVITY_LIMIT,
        select: {
          id: true,
          invoiceNumber: true,
          finalTotalPiasters: true,
          paymentMethod: true,
          createdAt: true,
          branch: { select: { name: true } },
          items: { take: 2, select: { quantity: true, product: { select: { name: true, nameAr: true } } } },
          _count: { select: { items: true } }
        }
      }),
      prisma.payment.findMany({
        where: paymentsWhere,
        orderBy: { createdAt: 'desc' },
        take: ACTIVITY_LIMIT,
        select: {
          id: true,
          amountPiasters: true,
          method: true,
          notes: true,
          createdAt: true,
          branch: { select: { name: true } },
          subscription: {
            select: {
              createdAt: true,
              plan: { select: { name: true, nameAr: true } },
              member: { select: { id: true, person: { select: { name: true } } } }
            }
          }
        }
      }),
      prisma.expense.findMany({
        where: expensesWhere,
        orderBy: { date: 'desc' },
        take: ACTIVITY_LIMIT,
        select: {
          id: true,
          category: true,
          description: true,
          amountPiasters: true,
          date: true,
          branch: { select: { name: true } }
        }
      }),
      prisma.salaryPayment.findMany({
        where: salaryWhere,
        orderBy: { createdAt: 'desc' },
        take: ACTIVITY_LIMIT,
        select: {
          id: true,
          amountPiasters: true,
          periodStart: true,
          periodEnd: true,
          paymentMethod: true,
          createdAt: true,
          branch: { select: { name: true } },
          user: { select: { name: true } }
        }
      }),
      prisma.member.findMany({
        where: membersWhere,
        orderBy: { createdAt: 'desc' },
        take: ACTIVITY_BULK_LIMIT,
        select: {
          id: true,
          memberCode: true,
          createdAt: true,
          branch: { select: { name: true } },
          person: { select: { name: true } }
        }
      }),
      prisma.attendance.findMany({
        where: visitsWhere,
        orderBy: { checkInTime: 'desc' },
        take: ACTIVITY_BULK_LIMIT,
        select: {
          id: true,
          checkInTime: true,
          method: true,
          flagged: true,
          branch: { select: { name: true } },
          member: { select: { person: { select: { name: true } } } }
        }
      }),
      prisma.sale.aggregate({ where: salesWhere, _sum: { finalTotalPiasters: true }, _count: true }),
      prisma.payment.aggregate({ where: paymentsWhere, _sum: { amountPiasters: true }, _count: true }),
      prisma.expense.aggregate({ where: expensesWhere, _sum: { amountPiasters: true }, _count: true }),
      prisma.salaryPayment.aggregate({ where: salaryWhere, _sum: { amountPiasters: true }, _count: true }),
      prisma.member.count({ where: membersWhere }),
      prisma.attendance.count({ where: visitsWhere })
    ]);

    // A renewal is a payment from a member who already had a plan before this one — the
    // renew flow opens a fresh subscription row, so counting the member's plans is what
    // separates "جدد" from a first-time "اشتراك".
    const payingMemberIds = [...new Set(payments.map(p => p.subscription.member.id))];
    const memberPlanCounts = payingMemberIds.length
      ? await prisma.subscription.groupBy({
          by: ['memberId'],
          where: { memberId: { in: payingMemberIds } },
          _count: { _all: true }
        })
      : [];
    const plansPerMember = new Map(memberPlanCounts.map(g => [g.memberId, g._count._all]));

    const items: any[] = [
      ...sales.map(s => ({
        id: s.id,
        kind: 'SALE',
        at: s.createdAt,
        title: `فاتورة ${s.invoiceNumber}`,
        subtitle: `${s._count.items} منتج — ` +
          s.items.map(i => `${i.product.nameAr || i.product.name} ×${i.quantity}`).join(' • ') +
          (s._count.items > s.items.length ? ' …' : ''),
        amountPiasters: s.finalTotalPiasters,
        method: s.paymentMethod,
        branchName: s.branch.name
      })),
      ...payments.map(p => {
        const planName = p.subscription.plan.nameAr || p.subscription.plan.name;
        const renewed = (plansPerMember.get(p.subscription.member.id) || 1) > 1
          || (p.notes || '').includes('تجديد');
        return {
          id: p.id,
          kind: 'PAYMENT',
          at: p.createdAt,
          title: p.subscription.member.person.name,
          subtitle: `${renewed ? 'تجديد' : 'اشتراك جديد'} — ${planName}`,
          amountPiasters: p.amountPiasters,
          method: p.method,
          branchName: p.branch.name
        };
      }),
      ...expenses.map(e => ({
        id: e.id,
        kind: 'EXPENSE',
        at: e.date,
        title: e.description || e.category,
        subtitle: `مصروف — ${e.category}`,
        amountPiasters: e.amountPiasters,
        branchName: e.branch.name
      })),
      ...salaries.map(s => ({
        id: s.id,
        kind: 'SALARY',
        at: s.createdAt,
        title: `مرتّب ${s.user.name}`,
        subtitle: `عن ${arActivityDay(s.periodStart)} ← ${arActivityDay(s.periodEnd)}`,
        amountPiasters: s.amountPiasters,
        method: s.paymentMethod,
        branchName: s.branch.name
      })),
      ...newMembers.map(m => ({
        id: m.id,
        kind: 'MEMBER',
        at: m.createdAt,
        title: m.person.name,
        subtitle: `عضو جديد • ${m.memberCode}`,
        amountPiasters: null,
        branchName: m.branch.name
      })),
      ...visits.map(v => ({
        id: v.id,
        kind: 'CHECKIN',
        at: v.checkInTime,
        title: v.member.person.name,
        subtitle: `دخول الجيم — تسجيل ${checkInMethodLabels[v.method] || v.method}`,
        amountPiasters: null,
        flagged: v.flagged,
        branchName: v.branch.name
      }))
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const income =
      (salesAgg._sum.finalTotalPiasters || 0) + (paymentsAgg._sum.amountPiasters || 0);
    const outflow =
      (expensesAgg._sum.amountPiasters || 0) + (salariesAgg._sum.amountPiasters || 0);

    res.json({
      success: true,
      limit: ACTIVITY_LIMIT,
      truncated: items.length > ACTIVITY_LIMIT,
      items: items.slice(0, ACTIVITY_LIMIT),
      summary: {
        incomePiasters: income,
        outflowPiasters: outflow,
        netPiasters: income - outflow,
        counts: {
          SALE: salesAgg._count,
          PAYMENT: paymentsAgg._count,
          EXPENSE: expensesAgg._count,
          SALARY: salariesAgg._count,
          MEMBER: memberCount,
          CHECKIN: visitCount
        },
        // how many of each kind survived the cap, so the list header can say so
        listed: {
          SALE: sales.length,
          PAYMENT: payments.length,
          EXPENSE: expenses.length,
          SALARY: salaries.length,
          MEMBER: newMembers.length,
          CHECKIN: visits.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching activity report:', error);
    res.status(500).json({ error: 'Failed to fetch activity report' });
  }
});

// Member growth per month (real registrations, cumulative) plus the live plan mix,
// so the dashboard's growth bars and plan donut never show an invented curve.
const GROWTH_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

router.get('/growth', requireAuth, requirePermission('VIEW_DASHBOARD'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { branchId } = req.query;

    let branchFilter: any = {};
    if (sessionUser.role !== 'OWNER') {
      branchFilter = { id: { in: sessionUser.branchIds } };
    } else if (branchId) {
      branchFilter = { id: branchId as string };
    }
    const memberWhere: any = Object.keys(branchFilter).length > 0 ? { branch: branchFilter } : {};
    const subscriptionWhere: any = Object.keys(branchFilter).length > 0 ? { branch: branchFilter } : {};

    const monthsBack = 10;
    const now = new Date();
    const buckets: { key: string; label: string; newMembers: number; cumulative: number }[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${start.getFullYear()}-${start.getMonth()}`,
        label: GROWTH_MONTHS[start.getMonth()],
        newMembers: 0,
        cumulative: 0
      });
    }
    const firstBucketStart = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

    // The cumulative column of this report is the club's member total, so the whole member
    // table is only read for accounts allowed to see it.
    const canMemberStats = await userHasPermission(sessionUser.id, 'VIEW_MEMBER_STATS');

    const [registrations, planGroups] = await Promise.all([
      canMemberStats
        ? prisma.member.findMany({ where: memberWhere, select: { createdAt: true } })
        : Promise.resolve([] as { createdAt: Date }[]),
      // How the live subscriptions split across the plans is a member-scale figure too,
      // so the desk that cannot count them does not read them either.
      canMemberStats
        ? prisma.subscription.groupBy({
            by: ['planId'],
            where: { ...subscriptionWhere, status: 'ACTIVE', endDate: { gte: new Date() } },
            _count: { _all: true }
          })
        : Promise.resolve([] as { planId: string; _count: { _all: number } }[])
    ]);

    let beforeWindow = 0;
    const perMonth = new Map<string, number>();
    for (const row of registrations) {
      const at = new Date(row.createdAt);
      if (at < firstBucketStart) { beforeWindow++; continue; }
      const key = `${at.getFullYear()}-${at.getMonth()}`;
      perMonth.set(key, (perMonth.get(key) || 0) + 1);
    }
    let running = beforeWindow;
    for (const bucket of buckets) {
      bucket.newMembers = perMonth.get(bucket.key) || 0;
      running += bucket.newMembers;
      bucket.cumulative = running;
    }

    const planIds = planGroups.map(g => g.planId);
    const plans = planIds.length
      ? await prisma.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true, nameAr: true } })
      : [];
    const planNames = new Map(plans.map(p => [p.id, p.nameAr || p.name]));

    res.json({
      success: true,
      // Without the census permission the member columns are absent rather than zero, so no
      // screen can draw a fake flat line.
      months: buckets.map(({ key, label, newMembers, cumulative }) => ({
        key,
        label,
        ...(canMemberStats ? { newMembers, cumulative } : {})
      })),
      plans: planGroups
        .map(g => ({ name: planNames.get(g.planId) || 'باقة', count: g._count._all }))
        .sort((a, b) => b.count - a.count)
    });
  } catch (error) {
    console.error('Error fetching growth report:', error);
    res.status(500).json({ error: 'Failed to fetch growth report' });
  }
});

export default router;
