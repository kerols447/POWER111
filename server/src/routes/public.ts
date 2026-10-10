import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';

const router = Router();

// GET /api/public/landing — public data for the landing page (branches + active plans + offers)
router.get('/landing', async (_req: Request, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        locationUrl: true,
        phone: true,
        whatsapp: true
      },
      orderBy: { createdAt: 'asc' }
    });

    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      select: {
        id: true,
        branchId: true,
        nameAr: true,
        durationDays: true,
        pricePiasters: true,
        descriptionAr: true
      },
      orderBy: { pricePiasters: 'asc' }
    });

    const now = new Date();
    const offers = await prisma.offer.findMany({
      where: {
        isPublished: true,
        startDate: { lte: now },
        endDate: { gte: now }
      },
      select: {
        id: true,
        branchId: true,
        title: true,
        titleAr: true,
        description: true,
        descriptionAr: true,
        imagePath: true,
        discountPercent: true,
        startDate: true,
        endDate: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: {
        branches: branches.map(b => ({
          ...b,
          plans: plans.filter(p => p.branchId === b.id)
        })),
        offers
      }
    });
  } catch (error) {
    console.error('Error fetching landing data:', error);
    res.status(500).json({ error: 'Internal server error', message: 'حدث خطأ في جلب البيانات' });
  }
});

export default router;
