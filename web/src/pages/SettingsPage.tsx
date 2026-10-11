import { useState, useEffect } from 'react';

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
  lowStockThreshold: number;
  autoCheckoutMinutes: number;
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

export default function SettingsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/${selectedBranch}`, { credentials: 'include' });
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
        alert('تم حفظ الإعدادات بنجاح');
      } else {
        alert(data.error || 'حدث خطأ');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('فشل في حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof BranchSettings, value: any) => {
    if (settings) {
      setSettings({ ...settings, [key]: value });
    }
  };

  // Toggle Switch Component
  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) => (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-12 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-amber-500 peer-checked:to-amber-600 transition-colors duration-200"></div>
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
              <div className="flex items-center justify-between p-4 bg-gray-900/30 rounded-xl border border-gray-700/30">
                <div>
                  <p className="text-white font-medium">السماح بالحضور في فروع أخرى</p>
                  <p className="text-sm text-gray-500 mt-0.5">تسجيل الحضور من أي فرع</p>
                </div>
                <ToggleSwitch
                  checked={settings.allowCrossBranchCheckin}
                  onChange={(val) => updateSetting('allowCrossBranchCheckin', val)}
                />
              </div>

              <div className="p-4 bg-gray-900/30 rounded-xl border border-gray-700/30">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  الانصراف التلقائي (بالدقائق)
                </label>
                <p className="text-xs text-gray-500 mb-3">يتم انصراف العضو تلقائيًا بعد المدة المحددة. اجعلها 0 لإيقاف الميزة.</p>
                <input
                  type="number"
                  min="0"
                  max="600"
                  value={settings.autoCheckoutMinutes ?? 120}
                  onChange={(e) => updateSetting('autoCheckoutMinutes', parseInt(e.target.value) || 0)}
                  className="w-full sm:w-48 px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                />
                {(settings.autoCheckoutMinutes ?? 120) > 0 && (
                  <p className="text-xs text-amber-400/70 mt-2">
                    ⏱ سيتم انصراف الأعضاء تلقائيًا بعد {(settings.autoCheckoutMinutes ?? 120)} دقيقة ({Math.floor((settings.autoCheckoutMinutes ?? 120) / 60)} ساعة و {(settings.autoCheckoutMinutes ?? 120) % 60} دقيقة)
                  </p>
                )}
                {(settings.autoCheckoutMinutes ?? 120) === 0 && (
                  <p className="text-xs text-gray-500 mt-2">الميزة معطلة</p>
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
      ) : (
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-12 text-center">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-700/30 flex items-center justify-center">
            <SettingsIcon />
          </div>
          <p className="text-gray-400 text-lg font-medium">لا توجد إعدادات لهذا الفرع</p>
        </div>
      )}
    </div>
  );
}
