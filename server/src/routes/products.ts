import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

// List products with filters
router.get('/', requireAuth, requirePermission('VIEW_PRODUCTS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { branchId, search, lowStock, active } = req.query;

    let targetBranchIds: string[] = user.branchIds;
    if (user.role === 'OWNER') {
      targetBranchIds = (await prisma.branch.findMany({ select: { id: true } })).map((b: any) => b.id);
    }

    if (branchId && typeof branchId === 'string') {
      if (!targetBranchIds.includes(branchId)) {
        return res.status(403).json({ error: 'لا تملك صلاحية لهذا الفرع' });
      }
      targetBranchIds = [branchId];
    }

    const where: any = {
      branchId: { in: targetBranchIds }
    };

    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nameAr: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (active !== undefined) {
      where.isActive = active === 'true';
    }

    if (lowStock === 'true') {
      where.quantity = { lte: prisma.product.fields.lowStockThreshold };
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        branch: {
          select: { name: true, code: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'فشل في جلب المنتجات' });
  }
});

// Get single product
router.get('/:id', requireAuth, requirePermission('VIEW_PRODUCTS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        branch: {
          select: { name: true, code: true }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(product.branchId)) {
      return res.status(403).json({ error: 'لا تملك صلاحية لهذا الفرع' });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'فشل في جلب المنتج' });
  }
});

// Create product
router.post('/', requireAuth, requirePermission('CREATE_PRODUCTS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const {
      branchId,
      name,
      nameAr,
      sku,
      barcode,
      image,
      pricePiasters,
      costPiasters,
      quantity,
      lowStockThreshold
    } = req.body;

    if (!branchId || !name || pricePiasters === undefined) {
      return res.status(400).json({ error: 'الحقول المطلوبة مفقودة' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(branchId)) {
      return res.status(403).json({ error: 'لا تملك صلاحية لهذا الفرع' });
    }

    if (barcode) {
      const existing = await prisma.product.findFirst({
        where: { branchId, barcode }
      });
      if (existing) {
        return res.status(400).json({ error: 'الباركود مستخدم بالفعل' });
      }
    }

    const product = await prisma.product.create({
      data: {
        branchId,
        name,
        nameAr,
        sku,
        barcode,
        image,
        pricePiasters,
        costPiasters: costPiasters || null,
        quantity: quantity || 0,
        lowStockThreshold: lowStockThreshold || 5
      },
      include: {
        branch: {
          select: { name: true, code: true }
        }
      }
    });

    if (quantity && quantity > 0) {
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          branchId,
          type: 'INCOMING',
          quantity,
          notes: 'رصيد افتتاحي',
          createdBy: user.id
        }
      });
    }

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'فشل في إنشاء المنتج' });
  }
});

// Update product
router.put('/:id', requireAuth, requirePermission('EDIT_PRODUCTS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;
    const {
      name,
      nameAr,
      sku,
      barcode,
      image,
      pricePiasters,
      costPiasters,
      lowStockThreshold,
      isActive
    } = req.body;

    const existing = await prisma.product.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(existing.branchId)) {
      return res.status(403).json({ error: 'لا تملك صلاحية لهذا الفرع' });
    }

    if (barcode && barcode !== existing.barcode) {
      const duplicate = await prisma.product.findFirst({
        where: {
          branchId: existing.branchId,
          barcode,
          id: { not: id }
        }
      });
      if (duplicate) {
        return res.status(400).json({ error: 'الباركود مستخدم بالفعل' });
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        name,
        nameAr,
        sku,
        barcode,
        image,
        pricePiasters,
        costPiasters,
        lowStockThreshold,
        isActive
      },
      include: {
        branch: {
          select: { name: true, code: true }
        }
      }
    });

    res.json({ success: true, data: product });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'فشل في تحديث المنتج' });
  }
});

// Adjust stock
router.post('/:id/stock', requireAuth, requirePermission('EDIT_PRODUCTS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;
    const { type, quantity, notes } = req.body;

    if (!type || quantity === undefined) {
      return res.status(400).json({ error: 'الحقول المطلوبة مفقودة' });
    }

    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(product.branchId)) {
      return res.status(403).json({ error: 'لا تملك صلاحية لهذا الفرع' });
    }

    let quantityChange = quantity;
    if (type === 'SALE' || type === 'ADJUSTMENT' && quantity < 0) {
      quantityChange = -Math.abs(quantity);
      if (product.quantity + quantityChange < 0) {
        return res.status(400).json({ error: 'الكمية غير كافية' });
      }
    } else if (type === 'INCOMING' || type === 'RETURN' || type === 'ADJUSTMENT' && quantity > 0) {
      quantityChange = Math.abs(quantity);
    } else {
      return res.status(400).json({ error: 'نوع الحركة غير صالح' });
    }

    const [movement, updatedProduct] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          productId: id,
          branchId: product.branchId,
          type,
          quantity: quantityChange,
          notes,
          createdBy: user.id
        }
      }),
      prisma.product.update({
        where: { id },
        data: {
          quantity: {
            increment: quantityChange
          }
        },
        include: {
          branch: {
            select: { name: true, code: true }
          }
        }
      })
    ]);

    res.json({ success: true, data: { movement, product: updatedProduct } });
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(500).json({ error: 'فشل في تعديل المخزون' });
  }
});

// Get stock movements for a product
router.get('/:id/movements', requireAuth, requirePermission('VIEW_PRODUCTS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(product.branchId)) {
      return res.status(403).json({ error: 'لا تملك صلاحية لهذا الفرع' });
    }

    const movements = await prisma.stockMovement.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({ success: true, data: movements });
  } catch (error) {
    console.error('Error fetching stock movements:', error);
    res.status(500).json({ error: 'فشل في جلب حركات المخزون' });
  }
});

// Delete product
router.delete('/:id', requireAuth, requirePermission('DELETE_PRODUCTS'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(product.branchId)) {
      return res.status(403).json({ error: 'لا تملك صلاحية لهذا الفرع' });
    }

    const salesCount = await prisma.saleItem.count({
      where: { productId: id }
    });

    if (salesCount > 0) {
      return res.status(400).json({
        error: 'لا يمكن حذف منتج تم بيعه. قم بإلغاء تفعيله بدلاً من ذلك.'
      });
    }

    await prisma.product.delete({
      where: { id }
    });

    res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'فشل في حذف المنتج' });
  }
});

export default router;
