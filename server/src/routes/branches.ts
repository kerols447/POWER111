import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { checkWebUrl } from '../utils/links.js';

const router = Router();

// List branches — OWNER sees all with counts, others see only their accessible branches
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;

    if (user.role === 'OWNER') {
      const branches = await prisma.branch.findMany({
        include: {
          _count: {
            select: {
              members: true,
              products: true,
              staffAccess: true
            }
          }
        },
        orderBy: { code: 'asc' }
      });
      return res.json(branches);
    }

    const branches = await prisma.branch.findMany({
      where: { id: { in: user.branchIds } },
      select: { id: true, name: true, code: true, address: true, phone: true },
      orderBy: { name: 'asc' }
    });

    res.json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// Get single branch (OWNER only)
router.get('/:id', requireAuth, requireRole('OWNER'), requirePermission('VIEW_BRANCHES'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            members: true,
            products: true,
            staffAccess: true
          }
        }
      }
    });

    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    res.json(branch);
  } catch (error) {
    console.error('Error fetching branch:', error);
    res.status(500).json({ error: 'Failed to fetch branch' });
  }
});

// Create branch (OWNER only)
router.post('/', requireAuth, requireRole('OWNER'), requirePermission('EDIT_BRANCHES'), async (req: Request, res: Response) => {
  try {
    const { name, code, address, locationUrl, phone, whatsapp } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }

    const location = checkWebUrl(locationUrl, 'رابط الخريطة');
    if (!location.ok) {
      return res.status(400).json({ error: 'Validation error', message: location.message });
    }

    // Check if code already exists
    const existing = await prisma.branch.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ error: 'Branch code already exists' });
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        code,
        address,
        locationUrl: location.value,
        phone,
        whatsapp
      }
    });

    res.status(201).json(branch);
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

// Update branch (OWNER only)
router.put('/:id', requireAuth, requireRole('OWNER'), requirePermission('EDIT_BRANCHES'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, address, locationUrl, phone, whatsapp, isActive } = req.body;

    const existing = await prisma.branch.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    const location = checkWebUrl(locationUrl, 'رابط الخريطة');
    if (!location.ok) {
      return res.status(400).json({ error: 'Validation error', message: location.message });
    }

    // Check if new code already exists (if changing code)
    if (code && code !== existing.code) {
      const codeExists = await prisma.branch.findUnique({ where: { code } });
      if (codeExists) {
        return res.status(400).json({ error: 'Branch code already exists' });
      }
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: {
        name,
        code,
        address,
        locationUrl: location.value,
        phone,
        whatsapp,
        isActive
      }
    });

    res.json(branch);
  } catch (error) {
    console.error('Error updating branch:', error);
    res.status(500).json({ error: 'Failed to update branch' });
  }
});

// Delete branch (OWNER only)
router.delete('/:id', requireAuth, requireRole('OWNER'), requirePermission('EDIT_BRANCHES'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.branch.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            members: true,
            products: true,
            staffAccess: true
          }
        }
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Check if branch has data
    if (existing._count.members > 0 || existing._count.products > 0 || existing._count.staffAccess > 0) {
      return res.status(400).json({
        error: 'Cannot delete branch with existing data',
        message: 'الفرع يحتوي على بيانات ولا يمكن حذفه'
      });
    }

    await prisma.branch.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting branch:', error);
    res.status(500).json({ error: 'Failed to delete branch' });
  }
});

export default router;
