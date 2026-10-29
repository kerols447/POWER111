import { Request, Response, NextFunction } from 'express';
import { userHasPermission } from '../utils/permissions.js';

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
