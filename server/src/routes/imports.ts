import { Router, Request, Response } from 'express';
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
    const work: any[] = [];
    rows.forEach((row: any, i: number) => {
      const problem = validateRow(row);
      if (problem) skipped.push({ code: String(row?.code ?? `#${i}`), reason: problem });
      else work.push(row);
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
      const seenCodes = new Set<string>();

      for (const row of work) {
        const code = row.code.trim();
        const name = row.name.replace(/\s+/g, ' ').trim();
        const startDate = new Date(`${row.startDate}T00:00:00.000Z`);
        const endDate = new Date(`${row.endDate}T23:59:59.999Z`);
        const durationDays = Number.isFinite(row.durationDays) ? row.durationDays : 30;

        if (seenCodes.has(code)) {
          skipped.push({ code, reason: 'الكود مكرر في نفس الشيت' });
          continue;
        }
        seenCodes.add(code);

        const plan = nearestPlan(plans, durationDays);
        const active = endDate >= now;
        if (!active) summary.expired++;

        let member = await tx.member.findUnique({ where: { memberCode: code }, include: { person: true } });

        if (member) {
          await tx.person.update({ where: { id: member.personId }, data: { name } });
          summary.membersUpdated++;
        } else {
          // The old sheet has no phone numbers; this placeholder keeps the unique index
          // usable and is obvious enough to spot until the real numbers arrive.
          const person = await tx.person.create({
            data: { name, phone: `pending-${code}`, phoneNormalized: `pending-${code}` }
          });
          member = await tx.member.create({
            data: { personId: person.id, branchId, memberCode: code, status: active ? 'ACTIVE' : 'EXPIRED' },
            include: { person: true }
          });
          summary.membersCreated++;
        }

        await tx.member.update({ where: { id: member.id }, data: { status: active ? 'ACTIVE' : 'EXPIRED' } });

        const existingSub = await tx.subscription.findFirst({
          where: { memberId: member.id, startDate }
        });
        if (existingSub) {
          await tx.subscription.update({
            where: { id: existingSub.id },
            data: { endDate, planId: plan.id, status: active ? 'ACTIVE' : 'EXPIRED' }
          });
          summary.subscriptionsUpdated++;
        } else {
          await tx.subscription.create({
            data: {
              memberId: member.id,
              planId: plan.id,
              branchId,
              startDate,
              endDate,
              pricePiasters: 0,
              paidPiasters: 0,
              status: active ? 'ACTIVE' : 'EXPIRED',
              notes: 'استيراد من النظام القديم'
            }
          });
          summary.subscriptionsCreated++;
        }
      }

      if (dryRun) throw new DryRunAbort();
    });

    if (!dryRun) {
      await createAuditLog(
        (req.session as any).user.id,
        'IMPORT_MEMBERS',
        'Member',
        undefined,
        branchId,
        { action: 'imported', summary }
      );
    }

    res.json({
      success: true,
      data: {
        dryRun: !!dryRun,
        branchName: branch.name,
        ...summary,
        total: rows.length
      }
    });
  } catch (error) {
    if (error instanceof DryRunAbort) {
      return res.json({ success: true, data: { dryRun: true, checked: (req.body?.rows || []).length } });
    }
    console.error('Member import failed:', error);
    const message = error instanceof Error && error.message.startsWith('الفرع')
      ? error.message
      : 'فشل الاستيراد — راجع الشيت والفرع';
    res.status(500).json({ error: 'Import failed', message });
  }
});

export default router;
