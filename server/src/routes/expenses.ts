import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

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
      where.date = {};
      if (from) where.date.gte = new Date(from as string);
      if (to) where.date.lte = new Date(to as string);
    }
    if (search) {
      where.description = { contains: search as string, mode: 'insensitive' };
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } }
      },
      orderBy: { date: 'desc' }
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

    const expense = await prisma.expense.create({
      data: {
        branchId,
        category,
        description,
        amountPiasters: parseInt(amountPiasters),
        date: date ? new Date(date) : new Date(),
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

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        category,
        description,
        amountPiasters: amountPiasters !== undefined ? parseInt(amountPiasters) : undefined,
        date: date ? new Date(date) : undefined
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
