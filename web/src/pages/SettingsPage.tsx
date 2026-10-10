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
  currency: string;
  timezone: string;
}

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

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">الإعدادات</h1>
      </div>

      {/* Branch Selector */}
      <div className="bg-gray-800 rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          الفرع
        </label>
        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
          جاري التحميل...
        </div>
      ) : settings ? (
        <div className="space-y-6">
          {/* Tax Settings */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">الضرائب</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-gray-300">تفعيل الضريبة</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.taxEnabled}
                    onChange={(e) => updateSetting('taxEnabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {settings.taxEnabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    نسبة الضريبة (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={settings.taxRatePercent / 100}
                    onChange={(e) => updateSetting('taxRatePercent', Math.round(parseFloat(e.target.value) * 100))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Freeze Settings */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">تجميد الاشتراكات</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  الحد الأقصى لأيام التجميد
                </label>
                <input
                  type="number"
                  min="0"
                  value={settings.maxFreezeDays}
                  onChange={(e) => updateSetting('maxFreezeDays', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-gray-300">يتطلب التجميد موافقة المدير</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.freezeRequiresApproval}
                    onChange={(e) => updateSetting('freezeRequiresApproval', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Attendance Settings */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">الحضور</h3>
            <div className="flex items-center justify-between">
              <label className="text-gray-300">السماح بالحضور في فروع أخرى</label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowCrossBranchCheckin}
                  onChange={(e) => updateSetting('allowCrossBranchCheckin', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* Inventory Settings */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">المخزون</h3>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                حد المخزون المنخفض الافتراضي
              </label>
              <input
                type="number"
                min="1"
                value={settings.lowStockThreshold}
                onChange={(e) => updateSetting('lowStockThreshold', parseInt(e.target.value) || 5)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* General Settings */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">عام</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  العملة
                </label>
                <input
                  type="text"
                  value={settings.currency}
                  onChange={(e) => updateSetting('currency', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  المنطقة الزمنية
                </label>
                <input
                  type="text"
                  value={settings.timezone}
                  onChange={(e) => updateSetting('timezone', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
          لا توجد إعدادات لهذا الفرع
        </div>
      )}
    </div>
  );
}
