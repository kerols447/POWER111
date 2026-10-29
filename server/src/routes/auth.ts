import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../index.js';
import { createLoginThrottle } from '../utils/throttle.js';

const router = Router();

// Same shape as the portal limiter: a blocked key is refused before the password is even
// compared, so a bot cannot grind through guesses at staff passwords.
const loginThrottle = createLoginThrottle(8, 15 * 60 * 1000);

// Login validation schema
const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const rateKey = email.toLowerCase();
    if (loginThrottle.blocked(rateKey)) {
      return res.status(429).json({
        error: 'Too many attempts',
        message: 'محاولات دخول كتير. استنى 15 دقيقة وحاول تاني'
      });
    }

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
      loginThrottle.record(rateKey);
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      loginThrottle.record(rateKey);
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
      });
    }

    loginThrottle.clear(rateKey);

    const permissions = await prisma.userPermission.findMany({
      where: { userId: user.id },
      select: { permission: true }
    });

    // A fresh session id per login, so a cookie handed out before authentication (or one an
    // attacker planted) can never be promoted into a signed-in session.
    req.session.regenerate((error: any) => {
      if (error) {
        console.error('Session regenerate failed:', error);
        return res.status(500).json({ error: 'Internal server error', message: 'فشل تسجيل الدخول' });
      }

      (req.session as any).user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branchIds: user.branchAccess.map(ba => ba.branchId)
      };

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
          permissions: permissions.map(up => up.permission)
        }
      });
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

  // The session snapshot is taken at login, so a deactivated or deleted account has to be
  // checked here — otherwise an employee cut off in UsersPage keeps his access for 24 hours.
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    include: { branchAccess: { select: { branchId: true } } }
  });

  if (!account || !account.isActive) {
    return req.session.destroy(() => {
      res.status(401).json({
        error: 'Not authenticated',
        message: 'الحساب ده مقفل أو اتحذف. تواصل مع الإدارة'
      });
    });
  }

  // Fetch permissions
  const userPermissions = await prisma.userPermission.findMany({
    where: { userId: user.id },
    select: { permission: true }
  });

  const permissions = userPermissions.map(up => up.permission);
  const branchIds = account.branchAccess.map(ba => ba.branchId);
  (req.session as any).user = {
    ...user,
    role: account.role,
    branchIds
  };

  res.json({
    user: {
      ...user,
      role: account.role,
      branchIds,
      permissions
    }
  });
});

export default router;
