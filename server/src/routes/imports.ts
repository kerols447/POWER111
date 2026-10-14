import { Router, Request, Response } from 'express';
import { MemberStatus, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createAuditLog } from './audit.js';

const router = Router();

/**
 * Label plans for durations the branch has none of. They stay inactive on purpose:
 * the public landing page only publishes active plans, so importing historical
 * members never invents prices the owner didn't enter.
 */
const LABEL_PLANS = [
  { durationDays: 15, name: '15 Days', nameAr: 'اشتراك 15 يوم' },
  { durationDays: 60, name: 'Two Months', nameAr: 'اشتراك شهرين' },
  { durationDays: 180, name: 'Six Months', nameAr: 'اشتراك 6 شهور' },
  { durationDays: 365, name: 'Annual', nameAr: 'اشتراك سنوي' }
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

class DryRunAbort extends Error {}

interface WantedRow {
  code: string;
  name: string;
  startDate: Date;
  endDate: Date;
  durationDays: number;
  planId: string;
  status: MemberStatus;
}

function nearestPlan(plans: { id: string; durationDays: number }[], durationDays: number) {
  return plans.reduce((best, p) =>
    Math.abs(p.durationDays - durationDays) < Math.abs(best.durationDays - durationDays) ? p : best
  );
}

function validateRow(row: any): string | null {
  if (!row || typeof row !== 'object') return 'صف غير صالح';
  if (typeof row.code !== 'string' || !row.code.trim()) return 'كود فارغ';
  if (row.code.trim().length > 24) return `كود طويل جدًا: ${row.code}`;
  if (typeof row.name !== 'string' || !row.name.trim()) return `اسم فارغ للكود ${row.code}`;
  if (!ISO_DATE.test(row.startDate || '')) return `تاريخ بداية غير صالح للكود ${row.code}`;
  if (!ISO_DATE.test(row.endDate || '')) return `تاريخ نهاية غير صالح للكود ${row.code}`;
  if (new Date(row.endDate) < new Date(row.startDate)) return `النهاية قبل البداية للكود ${row.code}`;
  return null;
}

// Whole-number dates: sheet start lands on midnight, sheet end stays inclusive to the last second.
const subKey = (memberId: string, startDate: Date) => `${memberId}|${startDate.toISOString()}`;

// POST /api/imports/members — bring members over from the old system with their exact codes
// and subscription dates. Idempotent: running it twice updates in place instead of duplicating.
router.post('/members', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const { branchId, rows, dryRun } = req.body ?? {};
    if (typeof branchId !== 'string' || !branchId) {
      return res.status(400).json({ error: 'Validation', message: 'محتاج branchId' });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Validation', message: 'مفيش صفوف' });
    }

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return res.status(404).json({ error: 'Not found', message: 'الفرع غير موجود' });

    const skipped: { code: string; reason: string }[] = [];
    const wanted: WantedRow[] = [];
    const seenCodes = new Set<string>();

    rows.forEach((row: any, i: number) => {
      const problem = validateRow(row);
      if (problem) {
        skipped.push({ code: String(row?.code ?? `#${i}`), reason: problem });
        return;
      }
      const code = row.code.trim();
      if (seenCodes.has(code)) {
        skipped.push({ code, reason: 'الكود مكرر في نفس الشيت' });
        return;
      }
      seenCodes.add(code);
      wanted.push({
        code,
        name: row.name.replace(/\s+/g, ' ').trim(),
        startDate: new Date(`${row.startDate}T00:00:00.000Z`),
        endDate: new Date(`${row.endDate}T23:59:59.999Z`),
        durationDays: Number.isFinite(row.durationDays) ? row.durationDays : 30,
        planId: '',
        status: 'ACTIVE'
      });
    });

    const summary = {
      membersCreated: 0,
      membersUpdated: 0,
      subscriptionsCreated: 0,
      subscriptionsUpdated: 0,
      expired: 0,
      labelPlansCreated: [] as string[],
      skipped
    };

    await prisma.$transaction(async (tx) => {
      const plans = await tx.plan.findMany({ where: { branchId } });
      if (plans.length === 0) throw new Error('الفرع ده مفيهوش خطط اشتراك — ضيف خطة من صفحة الاشتراكات الأول');

      for (const label of LABEL_PLANS) {
        if (plans.some(p => p.durationDays === label.durationDays)) continue;
        const created = await tx.plan.create({
          data: { branchId, ...label, pricePiasters: 0, isActive: false }
        });
        plans.push(created);
        summary.labelPlansCreated.push(created.nameAr);
      }

      const now = new Date();
      for (const row of wanted) {
        row.planId = nearestPlan(plans, row.durationDays).id;
        row.status = row.endDate >= now ? 'ACTIVE' : 'EXPIRED';
        if (row.status === 'EXPIRED') summary.expired++;
      }

      const membersByCode = new Map<string, { id: string; personId: string; person: { name: string } }>();
      const found = await tx.member.findMany({
        where: { memberCode: { in: wanted.map(r => r.code) } },
        include: { person: { select: { name: true, id: true } } }
      });
      for (const m of found) membersByCode.set(m.memberCode, m);

      const fresh = wanted.filter(r => !membersByCode.has(r.code));
      const preExistingCodes = new Set(wanted.filter(r => membersByCode.has(r.code)).map(r => r.code));
      if (fresh.length > 0) {
        // The old sheet has no phone numbers; this placeholder keeps the unique index usable
        // and is obvious enough to spot until the real numbers arrive.
        const pendingPhones = fresh.map(r => `pending-${r.code}`);
        await tx.person.createMany({
          data: fresh.map((r, i) => ({
            name: r.name,
            phone: pendingPhones[i],
            phoneNormalized: pendingPhones[i]
          }))
        });
        const people = await tx.person.findMany({ where: { phoneNormalized: { in: pendingPhones } } });
        const personIdByCode = new Map(people.map(p => [p.phoneNormalized.replace(/^pending-/, ''), p.id]));
        const memberRows: { personId: string; branchId: string; memberCode: string; status: MemberStatus }[] = [];
        for (const r of fresh) {
          const personId = personIdByCode.get(r.code);
          if (personId) memberRows.push({ personId, branchId, memberCode: r.code, status: r.status });
        }
        await tx.member.createMany({ data: memberRows });
        const createdMembers = await tx.member.findMany({
          where: { memberCode: { in: fresh.map(r => r.code) } },
          include: { person: { select: { name: true, id: true } } }
        });
        for (const m of createdMembers) membersByCode.set(m.memberCode, m);
        summary.membersCreated = createdMembers.length;
      }

      const rowsWithMembers: { row: WantedRow; memberId: string; personId: string }[] = [];
      for (const row of wanted) {
        const member = membersByCode.get(row.code) as any;
        if (!member) {
          skipped.push({ code: row.code, reason: 'تعذر إنشاء العضو' });
          continue;
        }
        rowsWithMembers.push({ row, memberId: member.id, personId: member.personId });
        if (preExistingCodes.has(row.code)) summary.membersUpdated++;
        if (member.person.name !== row.name) {
          await tx.person.update({ where: { id: member.personId }, data: { name: row.name } });
        }
      }

      if (rowsWithMembers.length > 0) {
        for (const status of ['ACTIVE', 'EXPIRED'] as MemberStatus[]) {
          const ids = rowsWithMembers.filter(r => r.row.status === status).map(r => r.memberId);
          if (ids.length > 0) await tx.member.updateMany({ where: { id: { in: ids } }, data: { status } });
        }

        const existingSubs = await tx.subscription.findMany({
          where: { memberId: { in: rowsWithMembers.map(r => r.memberId) } }
        });
        const subsByKey = new Map(existingSubs.map(s => [subKey(s.memberId, s.startDate), s]));

        const toCreate: any[] = [];
        const toUpdate: any[] = [];
        for (const { row, memberId } of rowsWithMembers) {
          const existing = subsByKey.get(subKey(memberId, row.startDate));
          if (existing) {
            if (
              existing.endDate.getTime() !== row.endDate.getTime() ||
              existing.planId !== row.planId ||
              existing.status !== row.status
            ) {
              toUpdate.push({ id: existing.id, endDate: row.endDate, planId: row.planId, status: row.status });
            }
          } else {
            toCreate.push({
              memberId,
              planId: row.planId,
              branchId,
              startDate: row.startDate,
              endDate: row.endDate,
              pricePiasters: 0,
              paidPiasters: 0,
              status: row.status as SubscriptionStatus,
              notes: 'استيراد من النظام القديم'
            });
          }
        }

        if (toCreate.length > 0) await tx.subscription.createMany({ data: toCreate });
        for (const s of toUpdate) {
          await tx.subscription.update({
            where: { id: s.id },
            data: { endDate: s.endDate, planId: s.planId, status: s.status }
          });
        }
        summary.subscriptionsCreated = toCreate.length;
        summary.subscriptionsUpdated = toUpdate.length;
      }

      if (dryRun) {
        const abort = new DryRunAbort();
        (abort as any).payload = { dryRun: true, branchName: branch.name, ...summary, total: rows.length };
        throw abort;
      }
    }, { timeout: 120000, maxWait: 10000 });

    const payload = {
      dryRun: !!dryRun,
      branchName: branch.name,
      ...summary,
      total: rows.length
    };

    if (!dryRun) {
      await createAuditLog(
        (req.session as any).user.id,
        'IMPORT_MEMBERS',
        'Member',
        undefined,
        branchId,
        { action: 'imported', summary: payload }
      );
    }

    res.json({ success: true, data: payload });
  } catch (error) {
    if (error instanceof DryRunAbort) {
      // Everything the check would have done is rolled back; the counters above still describe it.
      return res.json({ success: true, data: { ...(error as any).payload, dryRun: true } });
    }
    console.error('Member import failed:', error);
    const message = error instanceof Error && error.message.startsWith('الفرع')
      ? error.message
      : 'فشل الاستيراد — راجع الشيت والفرع';
    res.status(500).json({ error: 'Import failed', message });
  }
});

export default router;
