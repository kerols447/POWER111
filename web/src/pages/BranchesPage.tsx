import { useState, useEffect } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import NoticeBanner from '../components/NoticeBanner';
import {
  PageHeader, StatTile, Badge, Btn, Modal, TableShell, Th, Td, Row,
  ListCard, Loading, UiIcon, CARD, FIELD, LABEL, TONE
} from '../components/ui';

interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  locationUrl?: string;
  phone?: string;
  whatsapp?: string;
  image?: string;
  isActive: boolean;
  _count: {
    members: number;
    products: number;
    branchAccess: number;
  };
}

function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    locationUrl: '',
    phone: '',
    whatsapp: ''
  });
  const [pendingDelete, setPendingDelete] = useState<Branch | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBranches(data);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingBranch ? `/api/branches/${editingBranch.id}` : '/api/branches';
      const method = editingBranch ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setShowModal(false);
        setEditingBranch(null);
        setFormData({ name: '', code: '', address: '', locationUrl: '', phone: '', whatsapp: '' });
        fetchBranches();
      } else {
        const data = await res.json();
        setNotice({ kind: 'err', text: data.error || 'حدث خطأ' });
      }
    } catch (error) {
      console.error('Error saving branch:', error);
      setNotice({ kind: 'err', text: 'حدث خطأ في حفظ البيانات' });
    }
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      code: branch.code,
      address: branch.address || '',
      locationUrl: branch.locationUrl || '',
      phone: branch.phone || '',
      whatsapp: branch.whatsapp || ''
    });
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const branch = pendingDelete;
    setPendingDelete(null);

    try {
      const res = await fetch(`/api/branches/${branch.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        fetchBranches();
      } else {
        const data = await res.json();
        setNotice({ kind: 'err', text: data.error || data.message || 'حدث خطأ' });
      }
    } catch (error) {
      console.error('Error deleting branch:', error);
      setNotice({ kind: 'err', text: 'حدث خطأ في حذف الفرع' });
    }
  };

  const handleToggleActive = async (branch: Branch) => {
    try {
      const res = await fetch(`/api/branches/${branch.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !branch.isActive })
      });

      if (res.ok) {
        fetchBranches();
      }
    } catch (error) {
      console.error('Error toggling branch:', error);
    }
  };

  const closeAndReset = () => {
    setShowModal(false);
    setEditingBranch(null);
    setFormData({ name: '', code: '', address: '', locationUrl: '', phone: '', whatsapp: '' });
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="space-y-5 sm:space-y-7" dir="rtl">
      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {/* Header */}
      <PageHeader
        icon="branches"
        title="إدارة الفروع"
        caption="إدارة فروع المنشأة"
        actions={
          <Btn
            icon="plus"
            variant="primary"
            onClick={() => {
              setEditingBranch(null);
              setFormData({ name: '', code: '', address: '', locationUrl: '', phone: '', whatsapp: '' });
              setShowModal(true);
            }}
          >
            إضافة فرع جديد
          </Btn>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          icon="branches"
          tone={TONE.members}
          label="إجمالي الفروع"
          value={branches.length}
        />
        <StatTile
          icon="check"
          tone={TONE.revenue}
          label="الفروع النشطة"
          value={branches.filter(b => b.isActive).length}
        />
        <StatTile
          icon="users"
          tone={TONE.members}
          label="إجمالي الأعضاء"
          value={branches.reduce((sum, b) => sum + b._count.members, 0)}
        />
        <StatTile
          icon="products"
          tone={TONE.products}
          label="إجمالي المنتجات"
          value={branches.reduce((sum, b) => sum + b._count.products, 0)}
        />
      </div>

      {/* Branches */}
      <div className={`${CARD} overflow-hidden`}>
        {/* Desktop Table */}
        <div className="hidden sm:block">
          <TableShell
            minWidth="min-w-[700px]"
            head={
              <>
                <Th>الكود</Th>
                <Th>الاسم</Th>
                <Th className="hidden lg:table-cell">العنوان</Th>
                <Th className="hidden md:table-cell">الهاتف</Th>
                <Th>الأعضاء</Th>
                <Th>الحالة</Th>
                <Th>إجراءات</Th>
              </>
            }
          >
            {branches.map((branch) => (
              <Row key={branch.id}>
                <Td>
                  <span className="inline-flex px-2.5 py-1 text-xs font-mono font-semibold text-primary bg-primary/10 rounded-lg border border-primary/20">
                    {branch.code}
                  </span>
                </Td>
                <Td>
                  <span className="text-sm font-semibold text-white">{branch.name}</span>
                </Td>
                <Td className="hidden lg:table-cell">
                  <span className="text-sm text-gray-400">{branch.address || '—'}</span>
                </Td>
                <Td className="hidden md:table-cell">
                  {branch.phone ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-300 font-mono">
                      <UiIcon name="phone" className="w-4 h-4 text-gray-500" />
                      {branch.phone}
                    </span>
                  ) : '—'}
                </Td>
                <Td>
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary text-sm font-bold">
                    {branch._count.members}
                  </span>
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(branch)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] sm:min-h-[36px] rounded-lg text-xs font-semibold border transition-colors ${
                      branch.isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${branch.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    {branch.isActive ? 'نشط' : 'معطل'}
                  </button>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(branch)}
                      className="inline-flex items-center gap-1.5 px-2.5 xl:px-3 min-h-[44px] sm:min-h-[36px] bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-lg border border-primary/20 hover:border-primary/40 transition-colors"
                    >
                      <UiIcon name="edit" className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(branch)}
                      disabled={branch._count.members > 0 || branch._count.products > 0}
                      className="inline-flex items-center gap-1.5 px-2.5 xl:px-3 min-h-[44px] sm:min-h-[36px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg border border-rose-500/20 hover:border-rose-500/40 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <UiIcon name="trash" className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">حذف</span>
                    </button>
                  </div>
                </Td>
              </Row>
            ))}
          </TableShell>
        </div>

        {/* Phone: one card per branch, no sideways scrolling */}
        <div className="sm:hidden p-3 space-y-3">
          {branches.map((branch) => (
            <ListCard key={branch.id}>
              <button
                type="button"
                onClick={() => handleEdit(branch)}
                className="w-full flex items-start justify-between gap-3 text-right"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{branch.name}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex px-2 py-0.5 text-xs font-mono font-semibold text-primary bg-primary/10 rounded-lg border border-primary/20">
                      {branch.code}
                    </span>
                    <Badge tone={branch.isActive ? 'green' : 'red'}>
                      <span className={`w-1.5 h-1.5 rounded-full ${branch.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      {branch.isActive ? 'نشط' : 'معطل'}
                    </Badge>
                  </div>
                </div>
                <div className="shrink-0 text-center">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary text-sm font-bold">
                    {branch._count.members}
                  </span>
                  <p className="text-[11px] text-gray-500 mt-1">عضو</p>
                </div>
              </button>

              {(branch.address || branch.phone) && (
                <div className="mt-3 space-y-1.5 text-xs text-gray-400">
                  {branch.address && (
                    <p className="leading-relaxed">{branch.address}</p>
                  )}
                  {branch.phone && (
                    <div className="flex items-center gap-1.5 font-mono">
                      <UiIcon name="phone" className="w-4 h-4 text-gray-500 shrink-0" />
                      <span>{branch.phone}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-dark-border/30 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleActive(branch)}
                  className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-semibold border transition-colors ${
                    branch.isActive
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 active:bg-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 active:bg-emerald-500/20'
                  }`}
                >
                  {branch.isActive ? 'تعطيل' : 'تفعيل'}
                </button>
                <button
                  type="button"
                  onClick={() => handleEdit(branch)}
                  className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-lg bg-primary/10 text-primary text-xs font-semibold border border-primary/20"
                >
                  <UiIcon name="edit" className="w-3.5 h-3.5" />
                  تعديل
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(branch)}
                  disabled={branch._count.members > 0 || branch._count.products > 0}
                  className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-lg bg-rose-500/10 text-rose-400 text-xs font-semibold border border-rose-500/20 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <UiIcon name="trash" className="w-3.5 h-3.5" />
                  حذف
                </button>
              </div>
            </ListCard>
          ))}
        </div>
      </div>

      {/* Add/Edit Branch Modal */}
      <Modal
        open={showModal}
        onClose={closeAndReset}
        title={editingBranch ? 'تعديل فرع' : 'إضافة فرع جديد'}
        width="max-w-md"
        footer={
          <>
            <Btn type="submit" form="branch-form" variant="primary">
              {editingBranch ? 'حفظ التعديلات' : 'إضافة الفرع'}
            </Btn>
            <Btn type="button" variant="ghost" onClick={closeAndReset}>
              إلغاء
            </Btn>
          </>
        }
      >
        <form id="branch-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={LABEL}>اسم الفرع *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={FIELD}
              placeholder="POWER 111 — فرع جديد"
            />
          </div>

          <div>
            <label className={LABEL}>كود الفرع *</label>
            <input
              type="text"
              required
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className={`${FIELD} font-mono`}
              placeholder="BR05"
            />
          </div>

          <div>
            <label className={LABEL}>العنوان</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className={FIELD}
              placeholder="العنوان بالتفصيل"
            />
          </div>

          <div>
            <label className={LABEL}>رابط الموقع (Google Maps)</label>
            <input
              type="url"
              value={formData.locationUrl}
              onChange={(e) => setFormData({ ...formData, locationUrl: e.target.value })}
              className={FIELD}
              placeholder="https://maps.google.com/..."
              dir="ltr"
            />
          </div>

          <div>
            <label className={LABEL}>رقم الهاتف</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className={`${FIELD} font-mono`}
              placeholder="01234567890"
            />
          </div>

          <div>
            <label className={LABEL}>رقم الواتساب</label>
            <input
              type="tel"
              value={formData.whatsapp}
              onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
              className={`${FIELD} font-mono`}
              placeholder="01234567890"
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف"
        description={pendingDelete ? `هل أنت متأكد من حذف فرع "${pendingDelete.name}"؟` : ''}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default BranchesPage;
