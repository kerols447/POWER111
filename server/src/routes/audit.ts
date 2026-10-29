import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { readPage, readPageSize } from '../utils/paging.js';

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
router.get('/', requireAuth, requireRole('OWNER', 'BRANCH_MANAGER'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : '';
    const page = readPage(req.query.page);
    const pageSize = readPageSize(req.query.pageSize, 50, 200);

    const where: any = {};

    // Filter by branch
    if (branchId) {
      if (user.role !== 'OWNER' && !user.branchIds.includes(branchId)) {
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
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({
      success: true,
      logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
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
