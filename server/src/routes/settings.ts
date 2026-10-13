import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

function toInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Get branch settings
router.get('/:branchId', requireAuth, requirePermission('MANAGE_SETTINGS'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { branchId } = req.params;

    if (sessionUser.role !== 'OWNER' && !sessionUser.branchIds.includes(branchId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const settings = await prisma.branchSettings.upsert({
      where: { branchId },
      update: {},
      create: { branchId }
    });

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update branch settings
router.put('/:branchId', requireAuth, requirePermission('MANAGE_SETTINGS'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { branchId } = req.params;
    const {
      taxEnabled,
      taxRatePercent,
      maxFreezeDays,
      freezeRequiresApproval,
      allowCrossBranchCheckin,
      autoCheckoutEnabled,
      autoCheckoutMinutes,
      lowStockThreshold,
      currency,
      timezone
    } = req.body;

    if (sessionUser.role !== 'OWNER' && !sessionUser.branchIds.includes(branchId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const minutes = toInt(autoCheckoutMinutes);

    const settings = await prisma.branchSettings.upsert({
      where: { branchId },
      update: {
        taxEnabled: taxEnabled !== undefined ? taxEnabled : undefined,
        taxRatePercent: toInt(taxRatePercent),
        maxFreezeDays: toInt(maxFreezeDays),
        freezeRequiresApproval: freezeRequiresApproval !== undefined ? freezeRequiresApproval : undefined,
        allowCrossBranchCheckin: allowCrossBranchCheckin !== undefined ? allowCrossBranchCheckin : undefined,
        autoCheckoutEnabled: autoCheckoutEnabled !== undefined ? autoCheckoutEnabled : undefined,
        autoCheckoutMinutes: minutes !== undefined ? Math.min(Math.max(minutes, 0), 1440) : undefined,
        lowStockThreshold: toInt(lowStockThreshold),
        currency: currency || undefined,
        timezone: timezone || undefined
      },
      create: {
        branchId,
        taxEnabled: taxEnabled || false,
        taxRatePercent: toInt(taxRatePercent) ?? 0,
        maxFreezeDays: toInt(maxFreezeDays) ?? 30,
        freezeRequiresApproval: freezeRequiresApproval !== undefined ? freezeRequiresApproval : true,
        allowCrossBranchCheckin: allowCrossBranchCheckin === true,
        autoCheckoutEnabled: autoCheckoutEnabled !== undefined ? autoCheckoutEnabled : true,
        autoCheckoutMinutes: minutes !== undefined ? Math.min(Math.max(minutes, 0), 1440) : 90,
        lowStockThreshold: toInt(lowStockThreshold) ?? 5,
        currency: currency || 'EGP',
        timezone: timezone || 'Africa/Cairo'
      }
    });

    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
