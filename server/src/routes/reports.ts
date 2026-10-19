import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { userHasPermission } from '../utils/permissions.js';

const router = Router();

// Financial summary
router.get('/financial', requireAuth, requirePermission('VIEW_FINANCIAL_REPORTS'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { branchId, from, to } = req.query;

    let branchFilter: any = {};
    if (sessionUser.role !== 'OWNER') {
      branchFilter = { id: { in: sessionUser.branchIds } };
    } else if (branchId) {
      branchFilter = { id: branchId as string };
    }

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from as string);
    if (to) {
      const toDate = new Date(to as string);
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      toDate.setUTCMilliseconds(toDate.getUTCMilliseconds() - 1);
      dateFilter.lt = toDate;
    }

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
      select: { pricePiasters: true, paidPiasters: true }
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

    let branchFilter: any = {};
    if (sessionUser.role !== 'OWNER') {
      branchFilter = { id: { in: sessionUser.branchIds } };
    } else if (branchId) {
      branchFilter = { id: branchId as string };
    }

    const where: any = {};
    if (Object.keys(branchFilter).length > 0) where.branch = branchFilter;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from as string);
      if (to) {
        const toDate = new Date(to as string);
        toDate.setUTCDate(toDate.getUTCDate() + 1);
        toDate.setUTCMilliseconds(toDate.getUTCMilliseconds() - 1);
        where.createdAt.lte = toDate;
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { name: true, nameAr: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(sales);
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

    let branchFilter: any = {};
    if (sessionUser.role !== 'OWNER') {
      branchFilter = { id: { in: sessionUser.branchIds } };
    } else if (branchId) {
      branchFilter = { id: branchId as string };
    }

    const where: any = {};
    if (Object.keys(branchFilter).length > 0) where.branch = branchFilter;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from as string);
      if (to) {
        const toDate = new Date(to as string);
        toDate.setUTCDate(toDate.getUTCDate() + 1);
        toDate.setUTCMilliseconds(toDate.getUTCMilliseconds() - 1);
        where.date.lte = toDate;
      }
    }
    if (category) {
      where.category = category as string;
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } }
      },
      orderBy: { date: 'desc' }
    });

    // Group by category
    const byCategory: any = {};
    expenses.forEach(e => {
      if (!byCategory[e.category]) {
        byCategory[e.category] = { count: 0, total: 0 };
      }
      byCategory[e.category].count++;
      byCategory[e.category].total += e.amountPiasters;
    });

    res.json({
      expenses,
      byCategory,
      total: expenses.reduce((sum, e) => sum + e.amountPiasters, 0)
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

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from as string);
    if (to) {
      const toDate = new Date(to as string);
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      toDate.setUTCMilliseconds(toDate.getUTCMilliseconds() - 1);
      dateFilter.lt = toDate;
    }

    const branches = await prisma.branch.findMany({
      where: Object.keys(branchFilter).length > 0 ? branchFilter : {},
      select: {
        id: true,
        name: true,
        code: true
      }
    });

    const [canRevenue, canExpenses, canProfit, canOutstanding] = await Promise.all([
      userHasPermission(sessionUser.id, 'VIEW_DASHBOARD_REVENUE'),
      userHasPermission(sessionUser.id, 'VIEW_DASHBOARD_EXPENSES'),
      userHasPermission(sessionUser.id, 'VIEW_DASHBOARD_PROFIT'),
      userHasPermission(sessionUser.id, 'VIEW_DASHBOARD_OUTSTANDING')
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
        prisma.member.count({
          where: { branchId: branch.id, status: 'ACTIVE' }
        }),
        prisma.subscription.count({
          where: {
            branchId: branch.id,
            status: 'ACTIVE',
            endDate: { gte: new Date() }
          }
        }),
        prisma.subscription.findMany({
          where: { branchId: branch.id, status: 'ACTIVE' },
          select: { pricePiasters: true, paidPiasters: true }
        })
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
        activeMembers: members,
        activeSubscriptions
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

    const branchFilter: any = {};
    if (sessionUser.role !== 'OWNER') {
      branchFilter.id = { in: sessionUser.branchIds };
    } else if (branchId) {
      branchFilter.id = branchId as string;
    }
    const scoped = Object.keys(branchFilter).length > 0;

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from as string);
    if (to) {
      const toDate = new Date(to as string);
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      toDate.setUTCMilliseconds(toDate.getUTCMilliseconds() - 1);
      dateFilter.lt = toDate;
    }
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

export default router;
