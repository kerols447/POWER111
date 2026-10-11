import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { addPendingOperation } from '../utils/offlineDb';

interface Plan {
  id: string;
  branchId: string;
  name: string;
  nameAr: string;
  durationDays: number;
  pricePiasters: number;
  description?: string;
  descriptionAr?: string;
  isActive: boolean;
  branch: { id: string; name: string; code: string };
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function PlansSection() {
  const { user, isOwner } = useAuth();
  const isOnline = useOnlineStatus();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState({
    branchId: '',
    name: '',
    nameAr: '',
    durationDays: 30,
    pricePiasters: 0,
    description: '',
    descriptionAr: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;
  const canManagePlans = isOwner || user?.role === 'BRANCH_MANAGER';

  useEffect(() => {
    fetchPlans();
    fetchBranches();
  }, [branchFilter]);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (branchFilter) params.set('branchId', branchFilter);
      const res = await fetch(`/api/plans?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setPlans(data.data);
    } catch (err) {
      console.error('Error fetching plans:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      const data = await res.json();
      const branchList = Array.isArray(data) ? data : (data.branches || []);
      setBranches(branchList);
    } catch (err) {
      console.error('Error fetching branches:', err);
    }
  };

  const openCreateModal = () => {
    setEditingPlan(null);
    setFormData({ branchId: singleBranchUser && user?.branches?.[0] ? user.branches[0].id : '', name: '', nameAr: '', durationDays: 30, pricePiasters: 0, description: '', descriptionAr: '' });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({
      branchId: plan.branchId,
      name: plan.name,
      nameAr: plan.nameAr,
      durationDays: plan.durationDays,
      pricePiasters: plan.pricePiasters / 100,
      description: plan.description || '',
      descriptionAr: plan.descriptionAr || ''
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const body = {
      ...formData,
      pricePiasters: Math.round(formData.pricePiasters * 100)
    };

    const branchId = singleBranchUser && user?.branches?.[0] ? user.branches[0].id : formData.branchId;

    if (!isOnline) {
      try {
        if (editingPlan) {
          await addPendingOperation({
            id: generateOperationId(),
            type: 'EDIT_PLAN',
            payload: { planId: editingPlan.id, ...body },
            timestamp: Date.now(),
            branchId: editingPlan.branchId,
            userId: user!.id
          });
        } else {
          await addPendingOperation({
            id: generateOperationId(),
            type: 'NEW_PLAN',
            payload: body,
            timestamp: Date.now(),
            branchId,
            userId: user!.id
          });
        }
        setShowModal(false);
        alert('تم حفظ الخطة محلياً (سيتم التزامن عند عودة الاتصال)');
      } catch {
        setError('حدث خطأ في الحفظ المحلي');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const url = editingPlan ? `/api/plans/${editingPlan.id}` : '/api/plans';
      const method = editingPlan ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'حدث خطأ');
        return;
      }

      setShowModal(false);
      fetchPlans();
    } catch (err) {
      try {
        if (editingPlan) {
          await addPendingOperation({
            id: generateOperationId(),
            type: 'EDIT_PLAN',
            payload: { planId: editingPlan.id, ...body },
            timestamp: Date.now(),
            branchId: editingPlan.branchId,
            userId: user!.id
          });
        } else {
          await addPendingOperation({
            id: generateOperationId(),
            type: 'NEW_PLAN',
            payload: body,
            timestamp: Date.now(),
            branchId,
            userId: user!.id
          });
        }
        setShowModal(false);
        alert('تم حفظ الخطة محلياً (سيتم التزامن عند عودة الاتصال)');
      } catch {
        setError('حدث خطأ في الاتصال');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (plan: Plan) => {
    if (!isOnline) {
      await addPendingOperation({
        id: generateOperationId(),
        type: 'TOGGLE_PLAN',
        payload: { planId: plan.id, isActive: !plan.isActive },
        timestamp: Date.now(),
        branchId: plan.branchId,
        userId: user!.id
      });
      alert('تم حفظ التغيير محلياً (سيتم التزامن عند عودة الاتصال)');
      return;
    }
    try {
      await fetch(`/api/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !plan.isActive })
      });
      fetchPlans();
    } catch (err) {
      await addPendingOperation({
        id: generateOperationId(),
        type: 'TOGGLE_PLAN',
        payload: { planId: plan.id, isActive: !plan.isActive },
        timestamp: Date.now(),
        branchId: plan.branchId,
        userId: user!.id
      });
      alert('تم حفظ التغيير محلياً (سيتم التزامن عند عودة الاتصال)');
    }
  };

  const formatPrice = (piasters: number) => `${(piasters / 100).toLocaleString('ar-EG')} ج.م`;

  return (
    <div className="space-y-6">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-3 text-amber-400 text-sm">
          غير متصل بالإنترنت — جميع العمليات تُحفظ محلياً وتُزامَن تلقائياً عند عودة الاتصال
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">الخطط</h2>
          <p className="text-gray-400 mt-1">إدارة خطط الاشتراك</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
        >
          + إضافة خطة
        </button>
      </div>

      {!singleBranchUser && (
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
          >
            <option value="">كل الفروع</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">جاري التحميل...</div>
        ) : plans.length === 0 ? (
          <div className="p-8 text-center text-gray-400">لا توجد خطط</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark border-b border-dark-border">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الاسم</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">المدة</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">السعر</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الفرع</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الحالة</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {plans.map(plan => (
                  <tr key={plan.id} className="hover:bg-dark/50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-white">{plan.nameAr}</div>
                      <div className="text-xs text-gray-400">{plan.name}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{plan.durationDays} يوم</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{formatPrice(plan.pricePiasters)}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{plan.branch.code}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs border ${plan.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-gray-500/20 text-gray-400 border-gray-500/50'}`}>
                        {plan.isActive ? 'نشط' : 'معطل'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canManagePlans ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditModal(plan)}
                            className="px-2 py-1 text-xs bg-primary/20 text-primary border border-primary/50 rounded hover:bg-primary/30"
                          >
                            تعديل
                          </button>
                          <button
                            onClick={() => toggleActive(plan)}
                            className={`px-2 py-1 text-xs rounded border ${plan.isActive ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 hover:bg-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/30'}`}
                          >
                            {plan.isActive ? 'تعطيل' : 'تفعيل'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">{editingPlan ? 'تعديل الخطة' : 'إضافة خطة جديدة'}</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/50 rounded-lg text-rose-400 text-sm">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">الفرع *</label>
                  {singleBranchUser ? (
                    <div className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-gray-400">
                      {user?.branches?.[0]?.name}
                    </div>
                  ) : (
                    <select
                      required
                      value={formData.branchId}
                      onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                      className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                    >
                      <option value="">اختر الفرع</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">الاسم (إنجليزي) *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">الاسم (عربي) *</label>
                    <input
                      type="text"
                      required
                      value={formData.nameAr}
                      onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                      className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">المدة (أيام) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.durationDays}
                      onChange={(e) => setFormData({ ...formData, durationDays: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">السعر (ج.م) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.pricePiasters}
                      onChange={(e) => setFormData({ ...formData, pricePiasters: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">الوصف (عربي)</label>
                  <textarea
                    value={formData.descriptionAr}
                    onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 bg-dark border border-dark-border text-white rounded-lg hover:bg-dark/80">
                    إلغاء
                  </button>
                  <button type="submit" disabled={submitting} className={`flex-1 py-2 text-white rounded-lg disabled:opacity-50 ${!isOnline ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-primary hover:bg-primary-dark'}`}>
                    {submitting ? 'جاري الحفظ...' : !isOnline ? 'حفظ محلياً' : 'حفظ'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlansSection;
