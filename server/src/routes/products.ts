import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Setup multer for image uploads
const uploadDir = path.join(process.cwd(), 'uploads', 'products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `product-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('نوع الصورة غير مدعوم'));
    }
  }
});

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

// Generate automatic barcode (EAN-13 format)
function generateEAN13(): string {
  const digits: number[] = [];
  for (let i = 0; i < 12; i++) {
    digits.push(Math.floor(Math.random() * 10));
  }

  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  digits.push(checkDigit);

  return digits.join('');
}

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

    // Generate barcode if not provided
    let finalBarcode = barcode;
    if (!finalBarcode) {
      let attempts = 0;
      do {
        finalBarcode = generateEAN13();
        const existing = await prisma.product.findFirst({
          where: { barcode: finalBarcode }
        });
        if (!existing) break;
        attempts++;
      } while (attempts < 10);
    } else {
      const existing = await prisma.product.findFirst({
        where: { branchId, barcode: finalBarcode }
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
        barcode: finalBarcode,
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

    // Delete image file if exists
    if (product.image) {
      const imagePath = path.join(process.cwd(), product.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
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

// Upload product image
router.post('/:id/image', requireAuth, requirePermission('EDIT_PRODUCTS'), upload.single('image'), async (req: Request, res: Response) => {
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

    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم رفع صورة' });
    }

    // Delete old image if exists
    if (product.image) {
      const oldImagePath = path.join(process.cwd(), product.image);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    const imagePath = `/uploads/products/${req.file.filename}`;

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: { image: imagePath },
      include: {
        branch: {
          select: { name: true, code: true }
        }
      }
    });

    res.json({ success: true, data: updatedProduct });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'فشل في رفع الصورة' });
  }
});

export default router;
