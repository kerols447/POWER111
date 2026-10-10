import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { normalizePhone } from 'shared';

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

// POST /api/portal/login — member login with phone + member code
router.post('/login', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      phone: z.string().min(6, 'رقم الموبايل غير صحيح'),
      memberCode: z.string().min(4, 'كود العضو غير صحيح')
    });
    const data = schema.parse(req.body);

    const phoneNormalized = normalizePhone(data.phone);
    const memberCode = data.memberCode.trim().toUpperCase();
    const rateKey = `${phoneNormalized}:${memberCode}`;

    if (isRateLimited(rateKey)) {
      return res.status(429).json({ error: 'Too many attempts', message: 'محاولات كثيرة خاطئة. حاول بعد 10 دقائق' });
    }

    const member = await prisma.member.findFirst({
      where: {
        memberCode,
        person: { phoneNormalized }
      },
      include: { person: true, branch: true }
    });

    if (!member) {
      recordFailure(rateKey);
      return res.status(401).json({ error: 'Invalid credentials', message: 'رقم الموبايل أو كود العضو غير صحيح' });
    }

    clearFailures(rateKey);
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

// GET /api/portal/me — member dashboard data
router.get('/me', requireMemberAuth, async (req: Request, res: Response) => {
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
        totalVisits
      }
    });
  } catch (error) {
    console.error('Error portal me:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في جلب بياناتك' });
  }
});

// GET /api/portal/qr — member's QR code (payload identical to staff-generated QR)
router.get('/qr', requireMemberAuth, async (req: Request, res: Response) => {
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
