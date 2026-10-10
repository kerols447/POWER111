import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Create audit log helper
export async function createAuditLog(
  userId: string | undefined,
  action: string,
  entityType: string,
  entityId: string | undefined,
  branchId: string | undefined,
  data: any,
  ipAddress?: string
) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      branchId,
      data,
      ipAddress
    }
  });
}

// Get audit logs (owner/manager only)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { branchId, page = 1, pageSize = 50 } = req.query;

    const where: any = {};

    // Filter by branch
    if (branchId) {
      if (user.role !== 'OWNER' && !user.branchIds.includes(branchId as string)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'ليس لديك صلاحية الوصول لهذا الفرع'
        });
      }
      where.branchId = branchId;
    } else if (user.role !== 'OWNER') {
      where.branchId = { in: user.branchIds };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize)
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({
      success: true,
      logs,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / Number(pageSize))
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ في جلب السجلات'
    });
  }
});

export default router;
