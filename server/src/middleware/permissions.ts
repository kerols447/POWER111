import { Request, Response, NextFunction } from 'express';
import { userHasPermission, getUserBranchIds } from '../utils/permissions.js';

// Permission check middleware
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req.session as any).user;

    if (!user) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'يجب تسجيل الدخول أولاً'
      });
    }

    const hasPermission = await userHasPermission(user.id, permission);

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'ليس لديك صلاحية للوصول'
      });
    }

    next();
  };
}

// Branch access middleware - ensures user can access the specified branch
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

  const branchId = req.params.branchId || req.body.branchId || req.query.branchId;

  if (!branchId) {
    return next(); // No branch specified, let the route handle it
  }

  // Check if user has access to this branch
  getUserBranchIds(user.id).then(branchIds => {
    if (!branchIds.includes(branchId as string)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'ليس لديك صلاحية الوصول لهذا الفرع'
      });
    }
    next();
  });
}
