import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../index.js';
import { ROLE_PERMISSIONS } from '../utils/permissions.js';

const router = Router();

// Login validation schema
const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        branchAccess: {
          include: {
            branch: true
          }
        }
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
      });
    }

    // Store user in session
    (req.session as any).user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      branchIds: user.branchAccess.map(ba => ba.branchId)
    };

    // Fetch user permissions from DB
    const userPermissions = await prisma.userPermission.findMany({
      where: { userId: user.id },
      select: { permission: true }
    });

    const permissions = userPermissions.map(up => up.permission);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branches: user.branchAccess.map(ba => ({
          id: ba.branch.id,
          name: ba.branch.name,
          code: ba.branch.code
        })),
        permissions
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.errors[0].message
      });
    }
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ غير متوقع'
    });
  }
});

// Logout endpoint
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        error: 'Logout failed',
        message: 'فشل تسجيل الخروج'
      });
    }
    res.json({
      success: true,
      message: 'تم تسجيل الخروج بنجاح'
    });
  });
});

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  const user = (req.session as any).user;

  if (!user) {
    return res.status(401).json({
      error: 'Not authenticated',
      message: 'غير مسجل دخول'
    });
  }

  // Fetch permissions
  const userPermissions = await prisma.userPermission.findMany({
    where: { userId: user.id },
    select: { permission: true }
  });

  const permissions = userPermissions.map(up => up.permission);

  res.json({
    user: {
      ...user,
      permissions
    }
  });
});

export default router;
