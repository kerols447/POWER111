import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { normalizePhone } from 'shared';
import { shiftMinutes, hoursLabel } from './staff.js';

const router = Router();

// Compact in-memory brute-force limiter: max 5 failed attempts per identifier per 10 minutes
const failedAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

function isRateLimited(key: string): boolean {
  const entry = failedAttempts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failedAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string) {
  const entry = failedAttempts.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    failedAttempts.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearFailures(key: string) {
  failedAttempts.delete(key);
}

export function requireMemberAuth(req: Request, res: Response, next: NextFunction) {
  const member = (req.session as any).member;
  if (!member || !member.memberId) {
    return res.status(401).json({ error: 'Not authenticated', message: 'يجب تسجيل الدخول أولاً' });
  }
  next();
}

function requireStaffAuth(req: Request): { userId: string } | null {
  const staffUser = (req.session as any).staffUser;
  return staffUser && staffUser.userId ? staffUser : null;
}

// POST /api/portal/login — the phone number alone opens the portal
router.post('/login', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      phone: z.string().min(6, 'رقم الموبايل غير صحيح')
    });
    const data = schema.parse(req.body);

    const phoneNormalized = normalizePhone(data.phone);
    const rateKey = phoneNormalized;

    if (isRateLimited(rateKey)) {
      return res.status(429).json({ error: 'Too many attempts', message: 'محاولات كثيرة. حاول بعد 10 دقائق' });
    }

    // Employees and trainers sign in here with their own phone. Checked first so a trainer
    // who is also a member never loses his check-in card.
    const staffCandidates = await prisma.user.findMany({
      where: { isActive: true, role: { not: 'OWNER' }, staffCode: { not: null } },
      include: { branchAccess: { select: { branch: { select: { name: true } } } } }
    });
    const staffUser = staffCandidates.find(u => normalizePhone(u.phone || '') === phoneNormalized);

    if (staffUser) {
      clearFailures(rateKey);
      delete (req.session as any).member;
      (req.session as any).staffUser = { userId: staffUser.id };

      return res.json({
        success: true,
        data: {
          kind: 'staff',
          name: staffUser.name,
          memberCode: staffUser.staffCode,
          role: staffUser.role,
          branchName: staffUser.branchAccess.map(b => b.branch.name).join('، ') || null
        }
      });
    }

    // One phone can hold memberships in both branches; the live one comes first
    const member = await prisma.member.findFirst({
      where: { person: { phoneNormalized } },
      orderBy: { status: 'asc' },
      include: { person: true, branch: true }
    });

    if (!member) {
      recordFailure(rateKey);
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'الرقم ده مش مسجل عندنا في الجيم — اتصل على 01055002069'
      });
    }

    clearFailures(rateKey);
    delete (req.session as any).staffUser;
    (req.session as any).member = { memberId: member.id };

    res.json({
      success: true,
      data: {
        name: member.person.name,
        memberCode: member.memberCode,
        branchName: member.branch.name
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', message: error.errors[0].message });
    }
    console.error('Error portal login:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في تسجيل الدخول' });
  }
});

// POST /api/portal/logout
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/portal/me — staff session gets the staff view (never member or money data)
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  const staff = requireStaffAuth(req);
  if (!staff) return next();

  try {
    const user = await prisma.user.findUnique({
      where: { id: staff.userId },
      include: { branchAccess: { select: { branch: { select: { id: true, name: true, code: true } } } } }
    });

    if (!user || !user.isActive) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Not authenticated', message: 'انتهت الجلسة، سجل الدخول من جديد' });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const recentStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const queryStart = monthStart < recentStart ? monthStart : recentStart;

    const shifts = await prisma.staffAttendance.findMany({
      where: { userId: user.id, checkInTime: { gte: queryStart } },
      include: { branch: { select: { name: true } } },
      orderBy: { checkInTime: 'desc' }
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const now = new Date();

    const todayMinutes = shifts.filter(s => s.checkInTime >= todayStart).reduce((sum, s) => sum + shiftMinutes(s, now), 0);
    const monthShifts = shifts.filter(s => s.checkInTime >= monthStart);
    const monthMinutes = monthShifts.reduce((sum, s) => sum + shiftMinutes(s, now), 0);
    const openShift = shifts.find(s => !s.checkOutTime && s.checkInTime >= todayStart) || null;

    res.json({
      success: true,
      data: {
        kind: 'staff',
        staff: {
          id: user.id,
          name: user.name,
          staffCode: user.staffCode,
          role: user.role,
          phone: user.phone,
          branches: user.branchAccess.map(b => b.branch)
        },
        present: !!openShift,
        hoursToday: todayMinutes,
        hoursTodayLabel: hoursLabel(todayMinutes),
        hoursMonth: monthMinutes,
        hoursMonthLabel: hoursLabel(monthMinutes),
        daysWorkedMonth: new Set(monthShifts.map(s => s.checkInTime.toDateString())).size,
        shifts: shifts.map(s => ({
          id: s.id,
          checkInTime: s.checkInTime,
          checkOutTime: s.checkOutTime,
          branchName: s.branch.name,
          method: s.method,
          minutes: shiftMinutes(s, now)
        }))
      }
    });
  } catch (error) {
    console.error('Error portal staff me:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في جلب بياناتك' });
  }
}, requireMemberAuth, async (req: Request, res: Response) => {
  try {
    const session = (req.session as any).member;
    const member = await prisma.member.findUnique({
      where: { id: session.memberId },
      include: {
        person: { select: { name: true, phone: true, gender: true } },
        branch: { select: { id: true, name: true, code: true, address: true, phone: true } }
      }
    });

    if (!member) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Not authenticated', message: 'انتهت الجلسة، سجل الدخول من جديد' });
    }

    const subscriptions = await prisma.subscription.findMany({
      where: { memberId: member.id },
      include: { plan: { select: { name: true, nameAr: true } } },
      orderBy: { endDate: 'desc' },
      take: 6
    });

    const now = new Date();
    const currentSubscription = subscriptions.find(s =>
      s.status !== 'CANCELLED' && new Date(s.endDate) >= now
    ) || null;

    const payments = await prisma.payment.findMany({
      where: { subscription: { memberId: member.id } },
      include: { subscription: { select: { plan: { select: { nameAr: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const attendances = await prisma.attendance.findMany({
      where: { memberId: member.id },
      include: { branch: { select: { name: true } } },
      orderBy: { checkInTime: 'desc' },
      take: 8
    });

    const totalVisits = await prisma.attendance.count({ where: { memberId: member.id } });

    const currentlyInBranch = await prisma.attendance.count({
      where: { branchId: member.branchId, checkOutTime: null }
    });

    res.json({
      success: true,
      data: {
        member: {
          id: member.id,
          memberCode: member.memberCode,
          status: member.status,
          name: member.person.name,
          phone: member.person.phone,
          gender: member.person.gender,
          branch: member.branch
        },
        currentSubscription,
        pastSubscriptions: subscriptions.filter(s => s.id !== currentSubscription?.id),
        payments,
        attendances,
        totalVisits,
        currentlyInBranch
      }
    });
  } catch (error) {
    console.error('Error portal me:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في جلب بياناتك' });
  }
});

// GET /api/portal/qr — session QR (member card or staff shift card)
router.get('/qr', async (req: Request, res: Response, next: NextFunction) => {
  const staff = requireStaffAuth(req);
  if (!staff) return next();

  const user = await prisma.user.findUnique({
    where: { id: staff.userId },
    include: { branchAccess: { select: { branch: { select: { code: true } } } } }
  });

  if (!user || !user.staffCode) {
    return res.status(404).json({ error: 'Not found', message: 'الكارت غير متاح' });
  }

  const QRCode = await import('qrcode');
  const qrImage = await QRCode.toDataURL(
    JSON.stringify({
      staffCode: user.staffCode,
      name: user.name,
      branch: user.branchAccess[0]?.branch.code || null,
      type: 'STAFF'
    }),
    { width: 400, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } }
  );

  res.json({ success: true, data: { qrImage } });
}, requireMemberAuth, async (req: Request, res: Response) => {
  try {
    const session = (req.session as any).member;
    const member = await prisma.member.findUnique({
      where: { id: session.memberId },
      include: { person: true, branch: true }
    });

    if (!member) {
      return res.status(404).json({ error: 'Not found', message: 'العضو غير موجود' });
    }

    const QRCode = await import('qrcode');
    const qrData = JSON.stringify({
      memberCode: member.memberCode,
      name: member.person.name,
      branch: member.branch.code
    });

    const qrImage = await QRCode.toDataURL(qrData, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.json({ success: true, data: { qrImage } });
  } catch (error) {
    console.error('Error generating portal QR:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في إنشاء رمز QR' });
  }
});

export default router;
