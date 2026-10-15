import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

// Staff shifts live in their own table so member lists, exports and financial
// reports never count a trainer as a gym member.

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Staff card codes are "S" + a short number; member codes are always 8 characters,
// so the two can never collide in the scanner or the portal login.
function isStaffCode(code: string): boolean {
  return /^S\d{1,6}$/i.test((code || '').trim());
}

function shiftMinutes(shift: { checkInTime: Date; checkOutTime: Date | null }, now = new Date()): number {
  const end = shift.checkOutTime ?? now;
  const minutes = Math.round((end.getTime() - shift.checkInTime.getTime()) / 60000);
  return minutes > 0 ? minutes : 0;
}

function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}س ${String(m).padStart(2, '0')}د`;
}

export { isStaffCode, shiftMinutes, hoursLabel };

async function assignStaffCode(): Promise<string> {
  const existing = await prisma.user.findMany({
    where: { staffCode: { startsWith: 'S' } },
    select: { staffCode: true }
  });
  let max = 0;
  for (const row of existing) {
    const n = Number((row.staffCode || '').replace(/^S0*/, ''));
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `S${String(max + 1).padStart(2, '0')}`;
}

export { assignStaffCode };

// GET /api/staff — Staff list with today's shift and worked hours
router.get('/', requireAuth, requirePermission('VIEW_ATTENDANCE'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { branchId, search, role } = req.query;

    const where: any = { role: { not: 'OWNER' } };
    if (role && typeof role === 'string') where.role = role;
    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { staffCode: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    if (branchId) {
      if (user.role !== 'OWNER' && !user.branchIds.includes(branchId as string)) {
        return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الفرع' });
      }
      where.branchAccess = { some: { branchId: branchId as string } };
    } else if (user.role !== 'OWNER') {
      where.branchAccess = { some: { branchId: { in: user.branchIds } } };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const staff = await prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        staffCode: true,
        isActive: true,
        branchAccess: { select: { branch: { select: { id: true, name: true, code: true } } } }
      }
    });

    const ids = staff.map(s => s.id);
    const [todayShifts, monthShifts] = await Promise.all([
      prisma.staffAttendance.findMany({
        where: { userId: { in: ids }, checkInTime: { gte: todayStart } },
        include: { branch: { select: { name: true } } },
        orderBy: { checkInTime: 'asc' }
      }),
      prisma.staffAttendance.findMany({
        where: { userId: { in: ids }, checkInTime: { gte: monthStart } },
        select: { userId: true, checkInTime: true, checkOutTime: true }
      })
    ]);

    const now = new Date();
    const data = staff.map(s => {
      const todays = todayShifts.filter(t => t.userId === s.id);
      const open = todays.find(t => !t.checkOutTime) || null;
      const todayMinutes = todays.reduce((sum, t) => sum + shiftMinutes(t, now), 0);
      const monthMinutes = monthShifts.filter(t => t.userId === s.id).reduce((sum, t) => sum + shiftMinutes(t, now), 0);

      return {
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        role: s.role,
        staffCode: s.staffCode,
        isActive: s.isActive,
        branches: s.branchAccess.map(b => b.branch),
        branchNames: s.branchAccess.map(b => b.branch.name),
        present: !!open,
        todayShifts: todays.map(t => ({
          id: t.id,
          checkInTime: t.checkInTime,
          checkOutTime: t.checkOutTime,
          branchName: t.branch.name,
          method: t.method,
          minutes: shiftMinutes(t, now)
        })),
        openShiftId: open?.id || null,
        checkInTime: open?.checkInTime || todays[0]?.checkInTime || null,
        checkOutTime: open ? null : todays[todays.length - 1]?.checkOutTime || null,
        branchName: open?.branch.name || todays[todays.length - 1]?.branch.name || null,
        hoursToday: todayMinutes,
        hoursTodayLabel: hoursLabel(todayMinutes),
        hoursMonth: monthMinutes,
        hoursMonthLabel: hoursLabel(monthMinutes)
      };
    });

    res.json({
      success: true,
      data,
      summary: {
        total: data.length,
        present: data.filter(s => s.present).length,
        checkedInToday: data.filter(s => s.todayShifts.length > 0).length,
        absent: data.filter(s => s.isActive && s.todayShifts.length === 0).length,
        hoursToday: data.reduce((sum, s) => sum + s.hoursToday, 0)
      },
      today: dayKey(todayStart)
    });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في جلب بيانات الموظفين' });
  }
});

// POST /api/staff/checkin — Check in a trainer or employee by card code
router.post('/checkin', requireAuth, requirePermission('CHECKIN_MEMBERS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { staffCode, branchId, method = 'MANUAL' } = req.body;

    if (!staffCode || !branchId) {
      return res.status(400).json({ error: 'Bad request', message: 'كود الموظف والفرع مطلوبان' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الفرع' });
    }

    const staffUser = await prisma.user.findUnique({
      where: { staffCode },
      include: { branchAccess: { select: { branch: { select: { id: true, name: true } } } } }
    });

    // Owner accounts have no shift card, so a scanned code can never resolve to one
    if (!staffUser || staffUser.role === 'OWNER') {
      return res.status(404).json({ error: 'Not found', message: 'الموظف غير موجود' });
    }
    if (!staffUser.isActive) {
      return res.status(403).json({ error: 'Inactive', message: `${staffUser.name} حسابه متوقف` });
    }

    const assignedBranchIds = staffUser.branchAccess.map(b => b.branch.id);
    const crossBranch = !assignedBranchIds.includes(branchId);
    if (user.role !== 'OWNER' && crossBranch) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `${staffUser.name} مش متعيين في هذا الفرع`
      });
    }

    const openShift = await prisma.staffAttendance.findFirst({
      where: { userId: staffUser.id, checkOutTime: null },
      orderBy: { checkInTime: 'desc' }
    });
    if (openShift) {
      return res.status(409).json({
        error: 'Already checked in',
        message: `${staffUser.name} موجود في الوردية الحالية بالفعل`,
        data: openShift
      });
    }

    const shift = await prisma.staffAttendance.create({
      data: { userId: staffUser.id, branchId, method },
      include: { branch: { select: { name: true } } }
    });

    res.status(201).json({
      success: true,
      message: `تم تسجيل حضور ${staffUser.name}${crossBranch ? ` — الوردية في ${shift.branch.name}` : ''}`,
      data: {
        ...shift,
        staffName: staffUser.name,
        staffCode: staffUser.staffCode,
        role: staffUser.role,
        branchName: shift.branch.name
      }
    });
  } catch (error) {
    console.error('Error checking in staff:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في تسجيل الحضور' });
  }
});

// POST /api/staff/:id/checkout — Close a staff shift and return the worked hours
router.post('/:id/checkout', requireAuth, requirePermission('CHECKIN_MEMBERS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const shift = await prisma.staffAttendance.findUnique({
      where: { id },
      include: { user: { select: { name: true, staffCode: true } } }
    });

    if (!shift) {
      return res.status(404).json({ error: 'Not found', message: 'سجل الحضور غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(shift.branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا السجل' });
    }

    if (shift.checkOutTime) {
      return res.status(409).json({
        error: 'Already checked out',
        message: 'تم تسجيل انصراف بالفعل لهذه الوردية',
        data: shift
      });
    }

    const checkOutTime = new Date();
    const minutes = Math.max(0, Math.round((checkOutTime.getTime() - shift.checkInTime.getTime()) / 60000));

    const updated = await prisma.staffAttendance.update({
      where: { id },
      data: { checkOutTime },
      include: { branch: { select: { name: true } } }
    });

    res.json({
      success: true,
      message: `تم تسجيل انصراف ${shift.user.name} — ${hoursLabel(minutes)}`,
      data: { ...updated, staffName: shift.user.name, staffCode: shift.user.staffCode, branchName: updated.branch.name, minutes }
    });
  } catch (error) {
    console.error('Error checking out staff:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في تسجيل الانصراف' });
  }
});

// GET /api/staff/report — Worked hours per day, staff and branch
router.get('/report', requireAuth, requirePermission('VIEW_ATTENDANCE'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { branchId, userId, startDate, endDate } = req.query;

    const rangeStart = new Date((startDate as string) || Date.now());
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = endDate ? new Date(endDate as string) : new Date();
    rangeEnd.setHours(23, 59, 59, 999);

    const where: any = { checkInTime: { gte: rangeStart, lte: rangeEnd } };
    if (userId) where.userId = userId as string;
    if (branchId) {
      if (user.role !== 'OWNER' && !user.branchIds.includes(branchId as string)) {
        return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الفرع' });
      }
      where.branchId = branchId as string;
    } else if (user.role !== 'OWNER') {
      where.branchId = { in: user.branchIds };
    }

    const shifts = await prisma.staffAttendance.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, staffCode: true, role: true, isActive: true } },
        branch: { select: { id: true, name: true, code: true } }
      },
      orderBy: { checkInTime: 'asc' }
    });

    const now = new Date();
    const rows = shifts.map(s => ({
      id: s.id,
      day: dayKey(s.checkInTime),
      userId: s.userId,
      staffName: s.user.name,
      staffCode: s.user.staffCode,
      role: s.user.role,
      branchId: s.branchId,
      branchName: s.branch.name,
      branchCode: s.branch.code,
      checkInTime: s.checkInTime,
      checkOutTime: s.checkOutTime,
      open: !s.checkOutTime,
      minutes: shiftMinutes(s, now)
    }));

    const byStaff = new Map<string, { staffName: string; staffCode: string | null; role: string; minutes: number }>();
    const byBranch = new Map<string, { branchName: string; minutes: number }>();
    const byDay = new Map<string, number>();
    const staffDays = new Map<string, Set<string>>();

    for (const r of rows) {
      const staffEntry = byStaff.get(r.userId) || { staffName: r.staffName, staffCode: r.staffCode, role: r.role, minutes: 0 };
      staffEntry.minutes += r.minutes;
      byStaff.set(r.userId, staffEntry);

      const workedDays = staffDays.get(r.userId) || new Set<string>();
      workedDays.add(r.day);
      staffDays.set(r.userId, workedDays);

      const branchEntry = byBranch.get(r.branchId) || { branchName: r.branchName, minutes: 0 };
      branchEntry.minutes += r.minutes;
      byBranch.set(r.branchId, branchEntry);

      byDay.set(r.day, (byDay.get(r.day) || 0) + r.minutes);
    }

    res.json({
      success: true,
      range: { start: rangeStart, end: rangeEnd },
      data: rows,
      totals: {
        shifts: rows.length,
        hours: rows.reduce((sum, r) => sum + r.minutes, 0),
        openShifts: rows.filter(r => r.open).length
      },
      byStaff: [...byStaff.entries()]
        .map(([uid, s]) => ({ ...s, userId: uid, days: staffDays.get(uid)?.size || 0, hoursLabel: hoursLabel(s.minutes) }))
        .sort((a, b) => b.minutes - a.minutes),
      byBranch: [...byBranch.entries()]
        .map(([branchId, b]) => ({ branchId, branchName: b.branchName, minutes: b.minutes, hoursLabel: hoursLabel(b.minutes) }))
        .sort((a, b) => b.minutes - a.minutes),
      byDay: [...byDay.entries()].map(([day, minutes]) => ({ day, minutes, hoursLabel: hoursLabel(minutes) })).sort((a, b) => a.day.localeCompare(b.day))
    });
  } catch (error) {
    console.error('Error building staff report:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في تقرير ساعات العمل' });
  }
});

// GET /api/staff/:id/qr — Card QR for a trainer or employee
router.get('/:id/qr', requireAuth, requirePermission('VIEW_ATTENDANCE'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const staffUser = await prisma.user.findUnique({
      where: { id },
      include: { branchAccess: { select: { branch: { select: { id: true, name: true, code: true } } } } }
    });

    if (!staffUser || staffUser.role === 'OWNER' || !staffUser.staffCode) {
      return res.status(404).json({ error: 'Not found', message: 'الموظف غير موجود' });
    }

    const assignedIds = staffUser.branchAccess.map(b => b.branch.id);
    if (user.role !== 'OWNER' && !assignedIds.some(bid => user.branchIds.includes(bid))) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الموظف' });
    }

    const QRCode = await import('qrcode');
    const qrData = JSON.stringify({
      staffCode: staffUser.staffCode,
      name: staffUser.name,
      branch: staffUser.branchAccess[0]?.branch.code || null,
      type: 'STAFF'
    });

    const qrImage = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    });

    res.json({
      success: true,
      data: {
        staffCode: staffUser.staffCode,
        staffName: staffUser.name,
        role: staffUser.role,
        branchName: staffUser.branchAccess.map(b => b.branch.name).join('، ') || null,
        qrImage
      }
    });
  } catch (error) {
    console.error('Error generating staff QR:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في إنشاء رمز QR' });
  }
});

export default router;
