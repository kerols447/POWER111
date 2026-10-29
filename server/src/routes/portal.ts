import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../index.js';
import { normalizePhone } from 'shared';
import { shiftMinutes, hoursLabel } from './staff.js';
import { getPushKeys, isPushEndpoint } from '../utils/push.js';
import { createLoginThrottle } from '../utils/throttle.js';

const router = Router();

// Member profile pictures live next to the product images the admin already uploads.
const MEMBER_PHOTO_DIR = path.join(process.cwd(), 'uploads', 'members');
if (!fs.existsSync(MEMBER_PHOTO_DIR)) {
  fs.mkdirSync(MEMBER_PHOTO_DIR, { recursive: true });
}

const uploadMemberPhoto = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MEMBER_PHOTO_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() === '.png' ? '.png' : '.jpg';
      cb(null, `member-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('الصورة لازم تكون JPG أو PNG'));
    }
  }
});

// Only files this route wrote are ever deleted, so a stored path can never reach other folders.
function memberPhotoFile(photoPath: string | null | undefined): string | null {
  if (!photoPath || !photoPath.startsWith('/uploads/members/')) return null;
  const file = path.join(MEMBER_PHOTO_DIR, path.basename(photoPath));
  return file.startsWith(MEMBER_PHOTO_DIR) ? file : null;
}

// Brute-force limiter for the phone-only portal: 5 failed tries per number per 10 minutes.
const portalLoginThrottle = createLoginThrottle(5, 10 * 60 * 1000);

// The portal hands out access with nothing but a phone number, so the session id a visitor
// had before signing in must never survive into the authenticated view.
function restartSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error: any) => (error ? reject(error) : resolve()));
  });
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

    if (portalLoginThrottle.blocked(rateKey)) {
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
      portalLoginThrottle.clear(rateKey);
      await restartSession(req);
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
      portalLoginThrottle.record(rateKey);
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'الرقم ده مش مسجل عندنا في الجيم — اتصل على 01280368119'
      });
    }

    portalLoginThrottle.clear(rateKey);
    await restartSession(req);
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
        person: { select: { name: true, phone: true, gender: true, photoPath: true, weightKg: true, heightCm: true } },
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

    // Trainers on the floor right now = an open shift at this member's branch that
    // started today, which is the same rule the admin staff list uses for "present".
    const dutyStart = new Date();
    dutyStart.setHours(0, 0, 0, 0);

    const onDuty = await prisma.staffAttendance.findMany({
      where: {
        branchId: member.branchId,
        checkOutTime: null,
        checkInTime: { gte: dutyStart },
        user: { role: 'TRAINER', isActive: true }
      },
      select: { user: { select: { name: true } } },
      orderBy: { checkInTime: 'asc' }
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
          photoPath: member.person.photoPath,
          weightKg: member.person.weightKg,
          heightCm: member.person.heightCm,
          branch: member.branch
        },
        currentSubscription,
        pastSubscriptions: subscriptions.filter(s => s.id !== currentSubscription?.id),
        payments,
        attendances,
        totalVisits,
        currentlyInBranch,
        trainersOnDuty: onDuty.map(s => s.user.name)
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

// GET /api/portal/physio — the member's session requests plus where they stand in the queue
router.get('/physio', requireMemberAuth, async (req: Request, res: Response) => {
  try {
    const session = (req.session as any).member;
    const member = await prisma.member.findUnique({ where: { id: session.memberId } });
    if (!member) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Not authenticated', message: 'انتهت الجلسة، سجل الدخول من جديد' });
    }

    const bookings = await prisma.physioBooking.findMany({
      where: { memberId: member.id },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    // The queue the member cares about is their own branch's: how many are waiting now,
    // and how many of those asked before them.
    const pendingAtBranch = await prisma.physioBooking.findMany({
      where: { branchId: member.branchId, status: 'PENDING' },
      select: { memberId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    });

    const myPending = bookings.find(b => b.status === 'PENDING') || null;
    const aheadOfMe = myPending
      ? pendingAtBranch.filter(b => b.createdAt < myPending.createdAt).length
      : 0;

    res.json({
      success: true,
      data: {
        bookings,
        pendingCount: pendingAtBranch.length,
        aheadOfMe
      }
    });
  } catch (error) {
    console.error('Error portal physio list:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في جلب جلساتك' });
  }
});

// POST /api/portal/physio — book a physiotherapy session request from the member portal
router.post('/physio', requireMemberAuth, async (req: Request, res: Response) => {
  try {
    const session = (req.session as any).member;
    const member = await prisma.member.findUnique({ where: { id: session.memberId } });
    if (!member) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Not authenticated', message: 'انتهت الجلسة، سجل الدخول من جديد' });
    }

    const schema = z.object({
      requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ غير صحيح'),
      note: z.string().trim().max(300, 'الملاحظة طويلة').optional().or(z.literal(''))
    });
    const data = schema.parse(req.body);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const requested = new Date(data.requestedDate + 'T00:00:00');
    const maxDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    if (requested < today) {
      return res.status(400).json({ error: 'Validation error', message: 'مينفعش تحجز تاريخ فات' });
    }
    if (requested > maxDate) {
      return res.status(400).json({ error: 'Validation error', message: 'الحجز متاح لحد ٩٠ يوم قدام' });
    }

    const existingPending = await prisma.physioBooking.findFirst({
      where: { memberId: member.id, status: 'PENDING' }
    });
    if (existingPending) {
      return res.status(409).json({ error: 'Duplicate', message: 'عندك طلب قيد المراجعة بالفعل — استنى الرد عليه' });
    }

    const booking = await prisma.physioBooking.create({
      data: {
        memberId: member.id,
        branchId: member.branchId,
        requestedDate: requested,
        note: data.note || null
      }
    });

    res.json({ success: true, data: booking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', message: error.errors[0]?.message || 'بيانات غير صحيحة' });
    }
    console.error('Error portal physio book:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في حجز الجلسة' });
  }
});

// ========== Member profile ==========

// PATCH /api/portal/profile — the member keeps his own weight and height up to date
router.patch('/profile', requireMemberAuth, async (req: Request, res: Response) => {
  try {
    const session = (req.session as any).member;
    const member = await prisma.member.findUnique({ where: { id: session.memberId } });
    if (!member) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Not authenticated', message: 'انتهت الجلسة، سجل الدخول من جديد' });
    }

    const schema = z.object({
      weightKg: z.number().min(20, 'الوزن لازم يكون ٢٠ كجم على الأقل').max(400, 'الوزن غير منطقي').nullable(),
      heightCm: z.number().int().min(90, 'الطول لازم يكون ٩٠ سم على الأقل').max(250, 'الطول غير منطقي').nullable()
    });
    const data = schema.parse(req.body);

    const person = await prisma.person.update({
      where: { id: member.personId },
      data: { weightKg: data.weightKg, heightCm: data.heightCm }
    });

    res.json({
      success: true,
      data: { weightKg: person.weightKg, heightCm: person.heightCm }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', message: error.errors[0]?.message || 'بيانات غير صحيحة' });
    }
    console.error('Error portal profile update:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في حفظ بياناتك' });
  }
});

// POST /api/portal/photo — multipart image upload for the member's profile picture
const handlePhotoUpload = uploadMemberPhoto.single('photo');

router.post('/photo', requireMemberAuth, (req: Request, res: Response, next: NextFunction) => {
  handlePhotoUpload(req, res, (error: any) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'الصورة أكبر من ٤ ميجابايت' : (error.message || 'ملف الصورة غير صالح');
      return res.status(400).json({ error: 'Validation error', message });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    const session = (req.session as any).member;
    const member = await prisma.member.findUnique({ where: { id: session.memberId } });
    if (!member) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Not authenticated', message: 'انتهت الجلسة، سجل الدخول من جديد' });
    }

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: 'Validation error', message: 'مفيش صورة مرفوعة' });
    }

    const photoPath = `/uploads/members/${file.filename}`;
    const previous = await prisma.person.findUnique({
      where: { id: member.personId },
      select: { photoPath: true }
    });

    await prisma.person.update({ where: { id: member.personId }, data: { photoPath } });

    const stale = memberPhotoFile(previous?.photoPath);
    if (stale && stale !== path.join(MEMBER_PHOTO_DIR, file.filename)) {
      fs.promises.unlink(stale).catch(() => {});
    }

    res.json({ success: true, data: { photoPath } });
  } catch (error) {
    console.error('Error portal photo upload:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في رفع الصورة' });
  }
});

// DELETE /api/portal/photo — back to the initial letter
router.delete('/photo', requireMemberAuth, async (req: Request, res: Response) => {
  try {
    const session = (req.session as any).member;
    const member = await prisma.member.findUnique({
      where: { id: session.memberId },
      select: { personId: true, person: { select: { photoPath: true } } }
    });
    if (!member) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Not authenticated', message: 'انتهت الجلسة، سجل الدخول من جديد' });
    }

    await prisma.person.update({ where: { id: member.personId }, data: { photoPath: null } });

    const stale = memberPhotoFile(member.person?.photoPath);
    if (stale) fs.promises.unlink(stale).catch(() => {});

    res.json({ success: true, data: { photoPath: null } });
  } catch (error) {
    console.error('Error portal photo delete:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في حذف الصورة' });
  }
});

// ========== Push notifications for the installed app ==========

// The browser needs the VAPID public key to create a subscription with.
router.get('/push/key', requireMemberAuth, async (_req: Request, res: Response) => {
  try {
    const keys = await getPushKeys();
    res.json({ success: true, data: { publicKey: keys.publicKey } });
  } catch (error) {
    console.error('Error portal push key:', error);
    res.status(500).json({ error: 'Internal server error', message: 'الإشعارات مش متاحة دلوقتي' });
  }
});

// One row per device — the same member can subscribe from phone and tablet.
router.post('/push/subscribe', requireMemberAuth, async (req: Request, res: Response) => {
  try {
    const session = (req.session as any).member;
    const schema = z.object({
      endpoint: z.string().min(10).max(2048),
      keys: z.object({ p256dh: z.string().min(10).max(512), auth: z.string().min(5).max(512) })
    });
    const data = schema.parse(req.body);

    if (!isPushEndpoint(data.endpoint)) {
      return res.status(400).json({ error: 'Validation error', message: 'اشتراك الإشعارات غير صحيح' });
    }

    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: data.endpoint } });
    if (existing && existing.memberId !== session.memberId) {
      // Somebody else's device: hand it back as a plain validation failure, not a takeover.
      return res.status(400).json({ error: 'Validation error', message: 'اشتراك الإشعارات غير صحيح' });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: {
        memberId: session.memberId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth
      },
      update: { p256dh: data.keys.p256dh, auth: data.keys.auth }
    });

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', message: 'بيانات الاشتراك غير صحيحة' });
    }
    console.error('Error portal push subscribe:', error);
    res.status(500).json({ error: 'Internal server error', message: 'تعذر تسجيل الاشتراك' });
  }
});

router.post('/push/unsubscribe', requireMemberAuth, async (req: Request, res: Response) => {
  try {
    const session = (req.session as any).member;
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : null;
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint, memberId: session.memberId } });
    } else {
      await prisma.pushSubscription.deleteMany({ where: { memberId: session.memberId } });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error portal push unsubscribe:', error);
    res.status(500).json({ error: 'Internal server error', message: 'تعذر إلغاء الاشتراك' });
  }
});

// The portal inbox: everything the app pushed, newest first.
router.get('/notifications', requireMemberAuth, async (req: Request, res: Response) => {
  try {
    const session = (req.session as any).member;
    const [items, unreadCount] = await Promise.all([
      prisma.memberNotification.findMany({
        where: { memberId: session.memberId },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      prisma.memberNotification.count({ where: { memberId: session.memberId, readAt: null } })
    ]);
    res.json({ success: true, data: { notifications: items, unreadCount } });
  } catch (error) {
    console.error('Error portal notifications:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في جلب الإشعارات' });
  }
});

router.post('/notifications/read', requireMemberAuth, async (req: Request, res: Response) => {
  try {
    const session = (req.session as any).member;
    await prisma.memberNotification.updateMany({
      where: { memberId: session.memberId, readAt: null },
      data: { readAt: new Date() }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error portal notifications read:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في تعليم الإشعارات' });
  }
});

export default router;
