import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { requireAuth, requireRole, requireBranchAccess } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { createAuditLog } from './audit.js';
import { generateMemberCode, normalizePhone, isValidEgyptianPhone, parseMemberStatusFilter } from 'shared';

const router = Router();

// Validation schemas
const createMemberSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Phone is required'),
  memberCode: z.string().max(24, 'الكود أطول من 24 حرف').optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  gender: z.enum(['Male', 'Female']).optional(),
  dateOfBirth: z.string().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional(),
  branchId: z.string().min(1, 'Branch is required')
});

const updateMemberSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(10).optional(),
  memberCode: z.string().max(24, 'الكود أطول من 24 حرف').optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  gender: z.enum(['Male', 'Female']).optional(),
  dateOfBirth: z.string().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'FROZEN', 'INACTIVE']).optional()
});

// Codes he types himself are the old system's numbers; auto-generated ones stay 8 chars
async function resolveMemberCode(
  raw: string | undefined,
  exceptMemberId?: string
): Promise<{ code?: string; error?: string }> {
  const code = (raw || '').trim().toUpperCase();
  if (!code) return { code: await generateUniqueCode() };

  if (/\s/.test(code)) return { error: 'الكود لازم يكون من غير مسافات' };

  const clash = await prisma.member.findFirst({
    where: { memberCode: code, ...(exceptMemberId ? { id: { not: exceptMemberId } } : {}) },
    include: { person: { select: { name: true } } }
  });
  if (clash) return { error: `الكود ${code} مستخدم بالفعل للعضو ${clash.person.name}` };

  return { code };
}

// GET /api/members - List members with search and filters
router.get('/', requireAuth, requirePermission('VIEW_MEMBERS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const {
      search,
      branchId,
      status,
      page = 1,
      pageSize = 20
    } = req.query;

    const where: any = {};

    // Branch filter
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

    // Status filter (accepts a comma list, e.g. SUSPENDED,FROZEN)
    if (status) {
      const statusFilter = parseMemberStatusFilter(status);
      if (statusFilter) where.status = statusFilter;
    }

    // Search (name, phone, code)
    if (search) {
      const searchStr = search as string;
      where.OR = [
        {
          person: {
            name: { contains: searchStr, mode: 'insensitive' }
          }
        },
        {
          person: {
            phone: { contains: searchStr, mode: 'insensitive' }
          }
        },
        {
          memberCode: { contains: searchStr, mode: 'insensitive' }
        }
      ];
    }

    // Status filter applies to the list only; the summary cards need the whole
    // branch/search result, so count them from the same filters without status.
    const { status: _ignoredStatus, ...whereForCounts } = where;

    const [members, total, grouped] = await Promise.all([
      prisma.member.findMany({
        where,
        include: {
          person: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              gender: true,
              photoPath: true
            }
          },
          branch: {
            select: {
              id: true,
              name: true,
              code: true
            }
          },
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { endDate: 'desc' },
            take: 1
          }
        },
        // ACTIVE first: Postgres sorts a native enum by declaration order, and ACTIVE leads it.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize)
      }),
      prisma.member.count({ where }),
      prisma.member.groupBy({
        by: ['status'],
        where: whereForCounts,
        _count: { _all: true }
      })
    ]);

    const statusCounts: Record<string, number> = {
      ACTIVE: 0,
      EXPIRED: 0,
      SUSPENDED: 0,
      FROZEN: 0,
      INACTIVE: 0
    };
    grouped.forEach(g => {
      statusCounts[g.status] = g._count._all;
    });

    res.json({
      success: true,
      data: members,
      statusCounts,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / Number(pageSize))
      }
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ في جلب الأعضاء'
    });
  }
});

// GET /api/members/:id - Get single member
router.get('/:id', requireAuth, requirePermission('VIEW_MEMBERS'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req.session as any).user;

    const member = await prisma.member.findUnique({
      where: { id },
      include: {
        person: true,
        branch: {
          include: { settings: true }
        },
        subscriptions: {
          include: {
            plan: true,
            payments: {
              orderBy: { createdAt: 'desc' }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        attendances: {
          orderBy: { checkInTime: 'desc' },
          take: 10
        }
      }
    });

    if (!member) {
      return res.status(404).json({
        error: 'Not found',
        message: 'العضو غير موجود'
      });
    }

    // Check branch access
    if (user.role !== 'OWNER' && !user.branchIds.includes(member.branchId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'ليس لديك صلاحية الوصول لهذا العضو'
      });
    }

    res.json({
      success: true,
      data: member
    });
  } catch (error) {
    console.error('Error fetching member:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ في جلب بيانات العضو'
    });
  }
});

// POST /api/members - Create new member
router.post('/', requireAuth, requirePermission('CREATE_MEMBERS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const data = createMemberSchema.parse(req.body);

    // Check branch access
    if (user.role !== 'OWNER' && !user.branchIds.includes(data.branchId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'ليس لديك صلاحية الإضافة لهذا الفرع'
      });
    }

    // Validate phone
    const normalizedPhone = normalizePhone(data.phone);
    if (!isValidEgyptianPhone(normalizedPhone)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'رقم الهاتف غير صحيح'
      });
    }

    const resolvedCode = await resolveMemberCode(data.memberCode);
    if (resolvedCode.error) {
      return res.status(409).json({ error: 'Duplicate', message: resolvedCode.error });
    }
    const memberCode = resolvedCode.code as string;

    // Check for duplicate phone (across all persons)
    const existingPerson = await prisma.person.findUnique({
      where: { phoneNormalized: normalizedPhone }
    });

    if (existingPerson) {
      // Check if already member at this branch
      const existingMember = await prisma.member.findFirst({
        where: {
          personId: existingPerson.id,
          branchId: data.branchId
        }
      });

      if (existingMember) {
        return res.status(409).json({
          error: 'Duplicate',
          message: 'هذا الشخص عضو بالفعل في هذا الفرع',
          data: { memberId: existingMember.id }
        });
      }

      // Same person, different branch - allow but flag
      const member = await prisma.member.create({
        data: {
          personId: existingPerson.id,
          branchId: data.branchId,
          memberCode,
          notes: data.notes
        }
      });

      await createAuditLog(
        user.id,
        'CREATE_MEMBER',
        'Member',
        member.id,
        data.branchId,
        { action: 'created', memberCode, personId: existingPerson.id, duplicatePhone: true }
      );

      return res.status(201).json({
        success: true,
        data: member,
        warning: 'تم إنشاء العضو - رقم الهاتف مستخدم بالفعل في فرع آخر'
      });
    }

    // New person
    const person = await prisma.person.create({
      data: {
        name: data.name,
        phone: data.phone,
        phoneNormalized: normalizedPhone,
        email: data.email || null,
        gender: data.gender || null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        address: data.address || null,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        notes: data.notes || null
      }
    });

    const member = await prisma.member.create({
      data: {
        personId: person.id,
        branchId: data.branchId,
        memberCode,
        notes: data.notes
      }
    });

    await createAuditLog(
      user.id,
      'CREATE_MEMBER',
      'Member',
      member.id,
      data.branchId,
      { action: 'created', memberCode, personId: person.id }
    );

    res.status(201).json({
      success: true,
      data: member
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.errors[0].message
      });
    }
    console.error('Error creating member:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ في إنشاء العضو'
    });
  }
});

// PATCH /api/members/:id - Update member
router.patch('/:id', requireAuth, requirePermission('EDIT_MEMBERS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;
    const data = updateMemberSchema.parse(req.body);

    const member = await prisma.member.findUnique({
      where: { id },
      include: { person: true }
    });

    if (!member) {
      return res.status(404).json({
        error: 'Not found',
        message: 'العضو غير موجود'
      });
    }

    // Check branch access
    if (user.role !== 'OWNER' && !user.branchIds.includes(member.branchId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'ليس لديك صلاحية التعديل لهذا العضو'
      });
    }

    const updates: any = {};

    // Update person data
    if (data.name || data.phone || data.email || data.gender || data.dateOfBirth || data.address || data.emergencyContactName || data.emergencyContactPhone || data.notes) {
      const personUpdates: any = {};
      if (data.name) personUpdates.name = data.name;
      if (data.phone) {
        const normalizedPhone = normalizePhone(data.phone);
        if (!isValidEgyptianPhone(normalizedPhone)) {
          return res.status(400).json({
            error: 'Validation error',
            message: 'رقم الهاتف غير صحيح'
          });
        }
        // The phone is the portal login key, so one number can belong to only one person
        const holder = await prisma.person.findUnique({
          where: { phoneNormalized: normalizedPhone },
          select: { id: true, name: true }
        });
        if (holder && holder.id !== member.personId) {
          return res.status(409).json({
            error: 'Duplicate',
            message: `الرقم ده مسجل بالفعل للعضو ${holder.name}`
          });
        }
        personUpdates.phone = data.phone;
        personUpdates.phoneNormalized = normalizedPhone;
      }
      if (data.email !== undefined) personUpdates.email = data.email || null;
      if (data.gender) personUpdates.gender = data.gender;
      if (data.dateOfBirth) personUpdates.dateOfBirth = new Date(data.dateOfBirth);
      if (data.address !== undefined) personUpdates.address = data.address || null;
      if (data.emergencyContactName !== undefined) personUpdates.emergencyContactName = data.emergencyContactName || null;
      if (data.emergencyContactPhone !== undefined) personUpdates.emergencyContactPhone = data.emergencyContactPhone || null;
      if (data.notes !== undefined) personUpdates.notes = data.notes || null;

      updates.person = { update: personUpdates };
    }

    // Update member status
    if (data.status) {
      updates.status = data.status;
    }

    // He reuses the old system's codes and sometimes needs to fix one
    const wantedCode = (data.memberCode || '').trim();
    if (wantedCode && wantedCode.toUpperCase() !== member.memberCode) {
      const resolvedCode = await resolveMemberCode(wantedCode, id);
      if (resolvedCode.error) {
        return res.status(409).json({ error: 'Duplicate', message: resolvedCode.error });
      }
      updates.memberCode = resolvedCode.code;
    }

    const updatedMember = await prisma.member.update({
      where: { id },
      data: updates,
      include: { person: true }
    });

    await createAuditLog(
      user.id,
      'UPDATE_MEMBER',
      'Member',
      id,
      member.branchId,
      { action: 'updated', changes: data }
    );

    res.json({
      success: true,
      data: updatedMember
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.errors[0].message
      });
    }
    console.error('Error updating member:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ في تحديث العضو'
    });
  }
});

// DELETE /api/members/:id - Hard delete member and all related data
router.delete('/:id', requireAuth, requirePermission('DELETE_MEMBERS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const member = await prisma.member.findUnique({
      where: { id }
    });

    if (!member) {
      return res.status(404).json({
        error: 'Not found',
        message: 'العضو غير موجود'
      });
    }

    // Check branch access
    if (user.role !== 'OWNER' && !user.branchIds.includes(member.branchId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'ليس لديك صلاحية الحذف لهذا العضو'
      });
    }

    const personId = member.personId;

    // Hard delete member (cascades to subscriptions, attendances, payments)
    await prisma.member.delete({
      where: { id }
    });

    // Check if person has any other memberships
    const otherMemberships = await prisma.member.count({
      where: { personId }
    });

    // If no other memberships, delete the person too
    if (otherMemberships === 0) {
      await prisma.person.delete({
        where: { id: personId }
      });
    }

    await createAuditLog(
      user.id,
      'DELETE_MEMBER',
      'Member',
      id,
      member.branchId,
      { action: 'deleted', personId, personDeleted: otherMemberships === 0 }
    );

    res.json({
      success: true,
      message: 'تم حذف العضو نهائياً'
    });
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ في حذف العضو'
    });
  }
});

// Helper: Generate unique member code with retry
async function generateUniqueCode(maxAttempts: number = 10): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateMemberCode();
    const existing = await prisma.member.findUnique({
      where: { memberCode: code }
    });
    if (!existing) {
      return code;
    }
  }
  throw new Error('Failed to generate unique member code');
}

// GET /api/members/:id/qr — Generate QR code for member
router.get('/:id/qr', requireAuth, requirePermission('VIEW_MEMBERS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const member = await prisma.member.findUnique({
      where: { id },
      include: {
        person: true,
        branch: true
      }
    });

    if (!member) {
      return res.status(404).json({
        error: 'Not found',
        message: 'العضو غير موجود'
      });
    }

    // Verify branch access
    if (user.role !== 'OWNER' && !user.branchIds.includes(member.branchId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'ليس لديك صلاحية الوصول لهذا العضو'
      });
    }

    const QRCode = await import('qrcode');
    const qrData = JSON.stringify({
      memberCode: member.memberCode,
      name: member.person.name,
      branch: member.branch.code
    });

    const qrImage = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.json({
      success: true,
      data: {
        memberCode: member.memberCode,
        memberName: member.person.name,
        branchName: member.branch.name,
        qrImage
      }
    });
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ في إنشاء رمز QR'
    });
  }
});

export default router;
