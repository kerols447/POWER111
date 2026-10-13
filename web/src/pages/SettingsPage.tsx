import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import NoticeBanner from '../components/NoticeBanner';

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

// SVG Icons
const SettingsIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const TaxIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
  </svg>
);

const SnowflakeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const BoxIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SaveIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const BackupIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5-3 3m0 0l-3-3m3 3V9" />
  </svg>
);

const RestoreIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v8m0-8L8 8m4-4l4 4" />
  </svg>
);

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
      link.download = `نسخة-احتياطية-POWER111-${new Date().toISOString().slice(0, 10)}.json`;
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

  // Toggle Switch Component
  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) => (
    <label className="relative inline-flex items-center min-h-11 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="relative w-12 h-6 shrink-0 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-amber-500 peer-checked:to-amber-600 transition-colors duration-200"></div>
    </label>
  );

  // Section Card Component
  const SectionCard = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-6">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <SettingsIcon />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              الإعدادات
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">إعدادات فروع المنشأة</p>
          </div>
        </div>
      </div>

      {/* Branch Selector */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-5">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          اختر الفرع
        </label>
        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          className="w-full sm:w-auto px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200 min-w-[200px]"
        >
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-12 text-center">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
          <div className="inline-flex items-center gap-3 text-gray-400">
            <svg className="animate-spin w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>جاري التحميل...</span>
          </div>
        </div>
      ) : settings ? (
        <div className="space-y-6">
          {/* Tax Settings */}
          <SectionCard icon={<TaxIcon />} title="الضرائب">
            <div className="space-y-5">
              <div className="flex items-center justify-between p-4 bg-gray-900/30 rounded-xl border border-gray-700/30">
                <div>
                  <p className="text-white font-medium">تفعيل الضريبة</p>
                  <p className="text-sm text-gray-500 mt-0.5">تطبيق الضريبة على المبيعات</p>
                </div>
                <ToggleSwitch
                  checked={settings.taxEnabled}
                  onChange={(val) => updateSetting('taxEnabled', val)}
                />
              </div>

              {settings.taxEnabled && (
                <div className="p-4 bg-gray-900/30 rounded-xl border border-gray-700/30">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    نسبة الضريبة (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={settings.taxRatePercent / 100}
                    onChange={(e) => updateSetting('taxRatePercent', Math.round(parseFloat(e.target.value) * 100))}
                    className="w-full sm:w-48 px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                  />
                </div>
              )}
            </div>
          </SectionCard>

          {/* Freeze Settings */}
          <SectionCard icon={<SnowflakeIcon />} title="تجميد الاشتراكات">
            <div className="space-y-5">
              <div className="p-4 bg-gray-900/30 rounded-xl border border-gray-700/30">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  الحد الأقصى لأيام التجميد
                </label>
                <input
                  type="number"
                  min="0"
                  value={settings.maxFreezeDays}
                  onChange={(e) => updateSetting('maxFreezeDays', parseInt(e.target.value) || 0)}
                  className="w-full sm:w-48 px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-900/30 rounded-xl border border-gray-700/30">
                <div>
                  <p className="text-white font-medium">يتطلب موافقة المدير</p>
                  <p className="text-sm text-gray-500 mt-0.5">تجميد الاشتراك يحتاج موافقة من المدير</p>
                </div>
                <ToggleSwitch
                  checked={settings.freezeRequiresApproval}
                  onChange={(val) => updateSetting('freezeRequiresApproval', val)}
                />
              </div>
            </div>
          </SectionCard>

          {/* Attendance Settings */}
          <SectionCard icon={<ClockIcon />} title="الحضور">
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4 p-4 bg-gray-900/30 rounded-xl border border-gray-700/30">
                <div className="min-w-0">
                  <p className="text-white font-medium">الحضور في فرع آخر</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {settings.allowCrossBranchCheckin
                      ? 'مفتوح — العضو يقدر يسجل حضوره في الفرع ده حتى لو اشتراكه في فرع تاني، ويوصلك تنبيه.'
                      : 'مقفول — العضو يسجل حضوره في فرعه بس. افتحه لو عايز تسمح بالحضور من فرع تاني.'}
                  </p>
                </div>
                <ToggleSwitch
                  checked={settings.allowCrossBranchCheckin}
                  onChange={(val) => updateSetting('allowCrossBranchCheckin', val)}
                />
              </div>

              <div className="flex items-center justify-between gap-4 p-4 bg-gray-900/30 rounded-xl border border-gray-700/30">
                <div className="min-w-0">
                  <p className="text-white font-medium">الانصراف التلقائي</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {settings.autoCheckoutEnabled
                      ? 'شغال — العضو ينصرف تلقائيًا بعد المدة المحددة من تسجيل الحضور.'
                      : 'مقفول — العضو يفضل مسجل حضوره لحد ما تسجل انصرافه يدوي.'}
                  </p>
                </div>
                <ToggleSwitch
                  checked={settings.autoCheckoutEnabled}
                  onChange={(val) => updateSetting('autoCheckoutEnabled', val)}
                />
              </div>

              <div className={`p-4 bg-gray-900/30 rounded-xl border border-gray-700/30 ${settings.autoCheckoutEnabled ? '' : 'opacity-50'}`}>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  مدة الانصراف التلقائي (بالدقائق)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  disabled={!settings.autoCheckoutEnabled}
                  value={settings.autoCheckoutMinutes ?? 90}
                  onChange={(e) => updateSetting('autoCheckoutMinutes', Math.min(Math.max(parseInt(e.target.value) || 0, 0), 1440))}
                  className="w-full sm:w-48 px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200 disabled:cursor-not-allowed"
                />
                {settings.autoCheckoutEnabled && (
                  <p className="text-xs text-amber-400/70 mt-2">
                    {`هيتم انصراف العضو بعد ${settings.autoCheckoutMinutes ?? 90} دقيقة (${Math.floor((settings.autoCheckoutMinutes ?? 90) / 60)} ساعة و ${(settings.autoCheckoutMinutes ?? 90) % 60} دقيقة)`}
                  </p>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Inventory Settings */}
          <SectionCard icon={<BoxIcon />} title="المخزون">
            <div className="p-4 bg-gray-900/30 rounded-xl border border-gray-700/30">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                حد المخزون المنخفض الافتراضي
              </label>
              <input
                type="number"
                min="1"
                value={settings.lowStockThreshold}
                onChange={(e) => updateSetting('lowStockThreshold', parseInt(e.target.value) || 5)}
                className="w-full sm:w-48 px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
              />
            </div>
          </SectionCard>

          {/* General Settings */}
          <SectionCard icon={<GlobeIcon />} title="عام">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-900/30 rounded-xl border border-gray-700/30">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  العملة
                </label>
                <input
                  type="text"
                  value={settings.currency}
                  onChange={(e) => updateSetting('currency', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                />
              </div>

              <div className="p-4 bg-gray-900/30 rounded-xl border border-gray-700/30">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  المنطقة الزمنية
                </label>
                <input
                  type="text"
                  value={settings.timezone}
                  onChange={(e) => updateSetting('timezone', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                />
              </div>
            </div>
          </SectionCard>

          {/* Save Button */}
          <div className="space-y-3">
            {saveNotice && (
              <NoticeBanner kind={saveNotice.kind} text={saveNotice.text} onDismiss={() => setSaveNotice(null)} />
            )}
            <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {saving ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <SaveIcon />
                  <span>حفظ الإعدادات</span>
                </>
              )}
            </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-12 text-center">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-700/30 flex items-center justify-center">
            <SettingsIcon />
          </div>
          <p className="text-gray-400 text-lg font-medium">لا توجد إعدادات لهذا الفرع</p>
        </div>
      )}

      {isOwner && (
        <SectionCard icon={<BackupIcon />} title="النسخة الاحتياطية">
          <p className="text-sm text-gray-400 mb-5">
            حمّل نسخة كاملة من كل بيانات النظام — العضويات والاشتراكات والحضور والمبيعات والمصروفات — واحفظها على جهازك.
            لو اتمسحت البيانات لا قدر الله، ارفع الملف ده ترجع كل حاجة.
          </p>

          {notice && (
            <div className="mb-4">
              <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={downloadBackup}
              disabled={downloading}
              className="inline-flex items-center justify-center gap-2 min-h-11 px-5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>جاري التحضير...</span>
                </>
              ) : (
                <>
                  <BackupIcon />
                  <span>تحميل نسخة احتياطية</span>
                </>
              )}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={restoring}
              className="inline-flex items-center justify-center gap-2 min-h-11 px-5 bg-gray-900/50 border border-gray-700/50 text-gray-200 rounded-xl font-semibold transition-colors duration-200 hover:border-rose-500/50 hover:text-white disabled:opacity-50"
            >
              <RestoreIcon />
              <span>استعادة من ملف</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={pickBackupFile}
              className="hidden"
            />
          </div>

          {pendingRestore && (
            <div className="mt-5 p-4 bg-rose-500/5 border border-rose-500/30 rounded-xl">
              <p className="text-white font-medium">الملف المختار</p>
              <p className="text-sm text-gray-400 mt-1 break-all" dir="ltr">{pendingRestore.fileName}</p>
              {pendingRestore.createdAt && (
                <p className="text-sm text-gray-500 mt-1">
                  تاريخ النسخة: {new Date(pendingRestore.createdAt).toLocaleString('ar-EG')}
                </p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
                {BACKUP_SUMMARY_ORDER.filter((key) => key in pendingRestore.counts).map((key) => (
                  <div key={key} className="px-3 py-2 bg-gray-900/40 rounded-lg border border-gray-700/30">
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
                className="w-full sm:w-64 mt-3 px-4 py-3 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500/50 transition-all duration-200"
              />

              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  onClick={cancelRestore}
                  disabled={restoring}
                  className="min-h-11 px-4 bg-gray-900/50 border border-gray-700/50 text-gray-300 hover:text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  onClick={confirmRestore}
                  disabled={restoring || restoreConfirm.trim() !== 'RESTORE'}
                  className="inline-flex items-center justify-center gap-2 min-h-11 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                >
                  {restoring && (
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  <span>{restoring ? 'جاري الاستعادة...' : 'استعادة البيانات'}</span>
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
