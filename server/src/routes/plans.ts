import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createAuditLog } from './audit.js';

const router = Router();

const createPlanSchema = z.object({
  branchId: z.string().min(1, 'Branch is required'),
  name: z.string().min(2, 'Name is required'),
  nameAr: z.string().min(2, 'Arabic name is required'),
  durationDays: z.number().int().min(1, 'Duration must be at least 1 day'),
  pricePiasters: z.number().int().min(0, 'Price cannot be negative'),
  description: z.string().optional(),
  descriptionAr: z.string().optional()
});

const updatePlanSchema = z.object({
  name: z.string().min(2).optional(),
  nameAr: z.string().min(2).optional(),
  durationDays: z.number().int().min(1).optional(),
  pricePiasters: z.number().int().min(0).optional(),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  isActive: z.boolean().optional()
});

// GET /api/plans — List plans
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { branchId, isActive } = req.query;

    const where: any = {};

    if (branchId) {
      if (user.role !== 'OWNER' && !user.branchIds.includes(branchId as string)) {
        return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الفرع' });
      }
      where.branchId = branchId;
    } else if (user.role !== 'OWNER') {
      where.branchId = { in: user.branchIds };
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const plans = await prisma.plan.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: plans });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في جلب الخطط' });
  }
});

// GET /api/plans/:id — Get single plan
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const plan = await prisma.plan.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true, code: true } }
      }
    });

    if (!plan) {
      return res.status(404).json({ error: 'Not found', message: 'الخطة غير موجودة' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(plan.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذه الخطة' });
    }

    res.json({ success: true, data: plan });
  } catch (error) {
    console.error('Error fetching plan:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في جلب الخطة' });
  }
});

// POST /api/plans — Create plan (owner and branch managers, scoped to their own branches)
router.post('/', requireAuth, requireRole('OWNER', 'BRANCH_MANAGER'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const data = createPlanSchema.parse(req.body);

    if (user.role !== 'OWNER' && !user.branchIds.includes(data.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الإضافة لهذا الفرع' });
    }

    const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
    if (!branch) {
      return res.status(404).json({ error: 'Not found', message: 'الفرع غير موجود' });
    }

    const plan = await prisma.plan.create({
      data: {
        branchId: data.branchId,
        name: data.name,
        nameAr: data.nameAr,
        durationDays: data.durationDays,
        pricePiasters: data.pricePiasters,
        description: data.description || null,
        descriptionAr: data.descriptionAr || null
      }
    });

    await createAuditLog(user.id, 'CREATE_PLAN', 'Plan', plan.id, data.branchId, { action: 'created', name: data.name, pricePiasters: data.pricePiasters });

    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', message: error.errors[0].message });
    }
    console.error('Error creating plan:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في إنشاء الخطة' });
  }
});

// PATCH /api/plans/:id — Update plan
router.patch('/:id', requireAuth, requireRole('OWNER', 'BRANCH_MANAGER'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;
    const data = updatePlanSchema.parse(req.body);

    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) {
      return res.status(404).json({ error: 'Not found', message: 'الخطة غير موجودة' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(plan.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية التعديل لهذه الخطة' });
    }

    const updated = await prisma.plan.update({ where: { id }, data });

    await createAuditLog(user.id, 'UPDATE_PLAN', 'Plan', id, plan.branchId, { action: 'updated', changes: data });

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', message: error.errors[0].message });
    }
    console.error('Error updating plan:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في تحديث الخطة' });
  }
});

// DELETE /api/plans/:id — Soft delete (deactivate)
router.delete('/:id', requireAuth, requireRole('OWNER', 'BRANCH_MANAGER'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) {
      return res.status(404).json({ error: 'Not found', message: 'الخطة غير موجودة' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(plan.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الحذف لهذه الخطة' });
    }

    await prisma.plan.update({ where: { id }, data: { isActive: false } });

    await createAuditLog(user.id, 'DEACTIVATE_PLAN', 'Plan', id, plan.branchId, { action: 'deactivated' });

    res.json({ success: true, message: 'تم إلغاء تنشيط الخطة' });
  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في حذف الخطة' });
  }
});

export default router;
