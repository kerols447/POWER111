import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import NoticeBanner from '../components/NoticeBanner';
import { localDate } from '../utils/dates';
import {
  PageHeader, SectionTitle, Field, Picker, Toggle, Btn, Loading, EmptyState,
  CARD, FIELD, TONE
} from '../components/ui';
import { Stagger } from '../components/Motion';

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface BranchSettings {
  id: string;
  branchId: string;
  taxEnabled: boolean;
  taxRatePercent: number;
  maxFreezeDays: number;
  freezeRequiresApproval: boolean;
  allowCrossBranchCheckin: boolean;
  autoCheckoutEnabled: boolean;
  autoCheckoutMinutes: number;
  lowStockThreshold: number;
  currency: string;
  timezone: string;
}

/** Arabic labels for the backup summary — tables the owner cares about. */
const BACKUP_LABELS: Record<string, string> = {
  user: 'المستخدمون',
  branch: 'الفروع',
  person: 'الأشخاص',
  member: 'العضويات',
  plan: 'الباقات',
  subscription: 'الاشتراكات',
  payment: 'المدفوعات',
  attendance: 'الحضور',
  product: 'المنتجات',
  sale: 'الفواتير',
  expense: 'المصروفات',
  offer: 'العروض'
};
const BACKUP_SUMMARY_ORDER = ['user', 'branch', 'member', 'plan', 'subscription', 'payment', 'attendance', 'product', 'sale', 'expense', 'offer'];

interface PendingRestore {
  fileName: string;
  createdAt: string;
  payload: any;
  counts: Record<string, number>;
}

export default function SettingsPage() {
  const { isOwner } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [saveNotice, setSaveNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    if (selectedBranch) {
      fetchSettings();
    }
  }, [selectedBranch]);

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      const data = await res.json();
      const branchList = Array.isArray(data) ? data : (data.branches || []);
      setBranches(branchList);
      if (branchList.length > 0 && !selectedBranch) {
        setSelectedBranch(branchList[0].id);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const fetchSettings = async (branchId?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/${branchId ?? selectedBranch}`, { credentials: 'include' });
      const data = await res.json();
      if (data.id) {
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    setSaveNotice(null);
    try {
      const res = await fetch(`/api/settings/${selectedBranch}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings)
      });

      const data = await res.json();
      if (data.id) {
        setSettings(data);
        setSaveNotice({ kind: 'ok', text: 'تم حفظ الإعدادات بنجاح' });
      } else {
        setSaveNotice({ kind: 'err', text: data.message || 'حدث خطأ في الحفظ' });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveNotice({ kind: 'err', text: 'فشل في حفظ الإعدادات' });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof BranchSettings, value: any) => {
    if (settings) {
      setSettings({ ...settings, [key]: value });
    }
  };

  const downloadBackup = async () => {
    setDownloading(true);
    setNotice(null);
    try {
      const res = await fetch('/api/backup/download', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.tables) {
        setNotice({ kind: 'err', text: data?.message || 'فشل تحميل النسخة الاحتياطية' });
        return;
      }

      const members = data.tables?.member?.length ?? 0;
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `نسخة-احتياطية-POWER111-${localDate()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setNotice({ kind: 'ok', text: `تم تحميل النسخة الاحتياطية — ${members} عضوية` });
    } catch (error) {
      console.error('Backup download failed:', error);
      setNotice({ kind: 'err', text: 'فشل تحميل النسخة الاحتياطية' });
    } finally {
      setDownloading(false);
    }
  };

  const pickBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setNotice(null);
    setPendingRestore(null);
    setRestoreConfirm('');

    let parsed: any;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setNotice({ kind: 'err', text: 'الملف ليس نسخة احتياطية صالحة' });
      return;
    }

    if (parsed?.backupVersion !== 1 || !parsed.tables) {
      setNotice({ kind: 'err', text: 'الملف ليس نسخة احتياطية معروفة للنظام' });
      return;
    }
    if (!Array.isArray(parsed.tables.user) || parsed.tables.user.length === 0) {
      setNotice({ kind: 'err', text: 'الملف لا يحتوي على مستخدمين — لا يمكن استعادته' });
      return;
    }

    const counts: Record<string, number> = {};
    for (const [key, rows] of Object.entries(parsed.tables)) {
      counts[key] = Array.isArray(rows) ? rows.length : 0;
    }

    setPendingRestore({
      fileName: file.name,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
      payload: parsed,
      counts
    });
  };

  const cancelRestore = () => {
    setPendingRestore(null);
    setRestoreConfirm('');
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;

    setRestoring(true);
    setNotice(null);
    try {
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirm: 'RESTORE', backup: pendingRestore.payload })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setNotice({ kind: 'err', text: data?.message || 'فشلت استعادة البيانات' });
      } else {
        setNotice({ kind: 'ok', text: data.message });
        setPendingRestore(null);
        setRestoreConfirm('');
        // Restoring rewrites every id, so the picked branch has to be re-selected.
        const branchRes = await fetch('/api/branches', { credentials: 'include' });
        const branchData = await branchRes.json().catch(() => null);
        const branchList = Array.isArray(branchData) ? branchData : (branchData?.branches || []);
        setBranches(branchList);
        setSelectedBranch(branchList[0]?.id ?? '');
        setSettings(null);
        if (branchList.length > 0) {
          await fetchSettings(branchList[0].id);
        }
      }
    } catch (error) {
      console.error('Backup restore failed:', error);
      setNotice({ kind: 'err', text: 'فشلت استعادة البيانات' });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Stagger className="space-y-5 sm:space-y-7" dir="rtl">
      {/* Header */}
      <PageHeader
        icon="settings"
        title="الإعدادات"
        caption="إعدادات فروع المنشأة"
      />

      {/* Branch Selector */}
      <div className={`${CARD} p-4 sm:p-5`}>
        <Field label="اختر الفرع">
          <Picker
            value={selectedBranch}
            onChange={(v) => setSelectedBranch(v)}
            ariaLabel="اختر الفرع"
            className="w-full sm:w-72"
            options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
          />
        </Field>
      </div>

      {loading ? (
        <Loading />
      ) : settings ? (
        <div className="space-y-5 sm:space-y-6">
          {/* Tax Settings */}
          <div className={`${CARD} p-4 sm:p-6 space-y-4`}>
            <SectionTitle tone={TONE.outstanding}>الضرائب</SectionTitle>

            <div className="bg-dark border border-dark-border rounded-xl px-4 py-1.5">
              <Toggle
                label="تفعيل الضريبة"
                hint="تطبيق الضريبة على المبيعات"
                checked={settings.taxEnabled}
                onChange={(val) => updateSetting('taxEnabled', val)}
              />
            </div>

            {settings.taxEnabled && (
              <Field label="نسبة الضريبة (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={settings.taxRatePercent / 100}
                  onChange={(e) => updateSetting('taxRatePercent', Math.round(parseFloat(e.target.value) * 100))}
                  className={`${FIELD} sm:max-w-xs`}
                />
              </Field>
            )}
          </div>

          {/* Freeze Settings */}
          <div className={`${CARD} p-4 sm:p-6 space-y-4`}>
            <SectionTitle tone={TONE.attendance}>تجميد الاشتراكات</SectionTitle>

            <Field label="الحد الأقصى لأيام التجميد">
              <input
                type="number"
                min="0"
                value={settings.maxFreezeDays}
                onChange={(e) => updateSetting('maxFreezeDays', parseInt(e.target.value) || 0)}
                className={`${FIELD} sm:max-w-xs`}
              />
            </Field>

            <div className="bg-dark border border-dark-border rounded-xl px-4 py-1.5">
              <Toggle
                label="يتطلب موافقة المدير"
                hint="تجميد الاشتراك يحتاج موافقة من المدير"
                checked={settings.freezeRequiresApproval}
                onChange={(val) => updateSetting('freezeRequiresApproval', val)}
              />
            </div>
          </div>

          {/* Attendance Settings */}
          <div className={`${CARD} p-4 sm:p-6 space-y-4`}>
            <SectionTitle tone={TONE.members}>الحضور</SectionTitle>

            <div className="bg-dark border border-dark-border rounded-xl px-4 py-1.5">
              <Toggle
                label="الحضور في فرع آخر"
                hint={
                  settings.allowCrossBranchCheckin
                    ? 'مفتوح — العضو يقدر يسجل حضوره في الفرع ده حتى لو اشتراكه في فرع تاني، ويوصلك تنبيه.'
                    : 'مقفول — العضو يسجل حضوره في فرعه بس. افتحه لو عايز تسمح بالحضور من فرع تاني.'
                }
                checked={settings.allowCrossBranchCheckin}
                onChange={(val) => updateSetting('allowCrossBranchCheckin', val)}
              />
            </div>

            <div className="bg-dark border border-dark-border rounded-xl px-4 py-1.5">
              <Toggle
                label="الانصراف التلقائي"
                hint={
                  settings.autoCheckoutEnabled
                    ? 'شغال — العضو ينصرف تلقائيًا بعد المدة المحددة من تسجيل الحضور.'
                    : 'مقفول — العضو يفضل مسجل حضوره لحد ما تسجل انصرافه يدوي.'
                }
                checked={settings.autoCheckoutEnabled}
                onChange={(val) => updateSetting('autoCheckoutEnabled', val)}
              />
            </div>

            <div className={settings.autoCheckoutEnabled ? '' : 'opacity-50'}>
              <Field label="مدة الانصراف التلقائي (بالدقائق)">
                <input
                  type="number"
                  min="1"
                  max="1440"
                  disabled={!settings.autoCheckoutEnabled}
                  value={settings.autoCheckoutMinutes ?? 90}
                  onChange={(e) => updateSetting('autoCheckoutMinutes', Math.min(Math.max(parseInt(e.target.value) || 0, 0), 1440))}
                  className={`${FIELD} sm:max-w-xs disabled:cursor-not-allowed`}
                />
              </Field>
              {settings.autoCheckoutEnabled && (
                <p className="text-xs text-primary/70 mt-2">
                  {`هيتم انصراف العضو بعد ${settings.autoCheckoutMinutes ?? 90} دقيقة (${Math.floor((settings.autoCheckoutMinutes ?? 90) / 60)} ساعة و ${(settings.autoCheckoutMinutes ?? 90) % 60} دقيقة)`}
                </p>
              )}
            </div>
          </div>

          {/* Inventory Settings */}
          <div className={`${CARD} p-4 sm:p-6 space-y-4`}>
            <SectionTitle tone={TONE.products}>المخزون</SectionTitle>

            <Field label="حد المخزون المنخفض الافتراضي">
              <input
                type="number"
                min="1"
                value={settings.lowStockThreshold}
                onChange={(e) => updateSetting('lowStockThreshold', parseInt(e.target.value) || 5)}
                className={`${FIELD} sm:max-w-xs`}
              />
            </Field>
          </div>

          {/* General Settings */}
          <div className={`${CARD} p-4 sm:p-6 space-y-4`}>
            <SectionTitle tone={TONE.staff}>عام</SectionTitle>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="العملة">
                <input
                  type="text"
                  value={settings.currency}
                  onChange={(e) => updateSetting('currency', e.target.value)}
                  className={FIELD}
                />
              </Field>

              <Field label="المنطقة الزمنية">
                <input
                  type="text"
                  value={settings.timezone}
                  onChange={(e) => updateSetting('timezone', e.target.value)}
                  className={FIELD}
                />
              </Field>
            </div>
          </div>

          {/* Save Button */}
          <div className="space-y-3">
            {saveNotice && (
              <NoticeBanner kind={saveNotice.kind} text={saveNotice.text} onDismiss={() => setSaveNotice(null)} />
            )}
            <div className="flex justify-end">
              <Btn
                variant="primary"
                icon="check"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
              </Btn>
            </div>
          </div>
        </div>
      ) : (
        <div className={`${CARD} py-10 px-6 text-center`}>
          <EmptyState icon="settings" title="لا توجد إعدادات لهذا الفرع" />
        </div>
      )}

      {isOwner && (
        <div className={`${CARD} p-4 sm:p-6 space-y-4`}>
          <SectionTitle tone={TONE.revenue}>النسخة الاحتياطية</SectionTitle>

          <p className="text-sm text-gray-400 leading-relaxed">
            حمّل نسخة كاملة من كل بيانات النظام — العضويات والاشتراكات والحضور والمبيعات والمصروفات — واحفظها على جهازك.
            لو اتمسحت البيانات لا قدر الله، ارفع الملف ده ترجع كل حاجة.
          </p>

          {notice && (
            <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Btn
              variant="primary"
              icon="download"
              onClick={downloadBackup}
              disabled={downloading}
            >
              {downloading ? 'جاري التحضير...' : 'تحميل نسخة احتياطية'}
            </Btn>

            <Btn
              variant="danger"
              icon="refresh"
              onClick={() => fileInputRef.current?.click()}
              disabled={restoring}
            >
              استعادة من ملف
            </Btn>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={pickBackupFile}
              className="hidden"
            />
          </div>

          {pendingRestore && (
            <div className="p-4 bg-rose-500/5 border border-rose-500/30 rounded-xl space-y-1">
              <p className="text-white font-semibold">الملف المختار</p>
              <p className="text-sm text-gray-400 break-all" dir="ltr">{pendingRestore.fileName}</p>
              {pendingRestore.createdAt && (
                <p className="text-sm text-gray-500 mt-1">
                  تاريخ النسخة: {new Date(pendingRestore.createdAt).toLocaleString('ar-EG-u-nu-latn')}
                </p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
                {BACKUP_SUMMARY_ORDER.filter((key) => key in pendingRestore.counts).map((key) => (
                  <div key={key} className="px-3 py-2 bg-dark rounded-lg border border-dark-border">
                    <p className="text-xs text-gray-500">{BACKUP_LABELS[key]}</p>
                    <p className="text-white font-semibold">{pendingRestore.counts[key]}</p>
                  </div>
                ))}
              </div>

              <p className="text-sm text-rose-300 mt-4 leading-relaxed">
                تحذير: الاستعادة تمسح البيانات الحالية بالكامل وتستبدلها بما في الملف، ولا يمكن التراجع عنها.
                اكتب كلمة RESTORE في الخانة للتأكيد.
              </p>

              <input
                type="text"
                value={restoreConfirm}
                onChange={(e) => setRestoreConfirm(e.target.value)}
                placeholder="RESTORE"
                dir="ltr"
                className={`${FIELD} sm:w-64 mt-3`}
              />

              <div className="grid grid-cols-2 gap-3 mt-4">
                <Btn
                  variant="ghost"
                  onClick={cancelRestore}
                  disabled={restoring}
                  className="w-full"
                >
                  إلغاء
                </Btn>
                <Btn
                  variant="danger"
                  icon="refresh"
                  onClick={confirmRestore}
                  disabled={restoring || restoreConfirm.trim() !== 'RESTORE'}
                  className="w-full"
                >
                  {restoring ? 'جاري الاستعادة...' : 'استعادة البيانات'}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </Stagger>
  );
}
