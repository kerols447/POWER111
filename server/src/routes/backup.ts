import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createAuditLog } from './audit.js';

const router = Router();

/**
 * Insert order: parents before children. Restore deletes in the exact reverse,
 * which keeps every foreign key satisfied without disabling constraints.
 */
const TABLES = [
  'user',
  'branch',
  'branchAccess',
  'userPermission',
  'branchSettings',
  'person',
  'member',
  'plan',
  'subscription',
  'payment',
  'attendance',
  'salaryPayment',
  'product',
  'stockMovement',
  'sale',
  'saleItem',
  'expense',
  'auditLog',
  'websiteContent',
  'offer',
  'contactMessage',
  'pendingOperation'
] as const;

type TableKey = (typeof TABLES)[number];

const BACKUP_VERSION = 1;

/** A backup that would lock the owner out or silently wipe everything is refused. */
function validateBackup(body: any): { ok: true; tables: Record<TableKey, any[]> } | { ok: false; message: string } {
  if (!body || typeof body !== 'object') return { ok: false, message: 'الملف غير صالح' };
  if (body.backupVersion !== BACKUP_VERSION) return { ok: false, message: 'هذا الملف ليس نسخة احتياطية معروفة' };
  if (!body.tables || typeof body.tables !== 'object') return { ok: false, message: 'الملف لا يحتوي على جداول' };

  const unknown = Object.keys(body.tables).filter(key => !(TABLES as readonly string[]).includes(key));
  if (unknown.length > 0) return { ok: false, message: `جدول غير معروف في الملف: ${unknown[0]}` };

  const tables = {} as Record<TableKey, any[]>;
  for (const key of TABLES) {
    const rows = key in body.tables ? body.tables[key] : [];
    if (!Array.isArray(rows)) return { ok: false, message: `الجدول ${key} ليس قائمة` };
    tables[key] = rows;
  }

  if (tables.user.length === 0) return { ok: false, message: 'النسخة لا تحتوي على أي مستخدم — الاستعادة ستغلق النظام' };
  if (tables.branch.length === 0) return { ok: false, message: 'النسخة لا تحتوي على أي فرع' };
  if (!tables.user.every(row => typeof row?.id === 'string' && typeof row?.email === 'string')) {
    return { ok: false, message: 'بيانات المستخدمين في الملف غير مكتملة' };
  }

  return { ok: true, tables };
}

// GET /api/backup/download — full JSON dump of every table
router.get('/download', requireAuth, requireRole('OWNER'), async (_req: Request, res: Response) => {
  try {
    const tables = {} as Record<TableKey, any[]>;
    const counts: Record<string, number> = {};

    for (const key of TABLES) {
      const rows = await (prisma as any)[key].findMany();
      tables[key] = rows;
      counts[key] = rows.length;
    }

    const payload = {
      app: 'POWER 111',
      backupVersion: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      counts,
      tables
    };

    const arabicName = `نسخة-احتياطية-POWER111-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Raw header bytes must stay ASCII, so the Arabic name travels RFC 5987 encoded.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="POWER111-backup-${new Date().toISOString().slice(0, 10)}.json"; filename*=UTF-8''${encodeURIComponent(arabicName)}`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(JSON.stringify(payload));
  } catch (error) {
    console.error('Backup download failed:', error);
    res.status(500).json({ error: 'Backup failed', message: 'تعذر إنشاء النسخة الاحتياطية' });
  }
});

// POST /api/backup/restore — replaces every table with the contents of the file
router.post('/restore', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;

    if (req.body?.confirm !== 'RESTORE') {
      return res.status(400).json({ error: 'Confirmation required', message: 'اكتب كلمة RESTORE للتأكيد' });
    }

    const result = validateBackup(req.body?.backup);
    if (!result.ok) {
      return res.status(400).json({ error: 'Invalid backup', message: result.message });
    }
    const { tables } = result;

    const restored = await prisma.$transaction(async (tx) => {
      const counts: Record<string, number> = {};

      for (const key of [...TABLES].reverse() as TableKey[]) {
        await (tx as any)[key].deleteMany({});
      }

      for (const key of TABLES) {
        const rows = tables[key];
        if (rows.length > 0) {
          await (tx as any)[key].createMany({ data: rows });
        }
        counts[key] = rows.length;
      }

      return counts;
    }, { maxWait: 10000, timeout: 120000 });

    await createAuditLog(user.id, 'RESTORE_BACKUP', 'System', undefined, undefined, {
      action: 'restored',
      backupCreatedAt: req.body?.backup?.createdAt ?? null,
      restored
    });

    const total = Object.values(restored).reduce((sum, n) => sum + n, 0);
    res.json({
      success: true,
      message: `تمت استعادة البيانات بنجاح — ${total} سجل`,
      data: { counts: restored }
    });
  } catch (error) {
    console.error('Backup restore failed:', error);
    res.status(500).json({
      error: 'Restore failed',
      message: 'فشلت الاستعادة ولم يتغير أي شيء في قاعدة البيانات'
    });
  }
});

export default router;
