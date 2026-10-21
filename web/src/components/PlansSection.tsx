import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { addPendingOperation } from '../utils/offlineDb';
import NoticeBanner from '../components/NoticeBanner';
import {
  Badge, Btn, CARD, EmptyState, FIELD, Field, ListCard, Loading, Modal,
  Picker, SectionTitle, TableShell, Td, Th, Row, UiIcon
} from '../components/ui';

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
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;
  const canManagePlans = isOwner || user?.role === 'BRANCH_MANAGER';

  useEffect(() => {
    fetchPlans();
    fetchBranches();
  }, [branchFilter]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

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
        setNotice({ kind: 'ok', text: 'تم حفظ الخطة محلياً (سيتم التزامن عند عودة الاتصال)' });
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
        setNotice({ kind: 'ok', text: 'تم حفظ الخطة محلياً (سيتم التزامن عند عودة الاتصال)' });
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
      setNotice({ kind: 'ok', text: 'تم حفظ التغيير محلياً (سيتم التزامن عند عودة الاتصال)' });
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
      setNotice({ kind: 'ok', text: 'تم حفظ التغيير محلياً (سيتم التزامن عند عودة الاتصال)' });
    }
  };

  const formatPrice = (piasters: number) => `${(piasters / 100).toLocaleString('ar-EG-u-nu-latn')} ج.م`;

  return (
    <div className="space-y-4 sm:space-y-6">
      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {!singleBranchUser && (
        <div className={`${CARD} p-4 sm:p-5`}>
          <Picker
            value={branchFilter}
            onChange={setBranchFilter}
            ariaLabel="تصفية بالفرع"
            className="w-full sm:min-w-[220px]"
            options={[
              { value: '', label: 'كل الفروع' },
              ...branches.map(b => ({ value: b.id, label: b.name }))
            ]}
          />
        </div>
      )}

      <div className={`${CARD} overflow-hidden`}>
        <div className="p-4 sm:p-5">
          <SectionTitle
            right={
              <Btn variant="primary" icon="plus" onClick={openCreateModal} className="w-full sm:w-auto">
                إضافة خطة
              </Btn>
            }
          >
            الخطط
          </SectionTitle>
          <p className="text-[12px] text-gray-500 mt-1.5">إدارة خطط الاشتراك</p>
        </div>

        {loading ? (
          <Loading />
        ) : plans.length === 0 ? (
          <EmptyState icon="subscriptions" title="لا توجد خطط" />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block">
              <TableShell
                minWidth="min-w-[640px]"
                head={
                  <>
                    <Th>الاسم</Th>
                    <Th>المدة</Th>
                    <Th>السعر</Th>
                    <Th>الفرع</Th>
                    <Th>الحالة</Th>
                    <Th>إجراءات</Th>
                  </>
                }
              >
                {plans.map(plan => (
                  <Row key={plan.id}>
                    <Td>
                      <div className="text-sm font-semibold text-white">{plan.nameAr}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{plan.name}</div>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-sm text-gray-300">
                        <UiIcon name="clock" className="w-3.5 h-3.5 text-gray-500" />
                        {plan.durationDays} يوم
                      </span>
                    </Td>
                    <Td className="text-sm font-semibold text-white">{formatPrice(plan.pricePiasters)}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-sm text-gray-300">
                        <UiIcon name="branches" className="w-3.5 h-3.5 text-gray-500" />
                        {plan.branch.code}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={plan.isActive ? 'green' : 'gray'}>
                        <span className={`w-1.5 h-1.5 rounded-full ${plan.isActive ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                        {plan.isActive ? 'نشط' : 'معطل'}
                      </Badge>
                    </Td>
                    <Td>
                      {canManagePlans ? (
                        <div className="flex gap-2">
                          <Btn size="sm" variant="ghost" icon="edit" onClick={() => openEditModal(plan)}>
                            تعديل
                          </Btn>
                          <Btn
                            size="sm"
                            variant={plan.isActive ? 'danger' : 'ghost'}
                            icon={plan.isActive ? 'close' : 'check'}
                            onClick={() => toggleActive(plan)}
                          >
                            {plan.isActive ? 'تعطيل' : 'تفعيل'}
                          </Btn>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </Td>
                  </Row>
                ))}
              </TableShell>
            </div>

            {/* Mobile Cards */}
            <div className="sm:hidden p-3 space-y-3">
              {plans.map(plan => (
                <ListCard key={plan.id}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{plan.nameAr}</div>
                      <div className="text-xs text-gray-500 truncate">{plan.name}</div>
                    </div>
                    <Badge tone={plan.isActive ? 'green' : 'gray'}>
                      <span className={`w-1.5 h-1.5 rounded-full ${plan.isActive ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                      {plan.isActive ? 'نشط' : 'معطل'}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-gray-400">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-dark border border-dark-border rounded-lg">
                      <UiIcon name="clock" className="w-3 h-3" />
                      {plan.durationDays} يوم
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-dark border border-dark-border rounded-lg">
                      <UiIcon name="branches" className="w-3 h-3" />
                      {plan.branch.code}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-dark border border-dark-border rounded-lg text-primary font-semibold">
                      {formatPrice(plan.pricePiasters)}
                    </span>
                  </div>

                  {canManagePlans && (
                    <div className="grid grid-cols-2 gap-2">
                      <Btn variant="ghost" icon="edit" onClick={() => openEditModal(plan)}>
                        تعديل
                      </Btn>
                      <Btn
                        variant={plan.isActive ? 'danger' : 'ghost'}
                        icon={plan.isActive ? 'close' : 'check'}
                        onClick={() => toggleActive(plan)}
                      >
                        {plan.isActive ? 'تعطيل' : 'تفعيل'}
                      </Btn>
                    </div>
                  )}
                </ListCard>
              ))}
            </div>
          </>
        )}
      </div>

      {showModal && (
        <Modal
          open
          title={editingPlan ? 'تعديل الخطة' : 'إضافة خطة جديدة'}
          onClose={() => setShowModal(false)}
          width="max-w-lg"
          footer={
            <>
              <Btn type="button" variant="ghost" onClick={() => setShowModal(false)}>
                إلغاء
              </Btn>
              <Btn
                type="submit"
                form="plan-form"
                variant="primary"
                disabled={submitting}
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    جاري الحفظ...
                  </span>
                ) : !isOnline ? 'حفظ محلياً' : 'حفظ'}
              </Btn>
            </>
          }
        >
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center gap-2">
              <UiIcon name="warning" className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form id="plan-form" onSubmit={handleSubmit} className="space-y-4">
            <Field label="الفرع" required>
              {singleBranchUser ? (
                <div className="px-4 py-2.5 min-h-[44px] flex items-center bg-dark border border-dark-border rounded-xl text-gray-400 text-sm">
                  {user?.branches?.[0]?.name}
                </div>
              ) : (
                <select
                  required
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  aria-label="اختر الفرع"
                  className={FIELD}
                >
                  <option value="">اختر الفرع</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <Field label="الاسم (إنجليزي)" required>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={FIELD}
                />
              </Field>
              <Field label="الاسم (عربي)" required>
                <input
                  type="text"
                  required
                  value={formData.nameAr}
                  onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                  className={FIELD}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <Field label="المدة (أيام)" required>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.durationDays}
                  onChange={(e) => setFormData({ ...formData, durationDays: parseInt(e.target.value) })}
                  className={FIELD}
                />
              </Field>
              <Field label="السعر (ج.م)" required>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.pricePiasters}
                  onChange={(e) => setFormData({ ...formData, pricePiasters: parseFloat(e.target.value) })}
                  className={FIELD}
                />
              </Field>
            </div>

            <Field label="الوصف (عربي)">
              <textarea
                value={formData.descriptionAr}
                onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                rows={2}
                className={`${FIELD} resize-none`}
              />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default PlansSection;
