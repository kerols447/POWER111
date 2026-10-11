import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

async function getAutoCheckoutMinutes(branchId: string): Promise<number> {
  const row: any = await prisma.$queryRaw`
    SELECT value FROM app_settings WHERE key = 'autoCheckoutMinutes' AND branch_id = ${branchId}
  `;
  return row?.[0] ? parseInt(row[0].value) : 120;
}

async function setAutoCheckoutMinutes(branchId: string, minutes: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO app_settings (key, branch_id, value)
    VALUES ('autoCheckoutMinutes', ${branchId}, ${String(minutes)})
    ON CONFLICT (key, branch_id) DO UPDATE SET value = ${String(minutes)}, updated_at = now()
  `;
}

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
      const newSettings = await prisma.branchSettings.create({
        data: { branchId }
      });
      const autoCheckout = await getAutoCheckoutMinutes(branchId);
      return res.json({ ...newSettings, autoCheckoutMinutes: autoCheckout });
    }

    const autoCheckout = await getAutoCheckoutMinutes(branchId);
    res.json({ ...settings, autoCheckoutMinutes: autoCheckout });
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
      autoCheckoutMinutes,
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

    if (autoCheckoutMinutes !== undefined) {
      await setAutoCheckoutMinutes(branchId, parseInt(autoCheckoutMinutes) || 120);
    }

    const finalAutoCheckout = await getAutoCheckoutMinutes(branchId);
    res.json({ ...settings, autoCheckoutMinutes: finalAutoCheckout });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
