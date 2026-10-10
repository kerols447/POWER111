import { Request, Response, NextFunction } from 'express';

// Extend Express Session type
declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      name: string;
      role: string;
      branchIds: string[];
    };
  }
}

// Authentication middleware
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = (req.session as any).user;

  if (!user) {
    return res.status(401).json({
      error: 'Not authenticated',
      message: 'يجب تسجيل الدخول أولاً'
    });
  }

  next();
}

// Role-based authorization middleware
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req.session as any).user;

    if (!user) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'يجب تسجيل الدخول أولاً'
      });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'ليس لديك صلاحية للوصول'
      });
    }

    next();
  };
}

// Branch-scoped authorization middleware
export function requireBranchAccess(req: Request, res: Response, next: NextFunction) {
  const user = (req.session as any).user;

  if (!user) {
    return res.status(401).json({
      error: 'Not authenticated',
      message: 'يجب تسجيل الدخول أولاً'
    });
  }

  // Owner has access to all branches
  if (user.role === 'OWNER') {
    return next();
  }

  const branchId = req.params.branchId || req.body.branchId;

  if (!branchId) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'Branch ID is required'
    });
  }

  if (!user.branchIds.includes(branchId)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'ليس لديك صلاحية الوصول لهذا الفرع'
    });
  }

  next();
}
