import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { requireAuth, requireRole, requireBranchAccess } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { createAuditLog } from './audit.js';
import { generateMemberCode, normalizePhone, isValidEgyptianPhone } from 'shared';

const router = Router();

// Validation schemas
const createMemberSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Phone is required'),
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
  email: z.string().email().optional().or(z.literal('')),
  gender: z.enum(['Male', 'Female']).optional(),
  dateOfBirth: z.string().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'FROZEN', 'INACTIVE']).optional()
});

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

    // Status filter
    if (status) {
      where.status = status;
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

    const [members, total] = await Promise.all([
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
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize)
      }),
      prisma.member.count({ where })
    ]);

    res.json({
      success: true,
      data: members,
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
      const memberCode = await generateUniqueCode();
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
    const memberCode = await generateUniqueCode();

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
