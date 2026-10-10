import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// List offers
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const offers = await prisma.offer.findMany({
      include: {
        branch: {
          select: { id: true, name: true, code: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(offers);
  } catch (error) {
    console.error('Error fetching offers:', error);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

// Create offer
router.post('/', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const {
      title,
      titleAr,
      description,
      descriptionAr,
      branchId,
      discountPercent,
      startDate,
      endDate,
      isPublished
    } = req.body;

    if (!title || !startDate || !endDate) {
      return res.status(400).json({ error: 'Title, start date, and end date are required' });
    }

    const offer = await prisma.offer.create({
      data: {
        title,
        titleAr,
        description,
        descriptionAr,
        branchId: branchId || null,
        discountPercent: discountPercent || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isPublished: isPublished || false
      }
    });

    res.status(201).json(offer);
  } catch (error) {
    console.error('Error creating offer:', error);
    res.status(500).json({ error: 'Failed to create offer' });
  }
});

// Update offer
router.put('/:id', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      titleAr,
      description,
      descriptionAr,
      branchId,
      discountPercent,
      startDate,
      endDate,
      isPublished
    } = req.body;

    const existing = await prisma.offer.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const offer = await prisma.offer.update({
      where: { id },
      data: {
        title,
        titleAr,
        description,
        descriptionAr,
        branchId: branchId || null,
        discountPercent: discountPercent || null,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        isPublished
      }
    });

    res.json(offer);
  } catch (error) {
    console.error('Error updating offer:', error);
    res.status(500).json({ error: 'Failed to update offer' });
  }
});

// Delete offer
router.delete('/:id', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.offer.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    await prisma.offer.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).json({ error: 'Failed to delete offer' });
  }
});

export default router;
