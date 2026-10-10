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

export default router;
