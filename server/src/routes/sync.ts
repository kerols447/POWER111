import { Router, Request, Response } from 'express';
import { PaymentMethod, CheckInMethod } from '@prisma/client';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { userHasPermission } from '../utils/permissions.js';
import { normalizePhone, isValidEgyptianPhone, generateMemberCode } from 'shared';
import { createAuditLog } from './audit.js';
import { crossBranchCheckinStatus } from './attendance.js';

const router = Router();

// A message the desk is allowed to see. Anything thrown that is not a SyncError is an
// internal failure (Prisma, driver, unexpected shape) and only ever reaches the client as
// a generic Arabic sentence, while the real reason stays in the server log.
class SyncError extends Error {}

// Every offline operation has an online twin that is already permission-gated. The sync
// endpoint is the same door, so it has to demand the same key — otherwise replaying a
// queued operation would be a way to write to the business without holding the permission.
const OP_RULES: Record<string, { permission?: string; roles?: string[] }> = {
  CHECKIN: { permission: 'CHECKIN_MEMBERS' },
  CHECKOUT: { permission: 'CHECKIN_MEMBERS' },
  SALE: { permission: 'CREATE_SALES' },
  EXPENSE: { permission: 'CREATE_EXPENSES' },
  EDIT_EXPENSE: { permission: 'EDIT_EXPENSES' },
  DELETE_EXPENSE: { permission: 'DELETE_EXPENSES' },
  PAYMENT: { permission: 'CREATE_SUBSCRIPTIONS' },
  NEW_SUBSCRIPTION: { permission: 'CREATE_SUBSCRIPTIONS' },
  RENEW_SUBSCRIPTION: { permission: 'RENEW_SUBSCRIPTIONS' },
  FREEZE_SUBSCRIPTION: { permission: 'FREEZE_SUBSCRIPTIONS' },
  UNFREEZE_SUBSCRIPTION: { permission: 'FREEZE_SUBSCRIPTIONS' },
  NEW_MEMBER: { permission: 'CREATE_MEMBERS' },
  DELETE_MEMBER: { permission: 'DELETE_MEMBERS' },
  NEW_PLAN: { roles: ['OWNER', 'BRANCH_MANAGER'] },
  EDIT_PLAN: { roles: ['OWNER', 'BRANCH_MANAGER'] },
  TOGGLE_PLAN: { roles: ['OWNER', 'BRANCH_MANAGER'] }
};

async function assertAllowed(user: any, type: string, permCache: Map<string, boolean>) {
  const rule = OP_RULES[type];
  if (!rule) throw new SyncError(`نوع عملية غير معروف: ${type}`);

  if (rule.roles) {
    if (!rule.roles.includes(user.role)) throw new SyncError('ليس لديك صلاحية لتنفيذ هذه العملية');
    return;
  }

  const permission = rule.permission as string;
  const cached = permCache.get(permission);
  if (cached !== undefined) {
    if (!cached) throw new SyncError('ليس لديك صلاحية لتنفيذ هذه العملية');
    return;
  }
  const ok = await userHasPermission(user.id, permission);
  permCache.set(permission, ok);
  if (!ok) throw new SyncError('ليس لديك صلاحية لتنفيذ هذه العملية');
}

// Nothing may be written into (or read out of) a branch the caller does not own.
function assertBranch(user: any, branchId: string | null | undefined) {
  if (user.role === 'OWNER') return;
  if (!branchId || !user.branchIds?.includes(branchId)) {
    throw new SyncError('ليس لديك صلاحية لهذا الفرع');
  }
}

function wholePiasters(value: unknown, field: string, max = 500_000_000): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new SyncError(`${field} غير صحيح`);
  return n;
}

function positiveCount(value: unknown, field: string, max = 10_000): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new SyncError(`${field} غير صحيح`);
  return n;
}

// Past times, future times a day out, and clock-skewed queues all land here, so the
// timestamp a client claims is clamped to a window the business can actually mean.
function safeDate(value: string | number | undefined | null, fallback: number): Date {
  const d = value === undefined || value === null || value === '' ? new Date(fallback) : new Date(value);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  const min = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const max = Date.now() + 2 * 24 * 60 * 60 * 1000;
  if (d.getTime() < min || d.getTime() > max) return new Date(fallback);
  return d;
}

async function resolveBranchId(branchIdOrCode: string): Promise<string> {
  // Only short values are branch codes; a long value is treated as an id and must exist,
  // so a fabricated id can never be written straight into a create/update.
  const branch = branchIdOrCode.length >= 20
    ? await prisma.branch.findUnique({ where: { id: branchIdOrCode }, select: { id: true } })
    : await prisma.branch.findFirst({
        where: { OR: [{ code: branchIdOrCode }, { id: branchIdOrCode }] },
        select: { id: true }
      });
  if (!branch) throw new SyncError('الفرع غير موجود');
  return branch.id;
}

interface SyncOperation {
  operationId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  branchId: string;
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
  const permCache = new Map<string, boolean>();

  for (const op of operations) {
    try {
      if (!op.operationId || !op.type || !op.branchId || !op.payload) {
        results.push({ success: false, error: 'بيانات العملية ناقصة' });
        continue;
      }

      const operationId = String(op.operationId);
      if (operationId.length > 64 || typeof op.payload !== 'object' || op.payload === null) {
        results.push({ success: false, error: 'بيانات العملية غير صحيحة' });
        continue;
      }

      op.branchId = await resolveBranchId(String(op.branchId));

      assertBranch(user, op.branchId);
      await assertAllowed(user, op.type, permCache);

      const existing = await prisma.pendingOperation.findUnique({
        where: { operationId }
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
          operationId,
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
          where: { operationId },
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
            result: result as any
          }
        });
        await createAuditLog(user.id, `SYNC_${op.type}`, 'SyncOperation', String(op.operationId), op.branchId, {
          source: 'offline',
          result
        }, req.ip);
        results.push({ success: true });
      } catch (processError: any) {
        const message = processError instanceof SyncError
          ? processError.message
          : 'تعذّر تنفيذ العملية، تواصل مع الإدارة';
        await prisma.pendingOperation.update({
          where: { operationId },
          data: {
            status: 'PENDING',
            result: { error: message } as any
          }
        });
        if (!(processError instanceof SyncError)) {
          console.error(`Sync operation ${op.operationId} (${op.type}) failed:`, processError);
        }
        results.push({ success: false, error: message });
      }
    } catch (error: any) {
      const message = error instanceof SyncError ? error.message : 'تعذّر تنفيذ العملية، تواصل مع الإدارة';
      if (!(error instanceof SyncError)) {
        console.error(`Sync operation ${op.operationId} failed:`, error);
      }
      results.push({ success: false, error: message });
    }
  }

  res.json({ success: true, results });
});

async function processOperation(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  switch (op.type) {
    case 'CHECKIN':
      return processCheckin(op, user);
    case 'CHECKOUT':
      return processCheckout(op, user);
    case 'SALE':
      return processSale(op, user);
    case 'EXPENSE':
      return processExpense(op, user);
    case 'EDIT_EXPENSE':
      return processEditExpense(op, user);
    case 'DELETE_EXPENSE':
      return processDeleteExpense(op, user);
    case 'PAYMENT':
      return processPayment(op, user);
    case 'NEW_SUBSCRIPTION':
      return processNewSubscription(op, user);
    case 'RENEW_SUBSCRIPTION':
      return processRenewSubscription(op, user);
    case 'FREEZE_SUBSCRIPTION':
      return processFreezeSubscription(op, user);
    case 'UNFREEZE_SUBSCRIPTION':
      return processUnfreezeSubscription(op, user);
    case 'NEW_MEMBER':
      return processNewMember(op, user);
    case 'DELETE_MEMBER':
      return processDeleteMember(op, user);
    case 'NEW_PLAN':
      return processNewPlan(op, user);
    case 'EDIT_PLAN':
      return processEditPlan(op, user);
    case 'TOGGLE_PLAN':
      return processTogglePlan(op, user);
    default:
      throw new SyncError(`نوع عملية غير معروف: ${op.type}`);
  }
}

async function processCheckin(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { memberCode, branchId, method = 'OFFLINE_SYNC', checkInTime } = op.payload as {
    memberCode: string;
    branchId: string;
    method?: string;
    checkInTime?: string;
  };

  const validMethods = ['MANUAL', 'QR_CODE', 'BARCODE', 'OFFLINE_SYNC'] as const;
  const normalizedMethod: CheckInMethod = validMethods.includes(method as any) ? (method as CheckInMethod) : 'OFFLINE_SYNC';
  const resolvedBranchId = await resolveBranchId(String(branchId));
  assertBranch(user, resolvedBranchId);

  const member = await prisma.member.findUnique({
    where: { memberCode: String(memberCode) },
    include: {
      person: true,
      subscriptions: {
        where: { status: 'ACTIVE', endDate: { gte: new Date() } },
        orderBy: { endDate: 'desc' },
        take: 1
      }
    }
  });

  if (!member) throw new SyncError('العضو غير موجود');

  const crossBranch = member.branchId !== resolvedBranchId;
  let homeBranchName: string | null = null;
  if (crossBranch) {
    const status = await crossBranchCheckinStatus(resolvedBranchId, member.branchId);
    if (!status.allowed) throw new SyncError(`الحضور في فرع آخر مقفول. العضو مسجل في فرع ${status.homeBranchName}`);
    homeBranchName = status.homeBranchName;
  }

  const originalTime = safeDate(checkInTime, op.timestamp);
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

async function processCheckout(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { attendanceId, checkOutTime } = op.payload as {
    attendanceId: string;
    checkOutTime?: string;
  };

  if (!attendanceId) throw new SyncError('بيانات الخروج ناقصة');

  const attendance = await prisma.attendance.findUnique({ where: { id: String(attendanceId) } });
  if (!attendance) throw new SyncError('سجل الحضور غير موجود');
  assertBranch(user, attendance.branchId);
  if (attendance.checkOutTime) {
    return { attendanceId, duplicate: true };
  }

  const updated = await prisma.attendance.update({
    where: { id: attendance.id },
    data: { checkOutTime: safeDate(checkOutTime, op.timestamp) }
  });

  return { attendanceId: updated.id };
}

function generateInvoiceNumber(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${timestamp}-${random}`;
}

function paymentMethodOf(value: unknown): PaymentMethod {
  const method = String(value ?? 'CASH').toUpperCase();
  return (['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'].includes(method) ? method : 'CASH') as PaymentMethod;
}

async function processSale(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { items, discountPiasters = 0, paymentMethod = 'CASH', notes, saleTimestamp } = op.payload as {
    items: Array<{ productId: string; quantity: number; unitPricePiasters?: number }>;
    discountPiasters?: number;
    paymentMethod?: string;
    notes?: string;
    saleTimestamp?: string;
  };

  if (!items || !Array.isArray(items) || items.length === 0) throw new SyncError('لا توجد منتجات في عملية البيع');
  if (items.length > 100) throw new SyncError('عدد المنتجات في الفاتورة كبير جداً');

  const discount = wholePiasters(discountPiasters, 'الخصم');

  return prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { id: { in: items.map(i => String(i.productId)) } }
    });

    const productMap = new Map(products.map(p => [p.id, p]));

    // The price always comes from the shelf, never from the queue: a saved basket can be
    // replayed hours later, and a ticket may not be sold at a price the browser invented.
    const quantities = new Map<string, number>();
    for (const item of items) {
      const productId = String(item.productId);
      const product = productMap.get(productId);
      if (!product) throw new SyncError('أحد المنتجات غير موجود');
      if (product.branchId !== op.branchId) {
        throw new SyncError(`المنتج ${product.nameAr || product.name} لا ينتمي لهذا الفرع`);
      }
      const quantity = (quantities.get(productId) || 0) + positiveCount(item.quantity, 'الكمية');
      if (product.quantity < quantity) {
        throw new SyncError(`الكمية غير كافية للمنتج: ${product.nameAr || product.name}`);
      }
      quantities.set(productId, quantity);
    }

    const lines = [...quantities.entries()].map(([productId, quantity]) => {
      const product = productMap.get(productId)!;
      return {
        productId,
        quantity,
        unitPricePiasters: product.pricePiasters,
        totalPiasters: product.pricePiasters * quantity
      };
    });

    const subtotalPiasters = lines.reduce((sum, line) => sum + line.totalPiasters, 0);
    if (discount > subtotalPiasters) throw new SyncError('الخصم أكبر من قيمة الفاتورة');
    const finalTotal = subtotalPiasters - discount;
    const invoiceNumber = generateInvoiceNumber();
    const createdAt = safeDate(saleTimestamp, op.timestamp);

    const sale = await tx.sale.create({
      data: {
        branchId: op.branchId,
        invoiceNumber,
        totalPiasters: subtotalPiasters,
        discountPiasters: discount,
        taxPiasters: 0,
        finalTotalPiasters: finalTotal,
        paymentMethod: paymentMethodOf(paymentMethod),
        notes: typeof notes === 'string' ? notes.slice(0, 500) : null,
        createdBy: user.id,
        createdAt
      }
    });

    for (const line of lines) {
      await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId: line.productId,
          quantity: line.quantity,
          unitPricePiasters: line.unitPricePiasters,
          totalPiasters: line.totalPiasters
        }
      });

      await tx.product.update({
        where: { id: line.productId },
        data: { quantity: { decrement: line.quantity } }
      });

      await tx.stockMovement.create({
        data: {
          productId: line.productId,
          branchId: op.branchId,
          type: 'SALE',
          quantity: -line.quantity,
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

  const amount = wholePiasters(amountPiasters, 'قيمة المصروف');
  if (!category || !description || amount <= 0) {
    throw new SyncError('بيانات المصروف ناقصة');
  }

  const expenseDate = safeDate(date ?? expenseTimestamp, op.timestamp);

  const expense = await prisma.expense.create({
    data: {
      branchId: op.branchId,
      category: String(category).slice(0, 60),
      description: String(description).slice(0, 500),
      amountPiasters: amount,
      date: expenseDate,
      createdBy: user.id
    }
  });

  return { expenseId: expense.id };
}

async function processPayment(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { subscriptionId, amountPiasters, method = 'CASH', reference, notes } = op.payload as {
    subscriptionId: string;
    amountPiasters: number;
    method?: string;
    reference?: string;
    notes?: string;
  };

  const amount = wholePiasters(amountPiasters, 'قيمة الدفعة');
  if (!subscriptionId || amount <= 0) {
    throw new SyncError('بيانات الدفعة ناقصة');
  }

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { id: String(subscriptionId) },
      include: { payments: true }
    });

    if (!subscription) throw new SyncError('الاشتراك غير موجود');
    assertBranch(user, subscription.branchId);

    const payment = await tx.payment.create({
      data: {
        subscriptionId: subscription.id,
        branchId: subscription.branchId,
        amountPiasters: amount,
        method: paymentMethodOf(method),
        reference: reference ? String(reference).slice(0, 120) : null,
        notes: notes ? String(notes).slice(0, 500) : null
      }
    });

    const totalPaid = subscription.payments.reduce((sum, p) => sum + p.amountPiasters, 0) + amount;

    await tx.subscription.update({
      where: { id: subscription.id },
      data: { paidPiasters: totalPaid }
    });

    return { paymentId: payment.id, subscriptionId: subscription.id };
  });
}

async function processNewSubscription(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { memberId, planId, startDate: startDateStr, discountPiasters = 0, paidPiasters = 0, paymentMethod = 'CASH', notes } = op.payload as {
    memberId: string;
    planId: string;
    startDate?: string;
    discountPiasters?: number;
    paidPiasters?: number;
    paymentMethod?: string;
    notes?: string;
    subTimestamp?: string;
  };

  if (!memberId || !planId) throw new SyncError('بيانات الاشتراك ناقصة');

  const discount = wholePiasters(discountPiasters, 'الخصم');
  const paid = wholePiasters(paidPiasters, 'المدفوع');

  const member = await prisma.member.findUnique({
    where: { id: String(memberId) }
  });
  if (!member) throw new SyncError('العضو غير موجود');
  assertBranch(user, member.branchId);

  const plan = await prisma.plan.findUnique({ where: { id: String(planId) } });
  if (!plan) throw new SyncError('الخطة غير موجودة');
  assertBranch(user, plan.branchId);
  if (plan.branchId !== member.branchId) throw new SyncError('الخطة لا تنتمي لفرع العضو');

  const startDate = safeDate(startDateStr ?? (op.payload.subTimestamp as string | undefined), op.timestamp);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.durationDays);

  const pricePiasters = Math.max(0, plan.pricePiasters - discount);
  const actualPaid = Math.min(paid, pricePiasters);

  const subscription = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      branchId: member.branchId,
      startDate,
      endDate,
      pricePiasters,
      paidPiasters: actualPaid,
      status: 'ACTIVE',
      notes: notes ? String(notes).slice(0, 500) : null
    }
  });

  if (actualPaid > 0) {
    await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        branchId: member.branchId,
        amountPiasters: actualPaid,
        method: paymentMethodOf(paymentMethod),
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

  if (!subscriptionId) throw new SyncError('بيانات التجديد ناقصة');

  const renewDiscount = wholePiasters(discountPiasters, 'الخصم');
  const renewPaid = wholePiasters(paidPiasters, 'المدفوع');

  const current = await prisma.subscription.findUnique({
    where: { id: String(subscriptionId) },
    include: { member: true }
  });
  if (!current) throw new SyncError('الاشتراك غير موجود');
  assertBranch(user, current.branchId);

  const plan = await prisma.plan.findUnique({ where: { id: current.planId } });
  if (!plan) throw new SyncError('الخطة غير موجودة');

  const now = new Date();
  const startDate = current.endDate > now ? current.endDate : now;
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.durationDays);

  const pricePiasters = Math.max(0, plan.pricePiasters - renewDiscount);
  const initialPaid = Math.min(renewPaid, pricePiasters);

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
      notes: notes ? String(notes).slice(0, 500) : null
    }
  });

  if (initialPaid > 0) {
    await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        branchId: current.branchId,
        amountPiasters: initialPaid,
        method: paymentMethodOf(paymentMethod),
        notes: 'دفعة تجديد'
      }
    });
  }

  return { subscriptionId: subscription.id };
}

async function processFreezeSubscription(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { subscriptionId } = op.payload as { subscriptionId: string };
  if (!subscriptionId) throw new SyncError('بيانات التجميد ناقصة');

  const subscription = await prisma.subscription.findUnique({ where: { id: String(subscriptionId) } });
  if (!subscription) throw new SyncError('الاشتراك غير موجود');
  assertBranch(user, subscription.branchId);
  if (subscription.status !== 'ACTIVE') throw new SyncError('يمكن تجميد الاشتراك النشط فقط');
  if (subscription.isFrozen) return { subscriptionId, duplicate: true };

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { isFrozen: true, frozenAt: new Date(), status: 'FROZEN' }
  });

  return { subscriptionId: updated.id };
}

async function processUnfreezeSubscription(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { subscriptionId } = op.payload as { subscriptionId: string };
  if (!subscriptionId) throw new SyncError('بيانات إلغاء التجميد ناقصة');

  const subscription = await prisma.subscription.findUnique({ where: { id: String(subscriptionId) } });
  if (!subscription) throw new SyncError('الاشتراك غير موجود');
  assertBranch(user, subscription.branchId);
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
  throw new SyncError('تعذّر إنشاء كود العضو، حاول مرة أخرى');
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

  if (!name || !phone || !branchId) throw new SyncError('بيانات العضو ناقصة');

  const resolvedBranchId = await resolveBranchId(String(branchId));
  assertBranch(user, resolvedBranchId);

  const normalizedPhone = normalizePhone(String(phone));
  if (!isValidEgyptianPhone(normalizedPhone)) throw new SyncError('رقم الهاتف غير صحيح');

  const cleanName = String(name).trim().slice(0, 120);
  if (cleanName.length < 2) throw new SyncError('اسم العضو غير صحيح');
  const cleanEmail = email ? String(email).trim().slice(0, 120) : null;
  const cleanGender = ['Male', 'Female'].includes(String(gender)) ? String(gender) : null;
  const cleanNotes = notes ? String(notes).slice(0, 500) : null;

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
      data: { personId: existingPerson.id, branchId: resolvedBranchId, memberCode, notes: cleanNotes }
    });
    return { memberId: member.id };
  }

  const memberCode = await generateUniqueCode();
  const person = await prisma.person.create({
    data: {
      name: cleanName,
      phone: String(phone).trim().slice(0, 20),
      phoneNormalized: normalizedPhone,
      email: cleanEmail,
      gender: cleanGender
    }
  });

  const member = await prisma.member.create({
    data: { personId: person.id, branchId: resolvedBranchId, memberCode, notes: cleanNotes }
  });

  return { memberId: member.id };
}

async function processDeleteMember(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { memberId } = op.payload as { memberId: string };
  if (!memberId) throw new SyncError('بيانات الحذف ناقصة');

  const member = await prisma.member.findUnique({ where: { id: String(memberId) } });
  if (!member) return { memberId, alreadyDeleted: true };
  assertBranch(user, member.branchId);

  const personId = member.personId;
  await prisma.member.delete({ where: { id: member.id } });

  const otherMemberships = await prisma.member.count({ where: { personId } });
  if (otherMemberships === 0) {
    await prisma.person.delete({ where: { id: personId } });
  }

  return { memberId: member.id };
}

async function processNewPlan(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { branchId, name, nameAr, durationDays, pricePiasters, description, descriptionAr } = op.payload as {
    branchId: string;
    name: string;
    nameAr: string;
    durationDays: number;
    pricePiasters: number;
    description?: string;
    descriptionAr?: string;
  };

  const days = positiveCount(durationDays, 'مدة الخطة', 3650);
  const price = wholePiasters(pricePiasters, 'سعر الخطة');

  if (!branchId || !name || !nameAr || price <= 0) {
    throw new SyncError('بيانات الخطة ناقصة');
  }

  const resolvedBranchId = await resolveBranchId(String(branchId));
  assertBranch(user, resolvedBranchId);

  const plan = await prisma.plan.create({
    data: {
      branchId: resolvedBranchId,
      name: String(name).slice(0, 120),
      nameAr: String(nameAr).slice(0, 120),
      durationDays: days,
      pricePiasters: price,
      description: description ? String(description).slice(0, 500) : null,
      descriptionAr: descriptionAr ? String(descriptionAr).slice(0, 500) : null
    }
  });

  return { planId: plan.id };
}

async function processEditPlan(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { planId, name, nameAr, durationDays, pricePiasters, description, descriptionAr } = op.payload as {
    planId: string;
    name?: string;
    nameAr?: string;
    durationDays?: number;
    pricePiasters?: number;
    description?: string;
    descriptionAr?: string;
  };

  if (!planId) throw new SyncError('بيانات الخطة ناقصة');

  const plan = await prisma.plan.findUnique({ where: { id: String(planId) } });
  if (!plan) throw new SyncError('الخطة غير موجودة');
  assertBranch(user, plan.branchId);

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = String(name).slice(0, 120);
  if (nameAr !== undefined) data.nameAr = String(nameAr).slice(0, 120);
  if (durationDays !== undefined) data.durationDays = positiveCount(durationDays, 'مدة الخطة', 3650);
  if (pricePiasters !== undefined) data.pricePiasters = wholePiasters(pricePiasters, 'سعر الخطة');
  if (description !== undefined) data.description = description === null ? null : String(description).slice(0, 500);
  if (descriptionAr !== undefined) data.descriptionAr = descriptionAr === null ? null : String(descriptionAr).slice(0, 500);

  const updated = await prisma.plan.update({ where: { id: plan.id }, data: data as any });
  return { planId: updated.id };
}

async function processTogglePlan(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { planId, isActive } = op.payload as { planId: string; isActive: boolean };
  if (!planId) throw new SyncError('بيانات الخطة ناقصة');

  const plan = await prisma.plan.findUnique({ where: { id: String(planId) } });
  if (!plan) throw new SyncError('الخطة غير موجودة');
  assertBranch(user, plan.branchId);

  const updated = await prisma.plan.update({
    where: { id: plan.id },
    data: { isActive: Boolean(isActive) }
  });

  return { planId: updated.id };
}

async function processEditExpense(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { expenseId, category, description, amountPiasters, date } = op.payload as {
    expenseId: string;
    category?: string;
    description?: string;
    amountPiasters?: number;
    date?: string;
  };

  if (!expenseId) throw new SyncError('بيانات المصروف ناقصة');

  const existing = await prisma.expense.findUnique({ where: { id: String(expenseId) } });
  if (!existing) throw new SyncError('المصروف غير موجود');
  assertBranch(user, existing.branchId);

  const data: Record<string, unknown> = {};
  if (category !== undefined) data.category = String(category).slice(0, 60);
  if (description !== undefined) data.description = String(description).slice(0, 500);
  if (amountPiasters !== undefined) data.amountPiasters = wholePiasters(amountPiasters, 'قيمة المصروف');
  if (date !== undefined) data.date = safeDate(date, existing.date.getTime());

  const updated = await prisma.expense.update({ where: { id: existing.id }, data: data as any });
  return { expenseId: updated.id };
}

async function processDeleteExpense(op: SyncOperation, user: any): Promise<Record<string, unknown>> {
  const { expenseId } = op.payload as { expenseId: string };
  if (!expenseId) throw new SyncError('بيانات الحذف ناقصة');

  const existing = await prisma.expense.findUnique({ where: { id: String(expenseId) } });
  if (!existing) return { expenseId, alreadyDeleted: true };
  assertBranch(user, existing.branchId);

  await prisma.expense.delete({ where: { id: existing.id } });
  return { expenseId: existing.id };
}

export default router;
