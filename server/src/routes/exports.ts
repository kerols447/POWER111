import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { prisma } from '../index.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { userHasPermission } from '../utils/permissions.js';

const router = Router();

type Cell = string | number | Date | null;

interface Column {
  header: string;
  width: number;
  money?: boolean;
  date?: boolean;
}

interface SessionUser {
  id: string;
  role: string;
  branchIds: string[];
}

const MEMBER_STATUS_AR: Record<string, string> = {
  ACTIVE: 'نشط',
  EXPIRED: 'منتهي',
  SUSPENDED: 'موقوف',
  FROZEN: 'مجمد',
  INACTIVE: 'غير نشط'
};

const SUBSCRIPTION_STATUS_AR: Record<string, string> = {
  ACTIVE: 'نشط',
  EXPIRED: 'منتهي',
  FROZEN: 'مجمد',
  CANCELLED: 'ملغي',
  PENDING_REVIEW: 'بانتظار المراجعة'
};

const PAYMENT_METHOD_AR: Record<string, string> = {
  CASH: 'نقدي',
  BANK_TRANSFER: 'تحويل بنكي',
  CARD: 'بطاقة',
  OTHER: 'أخرى'
};

const CHECK_IN_AR: Record<string, string> = {
  MANUAL: 'يدوي',
  QR_CODE: 'QR',
  BARCODE: 'باركود',
  OFFLINE_SYNC: 'مزامنة'
};

const egp = (piasters: number | null | undefined) => (piasters || 0) / 100;

/** Excel stores whole days as date cells; time-of-day would skew the daily grouping. */
const dayOnly = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
};

const endOfDay = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

function addSheet(workbook: ExcelJS.Workbook, name: string, columns: Column[], rows: Cell[][]) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1, rightToLeft: true }]
  });
  sheet.columns = columns.map((column, index) => ({ header: column.header, key: `col${index}` }));
  columns.forEach((column, index) => {
    const wsColumn = sheet.getColumn(index + 1);
    wsColumn.width = column.width;
    if (column.money) wsColumn.numFmt = '#,##0.00';
    if (column.date) wsColumn.numFmt = 'yyyy-mm-dd';
  });

  const header = sheet.getRow(1);
  header.font = { bold: true, size: 11, color: { argb: 'FF1F1300' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 24;

  rows.forEach(row => sheet.addRow(row));
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: 'middle' };
  });
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length }
  };
  return sheet;
}

function addSummarySheet(workbook: ExcelJS.Workbook, name: string, title: string, entries: [string, Cell][]) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 2, rightToLeft: true }]
  });
  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 24;

  const titleRow = sheet.getRow(1);
  titleRow.values = [title, ''];
  titleRow.font = { bold: true, size: 13, color: { argb: 'FFF59E0B' } };
  titleRow.height = 26;

  const header = sheet.getRow(2);
  header.values = ['البيان', 'القيمة'];
  header.font = { bold: true, color: { argb: 'FF1F1300' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };

  entries.forEach(([label, value]) => {
    const row = sheet.addRow([label, value]);
    const cell = row.getCell(2);
    if (value instanceof Date) cell.numFmt = 'yyyy-mm-dd';
    // Counts and amounts live in the same sheet; only money labels take decimals.
    else if (typeof value === 'number') cell.numFmt = label.includes('ج.م') ? '#,##0.00' : '#,##0';
    row.getCell(1).font = { bold: true };
  });
  return sheet;
}

async function sendWorkbook(
  res: Response,
  workbook: ExcelJS.Workbook,
  filename: string,
  fallbackFilename: string
) {
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  // Raw header bytes must stay ASCII, so the Arabic name travels RFC 5987 encoded.
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.send(Buffer.from(buffer));
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** Mirrors the branch scoping used by GET /api/members. */
function memberScope(user: SessionUser, branchId?: string): Prisma.MemberWhereInput {
  if (branchId) return { branchId };
  if (user.role !== 'OWNER') return { branchId: { in: user.branchIds } };
  return {};
}

function dateRange(from?: string, to?: string) {
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(from);
  if (to) range.lte = endOfDay(to)!;
  return range;
}

// GET /api/exports/members.xlsx?branchId=&status=&search=
router.get('/members', requireAuth, requirePermission('VIEW_MEMBERS'), async (req, res: Response) => {
  try {
    const user = (req.session as any).user as SessionUser;
    const { branchId, status, search } = req.query as Record<string, string | undefined>;

    if (branchId && user.role !== 'OWNER' && !user.branchIds.includes(branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الفرع' });
    }

    const where: Prisma.MemberWhereInput = { ...memberScope(user, branchId) };
    if (status) where.status = status as Prisma.EnumMemberStatusFilter['equals'];
    if (search) {
      where.OR = [
        { person: { name: { contains: search, mode: 'insensitive' } } },
        { person: { phone: { contains: search, mode: 'insensitive' } } },
        { memberCode: { contains: search, mode: 'insensitive' } }
      ];
    }

    const members = await prisma.member.findMany({
      where,
      include: {
        person: { select: { name: true, phone: true, email: true, gender: true } },
        branch: { select: { name: true, code: true } },
        subscriptions: {
          orderBy: { endDate: 'desc' },
          take: 1,
          include: { plan: { select: { nameAr: true, name: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const ids = members.map(m => m.id);
    const visits = ids.length
      ? await prisma.attendance.groupBy({
          by: ['memberId'],
          where: { memberId: { in: ids } },
          _count: { _all: true },
          _max: { checkInTime: true }
        })
      : [];
    const visitMap = new Map(visits.map(v => [v.memberId, v]));

    const rows: Cell[][] = members.map((member, index) => {
      const subscription = member.subscriptions[0];
      const visit = visitMap.get(member.id);
      return [
        index + 1,
        member.person.name,
        member.memberCode,
        member.person.phone,
        member.branch.name,
        MEMBER_STATUS_AR[member.status] || member.status,
        subscription?.plan?.nameAr || subscription?.plan?.name || '—',
        subscription ? dayOnly(subscription.startDate) : null,
        subscription ? dayOnly(subscription.endDate) : null,
        subscription ? egp(subscription.pricePiasters) : null,
        subscription ? egp(subscription.paidPiasters) : null,
        subscription ? egp(subscription.pricePiasters - subscription.paidPiasters) : null,
        subscription ? SUBSCRIPTION_STATUS_AR[subscription.status] || subscription.status : '—',
        visit ? dayOnly(visit._max.checkInTime) : null,
        visit ? visit._count._all : 0,
        dayOnly(member.createdAt),
        member.person.email || '',
        member.notes || ''
      ];
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'POWER 111';
    workbook.created = new Date();

    addSheet(workbook, 'الأعضاء', [
      { header: 'م', width: 6 },
      { header: 'اسم العضو', width: 28 },
      { header: 'الكود / الباركود', width: 18 },
      { header: 'رقم الهاتف', width: 16 },
      { header: 'الفرع', width: 24 },
      { header: 'حالة العضو', width: 14 },
      { header: 'الخطة', width: 18 },
      { header: 'تاريخ الاشتراك', width: 16, date: true },
      { header: 'تاريخ الانتهاء', width: 16, date: true },
      { header: 'السعر (ج.م)', width: 14, money: true },
      { header: 'المدفوع (ج.م)', width: 15, money: true },
      { header: 'المتبقي (ج.م)', width: 15, money: true },
      { header: 'حالة الاشتراك', width: 16 },
      { header: 'آخر حضور', width: 14, date: true },
      { header: 'عدد الزيارات', width: 13 },
      { header: 'تاريخ التسجيل', width: 15, date: true },
      { header: 'البريد الإلكتروني', width: 24 },
      { header: 'ملاحظات', width: 30 }
    ], rows);

    const byStatus = await prisma.member.groupBy({
      by: ['status'],
      where,
      _count: { _all: true }
    });
    const branchNames = await prisma.branch.findMany({ select: { id: true, name: true } });
    const byBranch = await prisma.member.groupBy({
      by: ['branchId'],
      where,
      _count: { _all: true }
    });
    addSummarySheet(workbook, 'ملخص الأعضاء', 'ملخص الأعضاء', [
      ['إجمالي الأعضاء', members.length],
      ...byStatus.map(
        (group): [string, number] => [
          MEMBER_STATUS_AR[group.status] || group.status,
          group._count._all
        ]
      ),
      ['ينتهي خلال 7 أيام', members.filter(m => {
        const end = m.subscriptions[0]?.endDate;
        if (!end) return false;
        const days = (new Date(end).getTime() - Date.now()) / 86400000;
        return days >= 0 && days <= 7;
      }).length],
      ...byBranch.map(
        (group): [string, number] => [
          branchNames.find(b => b.id === group.branchId)?.name || group.branchId,
          group._count._all
        ]
      )
    ]);

    await sendWorkbook(
      res,
      workbook,
      `أعضاء-POWER111-${stamp()}.xlsx`,
      `POWER111-members-${stamp()}.xlsx`
    );
  } catch (error) {
    console.error('Error exporting members workbook:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to export members' });
  }
});

// GET /api/exports/reports.xlsx?branchId=&from=&to=
router.get('/reports', requireAuth, requirePermission('VIEW_REPORTS'), async (req, res: Response) => {
  try {
    const user = (req.session as any).user as SessionUser;
    const { branchId, from, to } = req.query as Record<string, string | undefined>;

    if (branchId && user.role !== 'OWNER' && !user.branchIds.includes(branchId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية الوصول لهذا الفرع' });
    }

    const scopedBranchIds =
      user.role === 'OWNER'
        ? branchId
          ? [branchId]
          : null
        : user.branchIds;

    const branchWhere = scopedBranchIds ? { id: { in: scopedBranchIds } } : {};
    const branchIds = scopedBranchIds
      || (await prisma.branch.findMany({ where: branchWhere, select: { id: true } })).map(b => b.id);

    const createdAt = dateRange(from, to);
    const expenseDate = dateRange(from, to);

    const [canRevenue, canExpenses, canProfit, canOutstanding] = await Promise.all([
      userHasPermission(user.id, 'VIEW_DASHBOARD_REVENUE'),
      userHasPermission(user.id, 'VIEW_DASHBOARD_EXPENSES'),
      userHasPermission(user.id, 'VIEW_DASHBOARD_PROFIT'),
      userHasPermission(user.id, 'VIEW_DASHBOARD_OUTSTANDING')
    ]);

    const branches = await prisma.branch.findMany({
      where: branchIds.length ? { id: { in: branchIds } } : {},
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' }
    });

    const [sales, expenses, payments] = await Promise.all([
      prisma.sale.findMany({
        where: { branchId: { in: branchIds }, createdAt },
        include: {
          branch: { select: { name: true } },
          items: { include: { product: { select: { nameAr: true, name: true } } } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.expense.findMany({
        where: { branchId: { in: branchIds }, date: expenseDate },
        include: { branch: { select: { name: true } } },
        orderBy: { date: 'desc' }
      }),
      prisma.payment.findMany({
        where: { branchId: { in: branchIds }, createdAt },
        include: {
          branch: { select: { name: true } },
          subscription: {
            include: {
              member: { select: { memberCode: true, person: { select: { name: true } } } },
              plan: { select: { nameAr: true, name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const attendance = await prisma.attendance.findMany({
      where: { branchId: { in: branchIds }, checkInTime: createdAt },
      select: { checkInTime: true, branchId: true, memberId: true, method: true }
    });

    const revenuePiasters =
      sales.reduce((sum, s) => sum + s.finalTotalPiasters, 0) +
      payments.reduce((sum, p) => sum + p.amountPiasters, 0);
    const expensesPiasters = expenses.reduce((sum, e) => sum + e.amountPiasters, 0);

    const outstanding = await prisma.subscription.findMany({
      where: { status: 'ACTIVE', branchId: { in: branchIds } },
      select: { pricePiasters: true, paidPiasters: true }
    });
    const outstandingPiasters = outstanding.reduce(
      (sum, s) => sum + Math.max(0, s.pricePiasters - s.paidPiasters),
      0
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'POWER 111';
    workbook.created = new Date();

    addSummarySheet(workbook, 'ملخص', 'ملخص الفترة', [
      ['من', from ? dayOnly(from) : dayOnly(new Date(2000, 0, 1))],
      ['إلى', to ? dayOnly(to) : dayOnly(new Date())],
      ['الفرع', branchId ? branches[0]?.name || branchId : 'كل الفروع'],
      ['الإيرادات (ج.م)', canRevenue ? egp(revenuePiasters) : 'غير مصرّح'],
      ['إيرادات الاشتراكات (ج.م)', canRevenue ? egp(payments.reduce((s, p) => s + p.amountPiasters, 0)) : 'غير مصرّح'],
      ['إيرادات البيع (ج.م)', canRevenue ? egp(sales.reduce((s, x) => s + x.finalTotalPiasters, 0)) : 'غير مصرّح'],
      ['المصروفات (ج.م)', canExpenses ? egp(expensesPiasters) : 'غير مصرّح'],
      ['صافي الربح (ج.م)', canProfit ? egp(revenuePiasters - expensesPiasters) : 'غير مصرّح'],
      ['مبالغ متبقية على الأعضاء (ج.م)', canOutstanding ? egp(outstandingPiasters) : 'غير مصرّح'],
      ['عدد الفواتير', sales.length],
      ['عدد الصرفيات', expenses.length],
      ['عدد الدفعات', payments.length],
      ['عدد مرات الحضور', attendance.length]
    ]);

    // One grouped query per metric instead of 5 queries per branch.
    const [salesPerBranch, expensesPerBranch, paymentsPerBranch, membersPerBranch, subsPerBranch] =
      await Promise.all([
        prisma.sale.groupBy({
          by: ['branchId'],
          where: { branchId: { in: branchIds }, createdAt },
          _sum: { finalTotalPiasters: true },
          _count: { _all: true }
        }),
        prisma.expense.groupBy({
          by: ['branchId'],
          where: { branchId: { in: branchIds }, date: expenseDate },
          _sum: { amountPiasters: true }
        }),
        prisma.payment.groupBy({
          by: ['branchId'],
          where: { branchId: { in: branchIds }, createdAt },
          _sum: { amountPiasters: true },
          _count: { _all: true }
        }),
        prisma.member.groupBy({
          by: ['branchId'],
          where: { branchId: { in: branchIds }, status: 'ACTIVE' },
          _count: { _all: true }
        }),
        prisma.subscription.groupBy({
          by: ['branchId'],
          where: { branchId: { in: branchIds }, status: 'ACTIVE', endDate: { gte: new Date() } },
          _count: { _all: true }
        })
      ]);

    const byBranch = <T>(groups: Array<{ branchId: string } & T>, pick: (group: { branchId: string } & T) => number) => {
      const map = new Map<string, number>();
      groups.forEach(group => map.set(group.branchId, pick(group)));
      return (id: string) => map.get(id) || 0;
    };
    const salesTotals = byBranch(salesPerBranch, g => g._sum.finalTotalPiasters || 0);
    const salesCounts = byBranch(salesPerBranch, g => g._count._all);
    const expenseTotals = byBranch(expensesPerBranch, g => g._sum.amountPiasters || 0);
    const paymentTotals = byBranch(paymentsPerBranch, g => g._sum.amountPiasters || 0);
    const paymentCounts = byBranch(paymentsPerBranch, g => g._count._all);
    const activeMembers = byBranch(membersPerBranch, g => g._count._all);
    const activeSubscriptions = byBranch(subsPerBranch, g => g._count._all);

    const comparisonRows: Cell[][] = branches.map(branch => {
      const branchRevenue = salesTotals(branch.id) + paymentTotals(branch.id);
      const branchExpense = expenseTotals(branch.id);
      return [
        branch.name,
        branch.code,
        canRevenue ? egp(branchRevenue) : null,
        canExpenses ? egp(branchExpense) : null,
        canProfit ? egp(branchRevenue - branchExpense) : null,
        salesCounts(branch.id),
        paymentCounts(branch.id),
        activeMembers(branch.id),
        activeSubscriptions(branch.id)
      ];
    });

    addSheet(workbook, 'مقارنة الفروع', [
      { header: 'الفرع', width: 28 },
      { header: 'الكود', width: 10 },
      { header: 'الإيرادات (ج.م)', width: 18, money: true },
      { header: 'المصروفات (ج.م)', width: 18, money: true },
      { header: 'صافي الربح (ج.م)', width: 18, money: true },
      { header: 'عدد الفواتير', width: 13 },
      { header: 'عدد الدفعات', width: 13 },
      { header: 'أعضاء نشط', width: 12 },
      { header: 'اشتراكات نشطة', width: 15 }
    ], comparisonRows);

    addSheet(workbook, 'المبيعات', [
      { header: 'التاريخ', width: 14, date: true },
      { header: 'رقم الفاتورة', width: 18 },
      { header: 'الفرع', width: 26 },
      { header: 'الأصناف', width: 40 },
      { header: 'الإجمالي قبل الخصم (ج.م)', width: 22, money: true },
      { header: 'الخصم (ج.م)', width: 14, money: true },
      { header: 'الصافي (ج.م)', width: 16, money: true },
      { header: 'طريقة الدفع', width: 14 }
    ], sales.map(sale => [
      dayOnly(sale.createdAt),
      sale.invoiceNumber,
      sale.branch.name,
      sale.items.map(item => `${item.product.nameAr || item.product.name} ×${item.quantity}`).join('، '),
      egp(sale.totalPiasters),
      egp(sale.discountPiasters),
      egp(sale.finalTotalPiasters),
      PAYMENT_METHOD_AR[sale.paymentMethod] || sale.paymentMethod
    ]));

    const expenseByCategory = new Map<string, { count: number; total: number }>();
    expenses.forEach(expense => {
      const bucket = expenseByCategory.get(expense.category) || { count: 0, total: 0 };
      bucket.count += 1;
      bucket.total += expense.amountPiasters;
      expenseByCategory.set(expense.category, bucket);
    });

    const expensesSheet = addSheet(workbook, 'المصروفات', [
      { header: 'التاريخ', width: 14, date: true },
      { header: 'الفرع', width: 26 },
      { header: 'البند', width: 20 },
      { header: 'الوصف', width: 40 },
      { header: 'المبلغ (ج.م)', width: 16, money: true }
    ], [
      ...expenses.map(expense => [
        dayOnly(expense.date),
        expense.branch.name,
        expense.category,
        expense.description,
        egp(expense.amountPiasters)
      ]),
      [],
      ['الإجمالي', '', '', '', egp(expensesPiasters)]
    ]);
    expensesSheet.getRow(expensesSheet.rowCount).font = { bold: true };

    addSheet(workbook, 'الدفعات', [
      { header: 'التاريخ', width: 14, date: true },
      { header: 'العضو', width: 28 },
      { header: 'الكود', width: 16 },
      { header: 'الفرع', width: 26 },
      { header: 'الخطة', width: 18 },
      { header: 'المبلغ (ج.م)', width: 16, money: true },
      { header: 'طريقة الدفع', width: 14 },
      { header: 'مرجع', width: 18 }
    ], payments.map(payment => [
      dayOnly(payment.createdAt),
      payment.subscription.member.person.name,
      payment.subscription.member.memberCode,
      payment.branch.name,
      payment.subscription.plan?.nameAr || payment.subscription.plan?.name || '—',
      egp(payment.amountPiasters),
      PAYMENT_METHOD_AR[payment.method] || payment.method,
      payment.reference || ''
    ]));

    const daily = new Map<string, { date: Date; branchId: string; visits: number; members: Set<string> }>();
    attendance.forEach(record => {
      const date = dayOnly(record.checkInTime)!;
      const key = `${date.toISOString()}|${record.branchId}`;
      const bucket = daily.get(key) || { date, branchId: record.branchId, visits: 0, members: new Set<string>() };
      bucket.visits += 1;
      bucket.members.add(record.memberId);
      daily.set(key, bucket);
    });

    addSheet(workbook, 'الحضور اليومي', [
      { header: 'اليوم', width: 14, date: true },
      { header: 'الفرع', width: 28 },
      { header: 'عدد الدخول', width: 14 },
      { header: 'أعضاء مختلفون', width: 16 }
    ], [...daily.values()]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map(bucket => [
        bucket.date,
        branches.find(branch => branch.id === bucket.branchId)?.name || bucket.branchId,
        bucket.visits,
        bucket.members.size
      ]));

    const period = [from, to].filter(Boolean).join('_') || stamp();
    await sendWorkbook(
      res,
      workbook,
      `تقارير-POWER111-${period}.xlsx`,
      `POWER111-reports-${period}.xlsx`
    );
  } catch (error) {
    console.error('Error exporting reports workbook:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to export reports' });
  }
});

export default router;
