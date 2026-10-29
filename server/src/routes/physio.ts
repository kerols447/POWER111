import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { notifyMember } from '../utils/push.js';

const router = Router();

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function arabicDay(value: Date): string {
  const d = new Date(value);
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Branch scoping: the owner sees every branch, everyone else sees only theirs.
function branchFilterFor(sessionUser: any, branchId?: unknown): any {
  if (sessionUser.role !== 'OWNER') {
    const ids = sessionUser.branchIds as string[];
    if (branchId && ids.includes(branchId as string)) return { id: branchId as string };
    return { id: { in: ids } };
  }
  return branchId ? { id: branchId as string } : {};
}

// GET /api/physio/bookings — the queue the gym works through, newest request first
router.get('/', requireAuth, requirePermission('VIEW_PHYSIO'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { status, branchId } = req.query;

    const where: any = { branch: branchFilterFor(sessionUser, branchId) };
    if (status && status !== 'ALL') where.status = status as string;

    const bookings = await prisma.physioBooking.findMany({
      where,
      include: {
        member: { select: { id: true, memberCode: true, person: { select: { name: true, phone: true } } } },
        branch: { select: { id: true, name: true, code: true } },
        decidedBy: { select: { id: true, name: true } }
      },
      orderBy: [
        { status: 'asc' }, // PENDING first so the awaiting requests never sink under decided ones
        { requestedDate: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching physio bookings:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في جلب طلبات الجلسات' });
  }
});

// POST /api/physio/bookings/:id/approve — the gym accepts the session and sets its price
router.post('/:id/approve', requireAuth, requirePermission('MANAGE_PHYSIO'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const schema = z.object({
      pricePiasters: z.number({ invalid_type_error: 'السعر مطلوب' }).int('السعر مطلوب').min(0)
    });
    const data = schema.parse(req.body);

    const booking = await prisma.physioBooking.findUnique({ where: { id: req.params.id } });
    if (!booking) {
      return res.status(404).json({ error: 'Not found', message: 'الطلب غير موجود' });
    }
    if (sessionUser.role !== 'OWNER' && !sessionUser.branchIds.includes(booking.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية على هذا الفرع' });
    }
    if (booking.status !== 'PENDING') {
      return res.status(409).json({ error: 'Already decided', message: 'تم الرد على هذا الطلب بالفعل' });
    }

    const updated = await prisma.physioBooking.update({
      where: { id: booking.id },
      data: {
        status: 'APPROVED',
        pricePiasters: data.pricePiasters,
        decidedById: sessionUser.id,
        decidedAt: new Date()
      },
      include: {
        member: { select: { id: true, memberCode: true, person: { select: { name: true, phone: true } } } },
        branch: { select: { id: true, name: true, code: true } },
        decidedBy: { select: { id: true, name: true } }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: sessionUser.id,
        action: 'physio.approve',
        entityType: 'PhysioBooking',
        entityId: booking.id,
        branchId: booking.branchId,
        data: { pricePiasters: data.pricePiasters, memberId: booking.memberId }
      }
    });

    await notifyMember(booking.memberId, {
      kind: 'PHYSIO_APPROVED',
      title: 'تمت الموافقة على جلسة العلاج الطبيعي',
      body: `تاريخ ${arabicDay(booking.requestedDate)} — السعر ${(data.pricePiasters / 100).toLocaleString('ar-EG-u-nu-latn')} ج.م`,
      link: '/portal'
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', message: error.errors[0]?.message || 'بيانات غير صحيحة' });
    }
    console.error('Error approving physio booking:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في قبول الطلب' });
  }
});

// POST /api/physio/bookings/:id/decline — the gym rejects the request, with an optional
// reason the member reads in the portal
router.post('/:id/decline', requireAuth, requirePermission('MANAGE_PHYSIO'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;

    const schema = z.object({
      reason: z.string().trim().max(300).optional()
    });
    const data = schema.parse(req.body ?? {});

    const booking = await prisma.physioBooking.findUnique({ where: { id: req.params.id } });
    if (!booking) {
      return res.status(404).json({ error: 'Not found', message: 'الطلب غير موجود' });
    }
    if (sessionUser.role !== 'OWNER' && !sessionUser.branchIds.includes(booking.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية على هذا الفرع' });
    }
    if (booking.status !== 'PENDING') {
      return res.status(409).json({ error: 'Already decided', message: 'تم الرد على هذا الطلب بالفعل' });
    }

    const reason = data.reason || null;

    const updated = await prisma.physioBooking.update({
      where: { id: booking.id },
      data: {
        status: 'DECLINED',
        declineReason: reason,
        decidedById: sessionUser.id,
        decidedAt: new Date()
      },
      include: {
        member: { select: { id: true, memberCode: true, person: { select: { name: true, phone: true } } } },
        branch: { select: { id: true, name: true, code: true } },
        decidedBy: { select: { id: true, name: true } }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: sessionUser.id,
        action: 'physio.decline',
        entityType: 'PhysioBooking',
        entityId: booking.id,
        branchId: booking.branchId,
        data: { memberId: booking.memberId, reason }
      }
    });

    await notifyMember(booking.memberId, {
      kind: 'PHYSIO_DECLINED',
      title: 'طلب جلسة العلاج الطبيعي اترفض',
      body: reason
        ? `السبب: ${reason}`
        : `تاريخ ${arabicDay(booking.requestedDate)} — تقدر تحجز طلب جديد من بوابة الأعضاء`,
      link: '/portal'
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', message: error.errors[0]?.message || 'بيانات غير صحيحة' });
    }
    console.error('Error declining physio booking:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في رفض الطلب' });
  }
});

export default router;
