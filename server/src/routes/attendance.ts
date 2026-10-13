import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

// Members may only check in at another branch when that branch's settings allow it.
// Returns the branch the member actually belongs to, so callers can name it in the error.
export async function crossBranchCheckinStatus(
  targetBranchId: string,
  memberBranchId: string
): Promise<{ allowed: boolean; homeBranchName: string }> {
  const [settings, homeBranch] = await Promise.all([
    prisma.branchSettings.findUnique({ where: { branchId: targetBranchId } }),
    prisma.branch.findUnique({ where: { id: memberBranchId }, select: { name: true } })
  ]);
  return {
    allowed: settings?.allowCrossBranchCheckin ?? false,
    homeBranchName: homeBranch?.name ?? 'فرع آخر'
  };
}

// POST /api/attendance/checkin — Check in a member
router.post('/checkin', requireAuth, requirePermission('CHECKIN_MEMBERS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { memberCode, branchId, method = 'MANUAL' } = req.body;

    if (!memberCode || !branchId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'كود العضو والفرع مطلوبان'
      });
    }

    // Verify branch access
    if (user.role !== 'OWNER' && !user.branchIds.includes(branchId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'ليس لديك صلاحية الوصول لهذا الفرع'
      });
    }

    // Find member and verify they belong to this branch
    const member = await prisma.member.findUnique({
      where: { memberCode },
      include: {
        person: true,
        subscriptions: {
          where: {
            status: 'ACTIVE',
            endDate: { gte: new Date() }
          },
          orderBy: { endDate: 'desc' },
          take: 1
        }
      }
    });

    if (!member) {
      return res.status(404).json({
        error: 'Not found',
        message: 'العضو غير موجود'
      });
    }

    // Members check in at their own branch unless the owner enabled cross-branch for this branch
    const crossBranch = member.branchId !== branchId;
    let homeBranchName: string | null = null;
    if (crossBranch) {
      const status = await crossBranchCheckinStatus(branchId, member.branchId);
      if (!status.allowed) {
        return res.status(403).json({
          error: 'Cross-branch check-in disabled',
          message: `الحضور في فرع آخر مقفول. العضو مسجل في فرع ${status.homeBranchName}. شغّل السماح من صفحة الإعدادات لو عايز تسمح بيه.`
        });
      }
      homeBranchName = status.homeBranchName;
    }

    // Check if member already checked in today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existingCheckin = await prisma.attendance.findFirst({
      where: {
        memberId: member.id,
        checkInTime: { gte: todayStart }
      }
    });

    if (existingCheckin) {
      return res.status(409).json({
        error: 'Already checked in',
        message: 'العضو مسجل حضوره بالفعل اليوم',
        data: existingCheckin
      });
    }

    // Check if member has active subscription
    const activeSubscription = member.subscriptions[0];
    const reasons: string[] = [];

    if (!activeSubscription) {
      reasons.push('لا يوجد اشتراك نشط');
    } else if (activeSubscription.paidPiasters < activeSubscription.pricePiasters) {
      reasons.push('يوجد مبلغ متبقي');
    }
    if (homeBranchName) {
      reasons.push(`العضو مسجل في فرع ${homeBranchName}`);
    }

    const flagged = reasons.length > 0;
    const flagReason = flagged ? reasons.join(' — ') : null;

    // Create attendance record
    const attendance = await prisma.attendance.create({
      data: {
        memberId: member.id,
        branchId,
        method,
        flagged,
        flagReason
      },
      include: {
        member: {
          include: { person: true }
        },
        branch: true
      }
    });

    res.status(201).json({
      success: true,
      message: flagged ? `تم تسجيل الحضور مع تنبيه: ${flagReason}` : 'تم تسجيل الحضور بنجاح',
      data: {
        ...attendance,
        memberName: attendance.member.person.name,
        memberCode: attendance.member.memberCode,
        branchName: attendance.branch.name
      }
    });
  } catch (error) {
    console.error('Error checking in member:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ في تسجيل الحضور'
    });
  }
});

// POST /api/attendance/:id/checkout — Check out a member
router.post('/:id/checkout', requireAuth, requirePermission('CHECKIN_MEMBERS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const attendance = await prisma.attendance.findUnique({
      where: { id },
      include: { member: true }
    });

    if (!attendance) {
      return res.status(404).json({
        error: 'Not found',
        message: 'سجل الحضور غير موجود'
      });
    }

    // Verify branch access
    if (user.role !== 'OWNER' && !user.branchIds.includes(attendance.branchId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'ليس لديك صلاحية الوصول لهذا السجل'
      });
    }

    if (attendance.checkOutTime) {
      return res.status(409).json({
        error: 'Already checked out',
        message: 'العضو مسجل انصرافه بالفعل'
      });
    }

    const updated = await prisma.attendance.update({
      where: { id },
      data: { checkOutTime: new Date() },
      include: {
        member: {
          include: { person: true }
        },
        branch: true
      }
    });

    res.json({
      success: true,
      message: 'تم تسجيل الانصراف بنجاح',
      data: updated
    });
  } catch (error) {
    console.error('Error checking out member:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ في تسجيل الانصراف'
    });
  }
});

// GET /api/attendance/today — Get today's attendance
router.get('/today', requireAuth, requirePermission('VIEW_ATTENDANCE'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { branchId } = req.query;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const where: any = {
      checkInTime: {
        gte: todayStart,
        lte: todayEnd
      }
    };

    if (branchId) {
      if (user.role !== 'OWNER' && !user.branchIds.includes(branchId as string)) {
        return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الفرع' });
      }
      where.branchId = branchId;
    } else if (user.role !== 'OWNER') {
      where.branchId = { in: user.branchIds };
    }

    const attendances = await prisma.attendance.findMany({
      where,
      orderBy: { checkInTime: 'desc' },
      include: {
        member: {
          include: {
            person: true,
            subscriptions: {
              where: {
                status: 'ACTIVE',
                endDate: { gte: new Date() }
              },
              orderBy: { endDate: 'desc' },
              take: 1
            }
          }
        },
        branch: true
      }
    });

    const formatted = attendances.map(a => ({
      id: a.id,
      memberId: a.memberId,
      memberName: a.member.person.name,
      memberCode: a.member.memberCode,
      memberPhone: a.member.person.phone,
      branchId: a.branchId,
      branchName: a.branch.name,
      checkInTime: a.checkInTime,
      checkOutTime: a.checkOutTime,
      method: a.method,
      flagged: a.flagged,
      flagReason: a.flagReason,
      hasActiveSubscription: a.member.subscriptions.length > 0
    }));

    res.json({
      success: true,
      data: formatted,
      summary: {
        total: formatted.length,
        checkedIn: formatted.filter(a => !a.checkOutTime).length,
        checkedOut: formatted.filter(a => a.checkOutTime).length,
        flagged: formatted.filter(a => a.flagged).length
      }
    });
  } catch (error) {
    console.error('Error fetching today\'s attendance:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ في جلب بيانات الحضور'
    });
  }
});

// GET /api/attendance/history — Get attendance history with filters
router.get('/history', requireAuth, requirePermission('VIEW_ATTENDANCE'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { branchId, memberId, startDate, endDate, page = '1', pageSize = '20' } = req.query;

    const where: any = {};

    if (branchId) {
      if (user.role !== 'OWNER' && !user.branchIds.includes(branchId as string)) {
        return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الفرع' });
      }
      where.branchId = branchId;
    } else if (user.role !== 'OWNER') {
      where.branchId = { in: user.branchIds };
    }

    if (memberId) {
      where.memberId = memberId;
    }

    if (startDate || endDate) {
      where.checkInTime = {};
      if (startDate) where.checkInTime.gte = new Date(startDate as string);
      if (endDate) where.checkInTime.lte = new Date(endDate as string);
    }

    const skip = (Number(page) - 1) * Number(pageSize);

    const [attendances, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        orderBy: { checkInTime: 'desc' },
        skip,
        take: Number(pageSize),
        include: {
          member: {
            include: { person: true }
          },
          branch: true
        }
      }),
      prisma.attendance.count({ where })
    ]);

    const formatted = attendances.map(a => ({
      id: a.id,
      memberId: a.memberId,
      memberName: a.member.person.name,
      memberCode: a.member.memberCode,
      branchId: a.branchId,
      branchName: a.branch.name,
      checkInTime: a.checkInTime,
      checkOutTime: a.checkOutTime,
      method: a.method,
      flagged: a.flagged,
      flagReason: a.flagReason
    }));

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / Number(pageSize))
      }
    });
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ في جلب سجل الحضور'
    });
  }
});

// GET /api/attendance/now — Get currently checked-in count per branch
router.get('/now', requireAuth, requirePermission('VIEW_ATTENDANCE'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { branchId } = req.query;

    const where: any = { checkOutTime: null };

    if (branchId) {
      if (user.role !== 'OWNER' && !user.branchIds.includes(branchId as string)) {
        return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الفرع' });
      }
      where.branchId = branchId;
    } else if (user.role !== 'OWNER') {
      where.branchId = { in: user.branchIds };
    }

    const count = await prisma.attendance.count({ where });

    res.json({ count, branchId: branchId || 'all' });
  } catch (error) {
    console.error('Error fetching current attendance:', error);
    res.status(500).json({ error: 'Failed to fetch current attendance' });
  }
});

export default router;

async function runAutoCheckout() {
  try {
    const [openAttendances, allSettings] = await Promise.all([
      prisma.attendance.findMany({
        where: { checkOutTime: null },
        select: { id: true, branchId: true, checkInTime: true }
      }),
      prisma.branchSettings.findMany({
        select: { branchId: true, autoCheckoutEnabled: true, autoCheckoutMinutes: true }
      })
    ]);

    if (openAttendances.length === 0) return;

    const settingsByBranch = new Map(allSettings.map(s => [s.branchId, s]));

    for (const att of openAttendances) {
      // Branches without a settings row fall back to the schema defaults (on, 90 minutes)
      const settings = settingsByBranch.get(att.branchId);
      const enabled = settings?.autoCheckoutEnabled ?? true;
      const minutes = settings?.autoCheckoutMinutes ?? 90;
      if (!enabled || minutes <= 0) continue;

      const elapsed = (Date.now() - new Date(att.checkInTime).getTime()) / (1000 * 60);

      if (elapsed >= minutes) {
        await prisma.attendance.update({
          where: { id: att.id },
          data: { checkOutTime: new Date() }
        });
        console.log(`Auto-checkout: ${att.id} (elapsed: ${Math.round(elapsed)}min, limit: ${minutes}min)`);
      }
    }
  } catch (error) {
    console.error('Auto-checkout error:', error);
  }
}

setInterval(runAutoCheckout, 60_000);
