import { Router, Request, Response } from 'express';
import { PaymentMethod, CheckInMethod } from '@prisma/client';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { normalizePhone, isValidEgyptianPhone, generateMemberCode } from 'shared';
import { createAuditLog } from './audit.js';
import { crossBranchCheckinStatus } from './attendance.js';

const router = Router();

async function resolveBranchId(branchIdOrCode: string): Promise<string> {
  if (branchIdOrCode.length >= 20) return branchIdOrCode;
  const branch = await prisma.branch.findUnique({ where: { code: branchIdOrCode } });
  if (branch) return branch.id;
  return branchIdOrCode;
}

interface SyncOperation {
  operationId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  branchId: string;
  userId: string;
}

router.post('/batch', requireAuth, async (req: Request, res: Response) => {
  const user = (req.session as any).user;
  const { operations } = req.body as { operations: SyncOperation[] };

  if (!operations || !Array.isArray(operations) || operations.length === 0) {
    return res.status(400).json({ error: 'Bad request', message: 'العمليات مطلوبة' });
  }

  if (operations.length > 100) {
    return res.status(400).json({ error: 'Bad request', message: 'الحد الأقصى 100 عملية في الطلب الواحد' });
  }

  const results: { success: boolean; error?: string }[] = [];

  for (const op of operations) {
    try {
      if (!op.operationId || !op.type || !op.branchId || !op.payload) {
        results.push({ success: false, error: 'بيانات العملية ناقصة' });
        continue;
      }

      op.branchId = await resolveBranchId(op.branchId);

      if (user.role !== 'OWNER' && !user.branchIds?.includes(op.branchId)) {
        results.push({ success: false, error: 'ليس لديك صلاحية لهذا الفرع' });
        continue;
      }

      const existing = await prisma.pendingOperation.findUnique({
        where: { operationId: op.operationId }
      });

      if (existing && existing.status === 'COMPLETED') {
        results.push({ success: true });
        continue;
      }

      if (existing && existing.status === 'PROCESSING') {
        results.push({ success: false, error: 'العملية قيد المعالجة' });
        continue;
      }

      const pendingOp = existing || await prisma.pendingOperation.create({
        data: {
          operationId: op.operationId,
          branchId: op.branchId,
          type: op.type,
          payload: op.payload as any,
          status: 'PROCESSING'
        }
      });

      if (!existing) {
        await prisma.pendingOperation.update({
          where: { id: pendingOp.id },
          data: { status: 'PROCESSING' }
        });
      }

      try {
        const result = await processOperation(op, user);
        await prisma.pendingOperation.update({
          where: { operationId: op.operationId },
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
            result: result as any
          }
        });
        results.push({ success: true });
      } catch (processError: any) {
        await prisma.pendingOperation.update({
          where: { operationId: op.operationId },
          data: {
            status: 'PENDING',
            result: { error: processError.message } as any
          }
        });
        results.push({ success: false, error: processError.message });
      }
    } catch (error: any) {
      console.error(`Sync operation ${op.operationId} failed:`, error);
      results.push({ success: false, error: error.message || 'خطأ في المعالجة' });
    }
  }

  res.json({ success: true, results });
});

async function processOperation(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  switch (op.type) {
    case 'CHECKIN':
      return processCheckin(op);
    case 'CHECKOUT':
      return processCheckout(op);
    case 'SALE':
      return processSale(op, user);
    case 'EXPENSE':
      return processExpense(op, user);
    case 'EDIT_EXPENSE':
      return processEditExpense(op);
    case 'DELETE_EXPENSE':
      return processDeleteExpense(op);
    case 'PAYMENT':
      return processPayment(op, user);
    case 'NEW_SUBSCRIPTION':
      return processNewSubscription(op, user);
    case 'RENEW_SUBSCRIPTION':
      return processRenewSubscription(op, user);
    case 'FREEZE_SUBSCRIPTION':
      return processFreezeSubscription(op);
    case 'UNFREEZE_SUBSCRIPTION':
      return processUnfreezeSubscription(op);
    case 'NEW_MEMBER':
      return processNewMember(op, user);
    case 'DELETE_MEMBER':
      return processDeleteMember(op);
    case 'NEW_PLAN':
      return processNewPlan(op);
    case 'EDIT_PLAN':
      return processEditPlan(op);
    case 'TOGGLE_PLAN':
      return processTogglePlan(op);
    default:
      throw new Error(`نوع عملية غير معروف: ${op.type}`);
  }
}

async function processCheckin(op: SyncOperation): Promise<Record<string, unknown>> {
  const { memberCode, branchId, method = 'OFFLINE_SYNC', checkInTime } = op.payload as {
    memberCode: string;
    branchId: string;
    method?: string;
    checkInTime?: string;
  };

  const validMethods = ['MANUAL', 'QR_CODE', 'BARCODE', 'OFFLINE_SYNC'] as const;
  const normalizedMethod: CheckInMethod = validMethods.includes(method as any) ? (method as CheckInMethod) : 'OFFLINE_SYNC';
  const resolvedBranchId = await resolveBranchId(branchId);

  const member = await prisma.member.findUnique({
    where: { memberCode },
    include: {
      person: true,
      subscriptions: {
        where: { status: 'ACTIVE', endDate: { gte: new Date() } },
        orderBy: { endDate: 'desc' },
        take: 1
      }
    }
  });

  if (!member) throw new Error('العضو غير موجود');

  const crossBranch = member.branchId !== resolvedBranchId;
  let homeBranchName: string | null = null;
  if (crossBranch) {
    const status = await crossBranchCheckinStatus(resolvedBranchId, member.branchId);
    if (!status.allowed) throw new Error(`الحضور في فرع آخر مقفول. العضو مسجل في فرع ${status.homeBranchName}`);
    homeBranchName = status.homeBranchName;
  }

  const originalTime = checkInTime ? new Date(checkInTime) : new Date(op.timestamp);
  const dayStart = new Date(originalTime);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(originalTime);
  dayEnd.setHours(23, 59, 59, 999);

  const existingCheckin = await prisma.attendance.findFirst({
    where: {
      memberId: member.id,
      checkInTime: { gte: dayStart, lte: dayEnd }
    }
  });

  if (existingCheckin) {
    return { attendanceId: existingCheckin.id, duplicate: true, memberName: member.person.name };
  }

  const activeSubscription = member.subscriptions[0];
  const reasons: string[] = [];

  if (!activeSubscription) {
    reasons.push('لا يوجد اشتراك نشط');
  } else if (activeSubscription.paidPiasters < activeSubscription.pricePiasters) {
    reasons.push('يوجد مبلغ متبقي');
  }
  if (homeBranchName) {
    reasons.push(`العضو مسجل في فرع ${homeBranchName}`);
  }

  const flagged = reasons.length > 0;
  const flagReason = flagged ? reasons.join(' — ') : null;

  const attendance = await prisma.attendance.create({
    data: {
      memberId: member.id,
      branchId: resolvedBranchId,
      method: normalizedMethod,
      flagged,
      flagReason,
      checkInTime: originalTime
    }
  });

  return { attendanceId: attendance.id, memberName: member.person.name, flagged };
}

async function processCheckout(op: SyncOperation): Promise<Record<string, unknown>> {
  const { attendanceId, checkOutTime } = op.payload as {
    attendanceId: string;
    checkOutTime?: string;
  };

  const attendance = await prisma.attendance.findUnique({ where: { id: attendanceId } });
  if (!attendance) throw new Error('سجل الحضور غير موجود');
  if (attendance.checkOutTime) {
    return { attendanceId, duplicate: true };
  }

  const updated = await prisma.attendance.update({
    where: { id: attendanceId },
    data: { checkOutTime: checkOutTime ? new Date(checkOutTime) : new Date(op.timestamp) }
  });

  return { attendanceId: updated.id };
}

function generateInvoiceNumber(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${timestamp}-${random}`;
}

async function processSale(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { items, discountPiasters = 0, paymentMethod = 'CASH', notes, saleTimestamp } = op.payload as {
    items: Array<{ productId: string; quantity: number; unitPricePiasters: number }>;
    discountPiasters?: number;
    paymentMethod?: string;
    notes?: string;
    saleTimestamp?: string;
  };

  if (!items || items.length === 0) throw new Error('لا توجد منتجات في عملية البيع');

  return prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { id: { in: items.map(i => i.productId) } }
    });

    const productMap = new Map(products.map(p => [p.id, p]));

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`المنتج غير موجود: ${item.productId}`);
      if (product.quantity < item.quantity) {
        throw new Error(`الكمية غير كافية للمنتج: ${product.nameAr || product.name}`);
      }
    }

    const subtotalPiasters = items.reduce(
      (sum, item) => sum + item.unitPricePiasters * item.quantity, 0
    );
    const finalTotal = subtotalPiasters - discountPiasters;
    const invoiceNumber = generateInvoiceNumber();
    const createdAt = saleTimestamp ? new Date(saleTimestamp) : new Date(op.timestamp);

    const sale = await tx.sale.create({
      data: {
        branchId: op.branchId,
        invoiceNumber,
        totalPiasters: subtotalPiasters,
        discountPiasters,
        taxPiasters: 0,
        finalTotalPiasters: finalTotal,
        paymentMethod: paymentMethod as PaymentMethod,
        notes,
        createdBy: user.id,
        createdAt
      }
    });

    for (const item of items) {
      const totalPiasters = item.unitPricePiasters * item.quantity;
      await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPricePiasters: item.unitPricePiasters,
          totalPiasters
        }
      });

      await tx.product.update({
        where: { id: item.productId },
        data: { quantity: { decrement: item.quantity } }
      });

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          branchId: op.branchId,
          type: 'SALE',
          quantity: -item.quantity,
          reference: invoiceNumber,
          createdBy: user.id
        }
      });
    }

    return { saleId: sale.id, invoiceNumber };
  });
}

async function processExpense(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { category, description, amountPiasters, date, expenseTimestamp } = op.payload as {
    category: string;
    description: string;
    amountPiasters: number;
    date?: string;
    expenseTimestamp?: string;
  };

  if (!category || !description || !amountPiasters) {
    throw new Error('بيانات المصروف ناقصة');
  }

  const expenseDate = date ? new Date(date) : (expenseTimestamp ? new Date(expenseTimestamp) : new Date(op.timestamp));

  const expense = await prisma.expense.create({
    data: {
      branchId: op.branchId,
      category,
      description,
      amountPiasters,
      date: expenseDate,
      createdBy: user.id
    }
  });

  return { expenseId: expense.id };
}

async function processPayment(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { subscriptionId, amountPiasters, method = 'CASH', reference, notes, paymentTimestamp } = op.payload as {
    subscriptionId: string;
    amountPiasters: number;
    method?: string;
    reference?: string;
    notes?: string;
    paymentTimestamp?: string;
  };

  if (!subscriptionId || !amountPiasters) {
    throw new Error('بيانات الدفعة ناقصة');
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { payments: true }
  });

  if (!subscription) throw new Error('الاشتراك غير موجود');

  const payment = await prisma.payment.create({
    data: {
      subscriptionId,
      branchId: subscription.branchId,
      amountPiasters,
      method: method as PaymentMethod,
      reference: reference || null,
      notes: notes || null
    }
  });

  const totalPaid = subscription.payments.reduce((sum, p) => sum + p.amountPiasters, 0) + amountPiasters;

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { paidPiasters: totalPaid }
  });

  return { paymentId: payment.id, subscriptionId };
}

async function processNewSubscription(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { memberId, planId, startDate: startDateStr, discountPiasters = 0, paidPiasters = 0, paymentMethod = 'CASH', notes, subTimestamp } = op.payload as {
    memberId: string;
    planId: string;
    startDate?: string;
    discountPiasters?: number;
    paidPiasters?: number;
    paymentMethod?: string;
    notes?: string;
    subTimestamp?: string;
  };

  if (!memberId || !planId) throw new Error('بيانات الاشتراك ناقصة');

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { person: true }
  });
  if (!member) throw new Error('العضو غير موجود');

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error('الخطة غير موجودة');

  const startDate = startDateStr ? new Date(startDateStr) : (subTimestamp ? new Date(subTimestamp) : new Date(op.timestamp));
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.durationDays);

  const pricePiasters = plan.pricePiasters - discountPiasters;
  const actualPaid = Math.min(paidPiasters, pricePiasters);

  const subscription = await prisma.subscription.create({
    data: {
      memberId,
      planId,
      branchId: member.branchId,
      startDate,
      endDate,
      pricePiasters,
      paidPiasters: actualPaid,
      status: 'ACTIVE',
      notes: notes || null
    }
  });

  if (actualPaid > 0) {
    await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        branchId: member.branchId,
        amountPiasters: actualPaid,
        method: paymentMethod as PaymentMethod,
        notes: 'دفعة أولى'
      }
    });
  }

  return { subscriptionId: subscription.id };
}

async function processRenewSubscription(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { subscriptionId, discountPiasters = 0, paidPiasters = 0, paymentMethod = 'CASH', notes } = op.payload as {
    subscriptionId: string;
    discountPiasters?: number;
    paidPiasters?: number;
    paymentMethod?: string;
    notes?: string;
  };

  if (!subscriptionId) throw new Error('بيانات التجديد ناقصة');

  const current = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { member: true }
  });
  if (!current) throw new Error('الاشتراك غير موجود');

  const plan = await prisma.plan.findUnique({ where: { id: current.planId } });
  if (!plan) throw new Error('الخطة غير موجودة');

  const now = new Date();
  const startDate = current.endDate > now ? current.endDate : now;
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.durationDays);

  const pricePiasters = plan.pricePiasters - (discountPiasters || 0);
  const initialPaid = Math.min(paidPiasters || 0, pricePiasters);

  const subscription = await prisma.subscription.create({
    data: {
      memberId: current.memberId,
      planId: current.planId,
      branchId: current.branchId,
      startDate,
      endDate,
      pricePiasters,
      paidPiasters: initialPaid,
      status: 'ACTIVE',
      notes: notes || null
    }
  });

  if (initialPaid > 0) {
    await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        branchId: current.branchId,
        amountPiasters: initialPaid,
        method: paymentMethod as PaymentMethod,
        notes: 'دفعة تجديد'
      }
    });
  }

  return { subscriptionId: subscription.id };
}

async function processFreezeSubscription(op: SyncOperation): Promise<Record<string, unknown>> {
  const { subscriptionId } = op.payload as { subscriptionId: string };
  if (!subscriptionId) throw new Error('بيانات التجميد ناقصة');

  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) throw new Error('الاشتراك غير موجود');
  if (subscription.status !== 'ACTIVE') throw new Error('يمكن تجميد الاشتراك النشط فقط');
  if (subscription.isFrozen) return { subscriptionId, duplicate: true };

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { isFrozen: true, frozenAt: new Date(), status: 'FROZEN' }
  });

  return { subscriptionId: updated.id };
}

async function processUnfreezeSubscription(op: SyncOperation): Promise<Record<string, unknown>> {
  const { subscriptionId } = op.payload as { subscriptionId: string };
  if (!subscriptionId) throw new Error('بيانات إلغاء التجميد ناقصة');

  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) throw new Error('الاشتراك غير موجود');
  if (!subscription.isFrozen) return { subscriptionId, duplicate: true };

  const now = new Date();
  const frozenAt = subscription.frozenAt || now;
  const frozenMs = now.getTime() - frozenAt.getTime();
  const frozenDays = Math.ceil(frozenMs / (1000 * 60 * 60 * 24));

  const newEndDate = new Date(subscription.endDate);
  newEndDate.setDate(newEndDate.getDate() + frozenDays);

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      isFrozen: false,
      frozenAt: null,
      status: 'ACTIVE',
      endDate: newEndDate,
      frozenDaysUsed: { increment: frozenDays }
    }
  });

  return { subscriptionId: updated.id };
}

async function generateUniqueCode(maxAttempts: number = 10): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateMemberCode();
    const existing = await prisma.member.findUnique({ where: { memberCode: code } });
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique member code');
}

async function processNewMember(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { name, phone, email, gender, branchId, notes } = op.payload as {
    name: string;
    phone: string;
    email?: string;
    gender?: string;
    branchId: string;
    notes?: string;
  };

  if (!name || !phone || !branchId) throw new Error('بيانات العضو ناقصة');

  const resolvedBranchId = await resolveBranchId(branchId);

  const normalizedPhone = normalizePhone(phone);
  if (!isValidEgyptianPhone(normalizedPhone)) throw new Error('رقم الهاتف غير صحيح');

  const existingPerson = await prisma.person.findUnique({ where: { phoneNormalized: normalizedPhone } });

  if (existingPerson) {
    const existingMember = await prisma.member.findFirst({
      where: { personId: existingPerson.id, branchId: resolvedBranchId }
    });
    if (existingMember) {
      return { memberId: existingMember.id, duplicate: true };
    }

    const memberCode = await generateUniqueCode();
    const member = await prisma.member.create({
      data: { personId: existingPerson.id, branchId: resolvedBranchId, memberCode, notes }
    });
    return { memberId: member.id };
  }

  const memberCode = await generateUniqueCode();
  const person = await prisma.person.create({
    data: {
      name,
      phone,
      phoneNormalized: normalizedPhone,
      email: email || null,
      gender: gender || null
    }
  });

  const member = await prisma.member.create({
    data: { personId: person.id, branchId: resolvedBranchId, memberCode, notes }
  });

  return { memberId: member.id };
}

async function processDeleteMember(op: SyncOperation): Promise<Record<string, unknown>> {
  const { memberId } = op.payload as { memberId: string };
  if (!memberId) throw new Error('بيانات الحذف ناقصة');

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return { memberId, alreadyDeleted: true };

  const personId = member.personId;
  await prisma.member.delete({ where: { id: memberId } });

  const otherMemberships = await prisma.member.count({ where: { personId } });
  if (otherMemberships === 0) {
    await prisma.person.delete({ where: { id: personId } });
  }

  return { memberId };
}

async function processNewPlan(op: SyncOperation): Promise<Record<string, unknown>> {
  const { branchId, name, nameAr, durationDays, pricePiasters, description, descriptionAr } = op.payload as {
    branchId: string;
    name: string;
    nameAr: string;
    durationDays: number;
    pricePiasters: number;
    description?: string;
    descriptionAr?: string;
  };

  if (!branchId || !name || !nameAr || !durationDays || !pricePiasters) {
    throw new Error('بيانات الخطة ناقصة');
  }

  const resolvedBranchId = await resolveBranchId(branchId);

  const plan = await prisma.plan.create({
    data: {
      branchId: resolvedBranchId,
      name,
      nameAr,
      durationDays,
      pricePiasters,
      description: description || null,
      descriptionAr: descriptionAr || null
    }
  });

  return { planId: plan.id };
}

async function processEditPlan(op: SyncOperation): Promise<Record<string, unknown>> {
  const { planId, name, nameAr, durationDays, pricePiasters, description, descriptionAr } = op.payload as {
    planId: string;
    name?: string;
    nameAr?: string;
    durationDays?: number;
    pricePiasters?: number;
    description?: string;
    descriptionAr?: string;
  };

  if (!planId) throw new Error('بيانات الخطة ناقصة');

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error('الخطة غير موجودة');

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (nameAr !== undefined) data.nameAr = nameAr;
  if (durationDays !== undefined) data.durationDays = durationDays;
  if (pricePiasters !== undefined) data.pricePiasters = pricePiasters;
  if (description !== undefined) data.description = description;
  if (descriptionAr !== undefined) data.descriptionAr = descriptionAr;

  const updated = await prisma.plan.update({ where: { id: planId }, data });
  return { planId: updated.id };
}

async function processTogglePlan(op: SyncOperation): Promise<Record<string, unknown>> {
  const { planId, isActive } = op.payload as { planId: string; isActive: boolean };
  if (!planId) throw new Error('بيانات الخطة ناقصة');

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error('الخطة غير موجودة');

  const updated = await prisma.plan.update({
    where: { id: planId },
    data: { isActive }
  });

  return { planId: updated.id };
}

async function processEditExpense(op: SyncOperation): Promise<Record<string, unknown>> {
  const { expenseId, category, description, amountPiasters, date } = op.payload as {
    expenseId: string;
    category?: string;
    description?: string;
    amountPiasters?: number;
    date?: string;
  };

  if (!expenseId) throw new Error('بيانات المصروف ناقصة');

  const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!existing) throw new Error('المصروف غير موجود');

  const data: Record<string, unknown> = {};
  if (category !== undefined) data.category = category;
  if (description !== undefined) data.description = description;
  if (amountPiasters !== undefined) data.amountPiasters = amountPiasters;
  if (date !== undefined) data.date = new Date(date);

  const updated = await prisma.expense.update({ where: { id: expenseId }, data });
  return { expenseId: updated.id };
}

async function processDeleteExpense(op: SyncOperation): Promise<Record<string, unknown>> {
  const { expenseId } = op.payload as { expenseId: string };
  if (!expenseId) throw new Error('بيانات الحذف ناقصة');

  const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!existing) return { expenseId, alreadyDeleted: true };

  await prisma.expense.delete({ where: { id: expenseId } });
  return { expenseId };
}

export default router;
