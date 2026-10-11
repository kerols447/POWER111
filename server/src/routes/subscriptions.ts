import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { createAuditLog } from './audit.js';

const router = Router();

const createSubscriptionSchema = z.object({
  memberId: z.string().min(1, 'Member is required'),
  planId: z.string().min(1, 'Plan is required'),
  startDate: z.string().min(1, 'Start date is required'),
  discountPiasters: z.number().int().min(0).default(0),
  paidPiasters: z.number().int().min(0).default(0),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']).optional(),
  notes: z.string().optional()
});

const recordPaymentSchema = z.object({
  amountPiasters: z.number().int().min(1, 'Amount must be positive'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']),
  reference: z.string().optional(),
  notes: z.string().optional()
});

// GET /api/subscriptions — List subscriptions
router.get('/', requireAuth, requirePermission('VIEW_SUBSCRIPTIONS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { branchId, status, memberId, search, page = 1, pageSize = 20 } = req.query;

    const where: any = {};

    if (branchId) {
      if (user.role !== 'OWNER' && !user.branchIds.includes(branchId as string)) {
        return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الفرع' });
      }
      where.branchId = branchId;
    } else if (user.role !== 'OWNER') {
      where.branchId = { in: user.branchIds };
    }

    if (status) where.status = status;
    if (memberId) where.memberId = memberId;

    if (search) {
      const s = search as string;
      where.OR = [
        { member: { person: { name: { contains: s, mode: 'insensitive' } } } },
        { member: { person: { phone: { contains: s, mode: 'insensitive' } } } },
        { member: { memberCode: { contains: s, mode: 'insensitive' } } }
      ];
    }

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          member: {
            include: {
              person: { select: { id: true, name: true, phone: true } }
            }
          },
          plan: { select: { id: true, name: true, nameAr: true, durationDays: true } },
          branch: { select: { id: true, name: true, code: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize)
      }),
      prisma.subscription.count({ where })
    ]);

    res.json({
      success: true,
      data: subscriptions,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / Number(pageSize))
      }
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في جلب الاشتراكات' });
  }
});

// GET /api/subscriptions/expiring — Subscriptions expiring soon
router.get('/expiring', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { days = '3' } = req.query;

    const daysAhead = parseInt(days as string);
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    let branchFilter: any = {};
    if (user.role !== 'OWNER') {
      branchFilter = { branchId: { in: user.branchIds } };
    }

    const expiring = await prisma.subscription.findMany({
      where: {
        ...branchFilter,
        status: 'ACTIVE',
        endDate: { gte: now, lte: futureDate }
      },
      include: {
        member: {
          select: {
            id: true,
            memberCode: true,
            person: { select: { name: true } }
          }
        },
        plan: { select: { id: true, name: true, nameAr: true } }
      },
      orderBy: { endDate: 'asc' }
    });

    const result = expiring.map(sub => ({
      id: sub.id,
      endDate: sub.endDate,
      member: {
        name: sub.member.person.name,
        code: sub.member.memberCode
      },
      plan: sub.plan
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching expiring subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch expiring subscriptions' });
  }
});

// GET /api/subscriptions/:id — Get single subscription with payments
router.get('/:id', requireAuth, requirePermission('VIEW_SUBSCRIPTIONS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        member: {
          include: { person: true }
        },
        plan: true,
        branch: { include: { settings: true } },
        payments: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Not found', message: 'الاشتراك غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(subscription.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الاشتراك' });
    }

    const outstandingPiasters = subscription.pricePiasters - subscription.paidPiasters;

    res.json({ success: true, data: { ...subscription, outstandingPiasters } });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في جلب الاشتراك' });
  }
});

// POST /api/subscriptions — Create subscription (new membership)
router.post('/', requireAuth, requirePermission('CREATE_SUBSCRIPTIONS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const data = createSubscriptionSchema.parse(req.body);

    const member = await prisma.member.findUnique({
      where: { id: data.memberId },
      include: { branch: true }
    });
    if (!member) {
      return res.status(404).json({ error: 'Not found', message: 'العضو غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(member.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الإضافة لهذا الفرع' });
    }

    const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
    if (!plan) {
      return res.status(404).json({ error: 'Not found', message: 'الخطة غير موجودة' });
    }
    if (plan.branchId !== member.branchId) {
      return res.status(400).json({ error: 'Validation error', message: 'الخطة لا تنتمي لفرع العضو' });
    }

    const startDate = new Date(data.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + plan.durationDays);

    const pricePiasters = plan.pricePiasters - data.discountPiasters;
    const paidPiasters = Math.min(data.paidPiasters, pricePiasters);

    const subscription = await prisma.subscription.create({
      data: {
        memberId: data.memberId,
        planId: data.planId,
        branchId: member.branchId,
        startDate,
        endDate,
        pricePiasters,
        paidPiasters,
        status: 'ACTIVE',
        notes: data.notes || null
      }
    });

    if (paidPiasters > 0) {
      await prisma.payment.create({
        data: {
          subscriptionId: subscription.id,
          branchId: member.branchId,
          amountPiasters: paidPiasters,
          method: data.paymentMethod || 'CASH',
          notes: 'دفعة أولى'
        }
      });
    }

    await createAuditLog(user.id, 'CREATE_SUBSCRIPTION', 'Subscription', subscription.id, member.branchId, {
      action: 'created',
      memberId: data.memberId,
      planId: data.planId,
      pricePiasters,
      paidPiasters,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    const outstandingPiasters = pricePiasters - paidPiasters;

    res.status(201).json({
      success: true,
      data: { ...subscription, outstandingPiasters }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', message: error.errors[0].message });
    }
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في إنشاء الاشتراك' });
  }
});

// POST /api/subscriptions/:id/renew — Renew subscription
router.post('/:id/renew', requireAuth, requirePermission('RENEW_SUBSCRIPTIONS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;
    const { discountPiasters = 0, paidPiasters = 0, paymentMethod, notes } = req.body;

    const current = await prisma.subscription.findUnique({
      where: { id },
      include: { member: true }
    });

    if (!current) {
      return res.status(404).json({ error: 'Not found', message: 'الاشتراك غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(current.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية التجديد' });
    }

    const plan = await prisma.plan.findUnique({ where: { id: current.planId } });
    if (!plan) {
      return res.status(404).json({ error: 'Not found', message: 'الخطة غير موجودة' });
    }

    const now = new Date();
    const startDate = current.endDate > now ? current.endDate : now;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + plan.durationDays);

    const pricePiasters = plan.pricePiasters - (discountPiasters || 0);
    const initialPaid = Math.min(paidPiasters || 0, pricePiasters);

    const subscription = await prisma.subscription.create({
      data: {
        memberId: current.memberId,
        planId: current.planId,
        branchId: current.branchId,
        startDate,
        endDate,
        pricePiasters,
        paidPiasters: initialPaid,
        status: 'ACTIVE',
        notes: notes || null
      }
    });

    if (initialPaid > 0) {
      await prisma.payment.create({
        data: {
          subscriptionId: subscription.id,
          branchId: current.branchId,
          amountPiasters: initialPaid,
          method: paymentMethod || 'CASH',
          notes: 'دفعة تجديد'
        }
      });
    }

    await createAuditLog(user.id, 'RENEW_SUBSCRIPTION', 'Subscription', subscription.id, current.branchId, {
      action: 'renewed',
      previousSubscriptionId: id,
      planId: current.planId,
      pricePiasters,
      paidPiasters: initialPaid,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    const outstandingPiasters = pricePiasters - initialPaid;

    res.status(201).json({
      success: true,
      data: { ...subscription, outstandingPiasters }
    });
  } catch (error) {
    console.error('Error renewing subscription:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في تجديد الاشتراك' });
  }
});

// PATCH /api/subscriptions/:id/freeze — Freeze subscription
router.patch('/:id/freeze', requireAuth, requirePermission('FREEZE_SUBSCRIPTIONS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { branch: { include: { settings: true } } }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Not found', message: 'الاشتراك غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(subscription.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية التجميد' });
    }

    if (subscription.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Validation error', message: 'يمكن تجميد الاشتراك النشط فقط' });
    }

    if (subscription.isFrozen) {
      return res.status(400).json({ error: 'Validation error', message: 'الاشتراك مجمد بالفعل' });
    }

    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        isFrozen: true,
        frozenAt: new Date(),
        status: 'FROZEN'
      }
    });

    await createAuditLog(user.id, 'FREEZE_SUBSCRIPTION', 'Subscription', id, subscription.branchId, {
      action: 'frozen',
      frozenAt: new Date().toISOString()
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error freezing subscription:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في تجميد الاشتراك' });
  }
});

// PATCH /api/subscriptions/:id/unfreeze — Unfreeze subscription (extends endDate)
router.patch('/:id/unfreeze', requireAuth, requirePermission('FREEZE_SUBSCRIPTIONS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const subscription = await prisma.subscription.findUnique({ where: { id } });

    if (!subscription) {
      return res.status(404).json({ error: 'Not found', message: 'الاشتراك غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(subscription.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية إلغاء التجميد' });
    }

    if (!subscription.isFrozen) {
      return res.status(400).json({ error: 'Validation error', message: 'الاشتراك غير مجمد' });
    }

    const now = new Date();
    const frozenAt = subscription.frozenAt || now;
    const frozenMs = now.getTime() - frozenAt.getTime();
    const frozenDays = Math.ceil(frozenMs / (1000 * 60 * 60 * 24));

    const newEndDate = new Date(subscription.endDate);
    newEndDate.setDate(newEndDate.getDate() + frozenDays);

    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        isFrozen: false,
        frozenAt: null,
        status: 'ACTIVE',
        endDate: newEndDate,
        frozenDaysUsed: { increment: frozenDays }
      }
    });

    await createAuditLog(user.id, 'UNFREEZE_SUBSCRIPTION', 'Subscription', id, subscription.branchId, {
      action: 'unfrozen',
      frozenDays,
      newEndDate: newEndDate.toISOString()
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error unfreezing subscription:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في إلغاء تجميد الاشتراك' });
  }
});

// POST /api/subscriptions/:id/payments — Record payment
router.post('/:id/payments', requireAuth, requirePermission('CREATE_SUBSCRIPTIONS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;
    const data = recordPaymentSchema.parse(req.body);

    const subscription = await prisma.subscription.findUnique({ where: { id } });

    if (!subscription) {
      return res.status(404).json({ error: 'Not found', message: 'الاشتراك غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(subscription.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية تسجيل الدفع' });
    }

    const outstandingBefore = subscription.pricePiasters - subscription.paidPiasters;
    if (outstandingBefore <= 0) {
      return res.status(400).json({ error: 'Validation error', message: 'لا يوجد رصيد مستحق' });
    }

    const payment = await prisma.payment.create({
      data: {
        subscriptionId: id,
        branchId: subscription.branchId,
        amountPiasters: data.amountPiasters,
        method: data.method,
        reference: data.reference || null,
        notes: data.notes || null
      }
    });

    const newPaid = subscription.paidPiasters + data.amountPiasters;
    const newOutstanding = subscription.pricePiasters - newPaid;

    await prisma.subscription.update({
      where: { id },
      data: { paidPiasters: newPaid }
    });

    await createAuditLog(user.id, 'RECORD_PAYMENT', 'Payment', payment.id, subscription.branchId, {
      action: 'payment_recorded',
      subscriptionId: id,
      amountPiasters: data.amountPiasters,
      method: data.method,
      newPaidPiasters: newPaid,
      outstandingPiasters: newOutstanding
    });

    res.status(201).json({
      success: true,
      data: payment,
      outstandingPiasters: newOutstanding
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', message: error.errors[0].message });
    }
    console.error('Error recording payment:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في تسجيل الدفعة' });
  }
});

// GET /api/subscriptions/:id/receipt — Receipt data
router.get('/:id/receipt', requireAuth, requirePermission('VIEW_SUBSCRIPTIONS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        member: { include: { person: true } },
        plan: true,
        branch: true,
        payments: { orderBy: { createdAt: 'asc' } }
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Not found', message: 'الاشتراك غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(subscription.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الإيصال' });
    }

    const outstandingPiasters = subscription.pricePiasters - subscription.paidPiasters;

    res.json({
      success: true,
      data: {
        receiptNumber: subscription.id.slice(-8).toUpperCase(),
        date: new Date().toISOString(),
        branch: subscription.branch,
        member: subscription.member,
        plan: subscription.plan,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        pricePiasters: subscription.pricePiasters,
        paidPiasters: subscription.paidPiasters,
        outstandingPiasters,
        payments: subscription.payments
      }
    });
  } catch (error) {
    console.error('Error generating receipt:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في إنشاء الإيصال' });
  }
});

export default router;
