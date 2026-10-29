import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { notifyBranchMembers } from '../utils/push.js';

const router = Router();

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function arabicDay(value: Date): string {
  const d = new Date(value);
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Members who installed the app hear about an offer the moment it goes live.
async function announceOffer(offer: { title: string; titleAr: string | null; discountPercent: number | null; endDate: Date; branchId: string | null }) {
  const title = offer.titleAr || offer.title;
  await notifyBranchMembers(offer.branchId, {
    kind: 'NEW_OFFER',
    title: `عرض جديد: ${title}`,
    body: offer.discountPercent
      ? `خصم ${offer.discountPercent}٪ — آخر يوم ${arabicDay(offer.endDate)}`
      : `سارعي — العرض لحد ${arabicDay(offer.endDate)}`,
    link: '/portal'
  });
}

// List offers — a manager or employee only sees the global ones plus their own branch
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const offers = await prisma.offer.findMany({
      where: user.role === 'OWNER'
        ? {}
        : { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] },
      orderBy: { createdAt: 'desc' },
      take: 200
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

    if (offer.isPublished) await announceOffer(offer);

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

    // Going from hidden to published is what tells the members about it.
    const nowPublished = isPublished === undefined ? existing.isPublished : Boolean(isPublished);
    if (nowPublished && !existing.isPublished) await announceOffer(offer);

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
