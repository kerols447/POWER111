import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

// Get branch settings
router.get('/:branchId', requireAuth, requirePermission('MANAGE_SETTINGS'), async (req: Request, res: Response) => {
  try {
    const sessionUser = (req.session as any).user;
    const { branchId } = req.params;

    if (sessionUser.role !== 'OWNER' && !sessionUser.branchIds.includes(branchId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const settings = await prisma.branchSettings.findUnique({
      where: { branchId }
    });

    if (!settings) {
      // Create default settings
      const newSettings = await prisma.branchSettings.create({
        data: { branchId }
      });
      return res.json(newSettings);
    }

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
      lowStockThreshold,
      currency,
      timezone
    } = req.body;

    if (sessionUser.role !== 'OWNER' && !sessionUser.branchIds.includes(branchId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const settings = await prisma.branchSettings.upsert({
      where: { branchId },
      update: {
        taxEnabled: taxEnabled !== undefined ? taxEnabled : undefined,
        taxRatePercent: taxRatePercent !== undefined ? parseInt(taxRatePercent) : undefined,
        maxFreezeDays: maxFreezeDays !== undefined ? parseInt(maxFreezeDays) : undefined,
        freezeRequiresApproval: freezeRequiresApproval !== undefined ? freezeRequiresApproval : undefined,
        allowCrossBranchCheckin: allowCrossBranchCheckin !== undefined ? allowCrossBranchCheckin : undefined,
        lowStockThreshold: lowStockThreshold !== undefined ? parseInt(lowStockThreshold) : undefined,
        currency: currency || undefined,
        timezone: timezone || undefined
      },
      create: {
        branchId,
        taxEnabled: taxEnabled || false,
        taxRatePercent: taxRatePercent ? parseInt(taxRatePercent) : 0,
        maxFreezeDays: maxFreezeDays ? parseInt(maxFreezeDays) : 30,
        freezeRequiresApproval: freezeRequiresApproval !== undefined ? freezeRequiresApproval : true,
        allowCrossBranchCheckin: allowCrossBranchCheckin !== undefined ? allowCrossBranchCheckin : true,
        lowStockThreshold: lowStockThreshold ? parseInt(lowStockThreshold) : 5,
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
