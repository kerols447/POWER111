import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { parseDate, piasters } from '../utils/money.js';

const router = Router();

// The list on screen is a window; the Excel export in exports.ts carries the whole range.
const MAX_EXPENSE_ROWS = 1000;

router.get('/', requireAuth, requirePermission('VIEW_EXPENSES'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { branchId, category, from, to, search } = req.query;

    let branchFilter: any = {};
    if (sessionUser.role !== 'OWNER') {
      const accessibleBranchIds = sessionUser.branchIds;
      if (branchId && accessibleBranchIds.includes(branchId as string)) {
        branchFilter = { id: branchId as string };
      } else {
        branchFilter = { id: { in: accessibleBranchIds } };
      }
    } else if (branchId) {
      branchFilter = { id: branchId as string };
    }

    const where: any = {};
    if (Object.keys(branchFilter).length > 0) {
      where.branch = branchFilter;
    }
    if (category) {
      where.category = category as string;
    }
    if (from || to) {
      // An unparsable date must not reach Postgres as an Invalid Date.
      const range: any = {};
      const fromDate = from ? new Date(from as string) : null;
      const toDate = to ? new Date(to as string) : null;
      if (fromDate && !Number.isNaN(fromDate.getTime())) range.gte = fromDate;
      if (toDate && !Number.isNaN(toDate.getTime())) range.lte = toDate;
      if (Object.keys(range).length > 0) where.date = range;
    }
    if (search) {
      where.description = { contains: search as string, mode: 'insensitive' };
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } }
      },
      orderBy: { date: 'desc' },
      take: MAX_EXPENSE_ROWS
    });

    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

router.get('/categories', requireAuth, requirePermission('VIEW_EXPENSES'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;

    let branchFilter: any = {};
    if (sessionUser.role !== 'OWNER') {
      branchFilter = { id: { in: sessionUser.branchIds } };
    }

    const expenses = await prisma.expense.findMany({
      where: Object.keys(branchFilter).length > 0 ? { branch: branchFilter } : {},
      select: { category: true },
      distinct: ['category']
    });

    const categories = expenses.map(e => e.category);
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/', requireAuth, requirePermission('CREATE_EXPENSES'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { branchId, category, description, amountPiasters, date } = req.body;

    if (!branchId || !category || !description || amountPiasters === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (sessionUser.role !== 'OWNER' && !sessionUser.branchIds.includes(branchId)) {
      return res.status(403).json({ error: 'Access denied to this branch' });
    }

    const amount = piasters(amountPiasters);
    if (amount === null) {
      return res.status(400).json({ error: 'Validation error', message: 'المبلغ غير صحيح' });
    }

    const expense = await prisma.expense.create({
      data: {
        branchId,
        category: String(category).slice(0, 60),
        description: String(description).slice(0, 500),
        amountPiasters: amount,
        date: parseDate(date) ?? new Date(),
        createdBy: sessionUser.id
      },
      include: {
        branch: { select: { id: true, name: true } }
      }
    });

    res.status(201).json(expense);
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

router.put('/:id', requireAuth, requirePermission('EDIT_EXPENSES'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { id } = req.params;
    const { category, description, amountPiasters, date } = req.body;

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (sessionUser.role !== 'OWNER' && !sessionUser.branchIds.includes(existing.branchId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const amount = amountPiasters !== undefined ? piasters(amountPiasters) : null;
    if (amountPiasters !== undefined && amount === null) {
      return res.status(400).json({ error: 'Validation error', message: 'المبلغ غير صحيح' });
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        category: category !== undefined ? String(category).slice(0, 60) : undefined,
        description: description !== undefined ? String(description).slice(0, 500) : undefined,
        amountPiasters: amount ?? undefined,
        date: date !== undefined ? (parseDate(date) ?? undefined) : undefined
      },
      include: {
        branch: { select: { id: true, name: true } }
      }
    });

    res.json(expense);
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

router.delete('/:id', requireAuth, requirePermission('DELETE_EXPENSES'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { id } = req.params;

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (sessionUser.role !== 'OWNER' && !sessionUser.branchIds.includes(existing.branchId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.expense.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

export default router;
