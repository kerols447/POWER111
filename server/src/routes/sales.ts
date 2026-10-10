import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

function generateInvoiceNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${timestamp}-${random}`;
}

// Create sale
router.post('/', requireAuth, requirePermission('CREATE_SALES'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { branchId, items, discountPiasters, paymentMethod, notes } = req.body;

    if (!branchId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'الحقول المطلوبة مفقودة' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(branchId)) {
      return res.status(403).json({ error: 'لا تملك صلاحية لهذا الفرع' });
    }

    let subtotalPiasters = 0;
    const saleItems: { productId: string; quantity: number; unitPricePiasters: number; totalPiasters: number }[] = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId }
      });

      if (!product) {
        return res.status(400).json({ error: `المنتج غير موجود` });
      }

      if (product.branchId !== branchId) {
        return res.status(400).json({ error: `المنتج لا ينتمي لهذا الفرع` });
      }

      if (product.quantity < item.quantity) {
        return res.status(400).json({ error: `الكمية غير كافية للمنتج: ${product.name}` });
      }

      const unitPrice = item.pricePiasters || product.pricePiasters;
      const totalPiasters = unitPrice * item.quantity;
      subtotalPiasters += totalPiasters;

      saleItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPricePiasters: unitPrice,
        totalPiasters
      });
    }

    const discount = discountPiasters || 0;
    const finalTotal = subtotalPiasters - discount;

    const sale = await prisma.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          branchId,
          invoiceNumber: generateInvoiceNumber(),
          totalPiasters: subtotalPiasters,
          discountPiasters: discount,
          taxPiasters: 0,
          finalTotalPiasters: finalTotal,
          paymentMethod,
          notes,
          createdBy: user.id
        }
      });

      for (const item of saleItems) {
        await tx.saleItem.create({
          data: {
            saleId: newSale.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPricePiasters: item.unitPricePiasters,
            totalPiasters: item.totalPiasters
          }
        });

        await tx.product.update({
          where: { id: item.productId },
          data: {
            quantity: {
              decrement: item.quantity
            }
          }
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            branchId,
            type: 'SALE',
            quantity: -item.quantity,
            reference: newSale.invoiceNumber,
            createdBy: user.id
          }
        });
      }

      return newSale;
    });

    const completeSale = await prisma.sale.findUnique({
      where: { id: sale.id },
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
                nameAr: true,
                barcode: true
              }
            }
          }
        },
        branch: {
          select: { name: true, code: true }
        }
      }
    });

    res.status(201).json({ success: true, data: completeSale });
  } catch (error) {
    console.error('Error creating sale:', error);
    res.status(500).json({ error: 'فشل في إنشاء عملية البيع' });
  }
});

// List sales with filters
router.get('/', requireAuth, requirePermission('VIEW_SALES'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { branchId, startDate, endDate, paymentMethod } = req.query;

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

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate as string);
      }
    }

    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
                nameAr: true
              }
            }
          }
        },
        branch: {
          select: { name: true, code: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json({ success: true, data: sales });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: 'فشل في جلب المبيعات' });
  }
});

// Get single sale
router.get('/:id', requireAuth, requirePermission('VIEW_SALES'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
                nameAr: true,
                barcode: true,
                pricePiasters: true
              }
            }
          }
        },
        branch: {
          select: { name: true, code: true }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({ error: 'عملية البيع غير موجودة' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(sale.branchId)) {
      return res.status(403).json({ error: 'لا تملك صلاحية لهذا الفرع' });
    }

    res.json({ success: true, data: sale });
  } catch (error) {
    console.error('Error fetching sale:', error);
    res.status(500).json({ error: 'فشل في جلب عملية البيع' });
  }
});

// Get receipt data
router.get('/receipt/:id', requireAuth, requirePermission('VIEW_SALES'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const { id } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
                nameAr: true,
                barcode: true
              }
            }
          }
        },
        branch: {
          select: { name: true, code: true, address: true, phone: true }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({ error: 'عملية البيع غير موجودة' });
    }

    if (user.role !== 'OWNER' && !user.branchIds.includes(sale.branchId)) {
      return res.status(403).json({ error: 'لا تملك صلاحية لهذا الفرع' });
    }

    res.json({ success: true, data: sale });
  } catch (error) {
    console.error('Error fetching receipt:', error);
    res.status(500).json({ error: 'فشل في جلب الإيصال' });
  }
});

export default router;
