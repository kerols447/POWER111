import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { initializeUserPermissions, ROLE_PERMISSIONS } from '../utils/permissions.js';

const router = Router();

const createUserSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['OWNER', 'BRANCH_MANAGER', 'RECEPTIONIST', 'ACCOUNTANT', 'TRAINER', 'CONTENT_MANAGER']),
  phone: z.string().optional(),
  branchIds: z.array(z.string()).optional()
});

const updateUserSchema = z.object({
  email: z.string().email('Invalid email').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  name: z.string().min(1, 'Name is required').optional(),
  role: z.enum(['OWNER', 'BRANCH_MANAGER', 'RECEPTIONIST', 'ACCOUNTANT', 'TRAINER', 'CONTENT_MANAGER']).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  branchIds: z.array(z.string()).optional()
});

// List all users (OWNER only)
router.get('/', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
        branchAccess: {
          select: {
            branch: {
              select: {
                id: true,
                name: true,
                code: true
              }
            }
          }
        },
        permissions: {
          select: {
            permission: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get all available permissions list
router.get('/permissions/list', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    res.json({
      permissions: ROLE_PERMISSIONS,
      allPermissions: Object.values(ROLE_PERMISSIONS.OWNER)
    });
  } catch (error) {
    console.error('Error fetching permissions list:', error);
    res.status(500).json({ error: 'Failed to fetch permissions list' });
  }
});

// Get single user (OWNER only)
router.get('/:id', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
        branchAccess: {
          select: {
            branch: {
              select: {
                id: true,
                name: true,
                code: true
              }
            }
          }
        },
        permissions: {
          select: {
            permission: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create user (OWNER only)
router.post('/', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const data = createUserSchema.parse(req.body);

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        role: data.role,
        phone: data.phone
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true
      }
    });

    // Assign branch access if provided
    if (data.branchIds && data.branchIds.length > 0) {
      await prisma.branchAccess.createMany({
        data: data.branchIds.map(branchId => ({
          userId: user.id,
          branchId
        }))
      });
    }

    // Initialize permissions based on role
    await initializeUserPermissions(user.id, data.role);

    // Fetch user with branch access and permissions
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
        branchAccess: {
          select: {
            branch: {
              select: {
                id: true,
                name: true,
                code: true
              }
            }
          }
        },
        permissions: {
          select: {
            permission: true
          }
        }
      }
    });

    res.status(201).json(fullUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (OWNER only)
router.put('/:id', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if new email already exists (if changing email)
    if (data.email && data.email !== existing.email) {
      const emailExists = await prisma.user.findUnique({ where: { email: data.email } });
      if (emailExists) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (data.email) updateData.email = data.email;
    if (data.name) updateData.name = data.name;
    if (data.role) updateData.role = data.role;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }

    // Update user
    await prisma.user.update({
      where: { id },
      data: updateData
    });

    // Update permissions if role changed
    if (data.role) {
      await initializeUserPermissions(id, data.role);
    }

    // Update branch access if provided
    if (data.branchIds) {
      // Delete existing branch access
      await prisma.branchAccess.deleteMany({
        where: { userId: id }
      });

      // Create new branch access
      if (data.branchIds.length > 0) {
        await prisma.branchAccess.createMany({
          data: data.branchIds.map(branchId => ({
            userId: id,
            branchId
          }))
        });
      }
    }

    // Fetch updated user
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
        branchAccess: {
          select: {
            branch: {
              select: {
                id: true,
                name: true,
                code: true
              }
            }
          }
        },
        permissions: {
          select: {
            permission: true
          }
        }
      }
    });

    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (OWNER only)
router.delete('/:id', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting yourself
    const currentUser = (req.session as any).user;
    if (currentUser.id === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Delete user (branch access will be cascade deleted)
    await prisma.user.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Update user permissions (OWNER only)
router.put('/:id/permissions', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Permissions must be an array' });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete existing permissions
    await prisma.userPermission.deleteMany({
      where: { userId: id }
    });

    // Create new permissions
    if (permissions.length > 0) {
      await prisma.userPermission.createMany({
        data: permissions.map((permission: string) => ({
          userId: id,
          permission: permission as any
        }))
      });
    }

    // Fetch updated user
    const updatedUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        permissions: {
          select: {
            permission: true
          }
        }
      }
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating permissions:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

export default router;
