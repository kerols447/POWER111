import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import NoticeBanner from '../components/NoticeBanner';
import {
  PageHeader, StatTile, Badge, Btn, Modal, Toggle, TableShell, Th, Td, Row,
  ListCard, EmptyState, Loading, UiIcon, CARD, FIELD, LABEL, TONE, GOLD
} from '../components/ui';
import { Stagger } from '../components/Motion';

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Offer {
  id: string;
  branchId: string | null;
  title: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  imagePath?: string;
  discountPercent?: number;
  startDate: string;
  endDate: string;
  isPublished: boolean;
  branch?: Branch;
}

function OffersPage() {
  const { user, isOwner } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    titleAr: '',
    description: '',
    descriptionAr: '',
    branchId: '',
    discountPercent: '',
    startDate: '',
    endDate: '',
    isPublished: false
  });
  const [pendingDelete, setPendingDelete] = useState<Offer | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    fetchBranches();
    fetchOffers();
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
    }
  };

  const fetchOffers = async () => {
    try {
      const res = await fetch('/api/offers', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOffers(data);
      }
    } catch (error) {
      console.error('Error fetching offers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      title: formData.title,
      titleAr: formData.titleAr || null,
      description: formData.description || null,
      descriptionAr: formData.descriptionAr || null,
      branchId: formData.branchId || null,
      discountPercent: formData.discountPercent ? parseInt(formData.discountPercent) : null,
      startDate: formData.startDate,
      endDate: formData.endDate,
      isPublished: formData.isPublished
    };

    try {
      const url = editingOffer ? `/api/offers/${editingOffer.id}` : '/api/offers';
      const method = editingOffer ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowModal(false);
        setEditingOffer(null);
        resetForm();
        fetchOffers();
      } else {
        const data = await res.json();
        setNotice({ kind: 'err', text: data.error || 'حدث خطأ' });
      }
    } catch (error) {
      console.error('Error saving offer:', error);
      setNotice({ kind: 'err', text: 'حدث خطأ في حفظ البيانات' });
    }
  };

  const handleEdit = (offer: Offer) => {
    setEditingOffer(offer);
    setFormData({
      title: offer.title,
      titleAr: offer.titleAr || '',
      description: offer.description || '',
      descriptionAr: offer.descriptionAr || '',
      branchId: offer.branchId || '',
      discountPercent: offer.discountPercent?.toString() || '',
      startDate: offer.startDate.split('T')[0],
      endDate: offer.endDate.split('T')[0],
      isPublished: offer.isPublished
    });
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const offer = pendingDelete;
    setPendingDelete(null);

    try {
      const res = await fetch(`/api/offers/${offer.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        fetchOffers();
      } else {
        const data = await res.json();
        setNotice({ kind: 'err', text: data.error || 'حدث خطأ' });
      }
    } catch (error) {
      console.error('Error deleting offer:', error);
      setNotice({ kind: 'err', text: 'حدث خطأ في حذف العرض' });
    }
  };

  const handleTogglePublished = async (offer: Offer) => {
    try {
      const res = await fetch(`/api/offers/${offer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isPublished: !offer.isPublished })
      });

      if (res.ok) {
        fetchOffers();
      }
    } catch (error) {
      console.error('Error toggling offer:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      titleAr: '',
      description: '',
      descriptionAr: '',
      branchId: '',
      discountPercent: '',
      startDate: '',
      endDate: '',
      isPublished: false
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG-u-nu-latn', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const activeOffers = offers.filter(o => {
    const now = new Date();
    return new Date(o.startDate) <= now && new Date(o.endDate) >= now && o.isPublished;
  }).length;

  const closeAndReset = () => {
    setShowModal(false);
    setEditingOffer(null);
    resetForm();
  };

  const statusPill = (offer: Offer, isActive: boolean) => ({
    tone: offer.isPublished ? (isActive ? 'green' : 'gold') : 'gray',
    label: offer.isPublished ? (isActive ? 'نشط' : 'منتهي') : 'مسودة',
    dot: offer.isPublished ? (isActive ? 'bg-emerald-400' : 'bg-primary') : 'bg-gray-500'
  } as const);

  if (loading) {
    return <Loading />;
  }

  return (
    <Stagger className="space-y-5 sm:space-y-7" dir="rtl">
      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {/* Header */}
      <PageHeader
        icon="offers"
        title="إدارة العروض"
        caption="إدارة العروض والخصومات"
        actions={
          <Btn
            icon="plus"
            variant="primary"
            onClick={() => {
              setEditingOffer(null);
              resetForm();
              setShowModal(true);
            }}
          >
            إضافة عرض جديد
          </Btn>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          icon="offers"
          tone={GOLD}
          label="إجمالي العروض"
          value={offers.length}
        />
        <StatTile
          icon="check"
          tone={TONE.revenue}
          label="المنشورة"
          value={offers.filter(o => o.isPublished).length}
        />
        <StatTile
          icon="bolt"
          tone={TONE.expiring}
          label="النشطة حالياً"
          value={activeOffers}
        />
      </div>

      {/* Offers */}
      <div className={`${CARD} overflow-hidden`}>
        {offers.length === 0 ? (
          <EmptyState icon="offers" title="لا توجد عروض حالياً" hint="قم بإضافة عرض جديد للبدء" />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block">
              <TableShell
                minWidth="min-w-[700px]"
                head={
                  <>
                    <Th>العنوان</Th>
                    <Th className="hidden md:table-cell">الفرع</Th>
                    <Th>الخصم</Th>
                    <Th className="hidden lg:table-cell">البداية</Th>
                    <Th className="hidden lg:table-cell">النهاية</Th>
                    <Th>الحالة</Th>
                    <Th>إجراءات</Th>
                  </>
                }
              >
                {offers.map((offer) => {
                  const now = new Date();
                  const isActive = new Date(offer.startDate) <= now && new Date(offer.endDate) >= now;
                  const pill = statusPill(offer, isActive);
                  return (
                    <Row key={offer.id}>
                      <Td>
                        <div className="text-sm font-semibold text-white">{offer.titleAr || offer.title}</div>
                        {offer.descriptionAr && (
                          <div className="text-xs text-gray-400 mt-1 line-clamp-1">{offer.descriptionAr}</div>
                        )}
                      </Td>
                      <Td className="hidden md:table-cell">
                        <span className="text-sm text-gray-300">
                          {offer.branchId
                            ? branches.find(b => b.id === offer.branchId)?.name || '—'
                            : 'جميع الفروع'}
                        </span>
                      </Td>
                      <Td>
                        {offer.discountPercent ? (
                          <Badge tone="gold">{offer.discountPercent}%</Badge>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </Td>
                      <Td className="hidden lg:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-sm text-gray-400">
                          <UiIcon name="calendar" className="w-4 h-4 text-gray-500" />
                          {formatDate(offer.startDate)}
                        </span>
                      </Td>
                      <Td className="hidden lg:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-sm text-gray-400">
                          <UiIcon name="calendar" className="w-4 h-4 text-gray-500" />
                          {formatDate(offer.endDate)}
                        </span>
                      </Td>
                      <Td>
                        <button
                          type="button"
                          onClick={() => handleTogglePublished(offer)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] sm:min-h-[36px] rounded-lg text-xs font-semibold border transition-colors ${
                            offer.isPublished
                              ? isActive
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
                              : 'bg-white/5 text-gray-400 border-dark-border/30 hover:bg-white/10'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`} />
                          {pill.label}
                        </button>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(offer)}
                            className="inline-flex items-center gap-1.5 px-2.5 xl:px-3 min-h-[44px] sm:min-h-[36px] bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-lg border border-primary/20 hover:border-primary/40 transition-colors"
                          >
                            <UiIcon name="edit" className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">تعديل</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(offer)}
                            className="inline-flex items-center gap-1.5 px-2.5 xl:px-3 min-h-[44px] sm:min-h-[36px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg border border-rose-500/20 hover:border-rose-500/40 transition-colors"
                          >
                            <UiIcon name="trash" className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">حذف</span>
                          </button>
                        </div>
                      </Td>
                    </Row>
                  );
                })}
              </TableShell>
            </div>

            {/* Phone: one card per offer, no sideways scrolling */}
            <div className="sm:hidden p-3 space-y-3">
              {offers.map((offer) => {
                const now = new Date();
                const isActive = new Date(offer.startDate) <= now && new Date(offer.endDate) >= now;
                const pill = statusPill(offer, isActive);
                return (
                  <ListCard key={offer.id}>
                    <button
                      type="button"
                      onClick={() => handleEdit(offer)}
                      className="w-full flex items-start justify-between gap-3 text-right"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white break-words">{offer.titleAr || offer.title}</p>
                        {offer.descriptionAr && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{offer.descriptionAr}</p>
                        )}
                        <div className="mt-1.5 flex items-center gap-2">
                          <Badge tone={pill.tone}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`} />
                            {pill.label}
                          </Badge>
                          {offer.discountPercent ? (
                            <Badge tone="gold">{offer.discountPercent}%</Badge>
                          ) : (
                            <span className="text-[11px] text-gray-600">—</span>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="mt-3 space-y-1.5 text-xs text-gray-400">
                      <div className="flex items-center gap-1.5">
                        <UiIcon name="calendar" className="w-4 h-4 text-gray-500 shrink-0" />
                        <span>{formatDate(offer.startDate)} — {formatDate(offer.endDate)}</span>
                      </div>
                      <div className="text-gray-500">
                        {offer.branchId ? branches.find(b => b.id === offer.branchId)?.name || '—' : 'جميع الفروع'}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-dark-border/30 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTogglePublished(offer)}
                        className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-semibold border transition-colors ${
                          offer.isPublished
                            ? isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 active:bg-emerald-500/20'
                              : 'bg-primary/10 text-primary border-primary/20 active:bg-primary/20'
                            : 'bg-white/5 text-gray-400 border-dark-border/30 active:bg-white/10'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`} />
                        {pill.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(offer)}
                        className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-lg bg-primary/10 text-primary text-xs font-semibold border border-primary/20"
                      >
                        <UiIcon name="edit" className="w-3.5 h-3.5" />
                        تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(offer)}
                        className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-lg bg-rose-500/10 text-rose-400 text-xs font-semibold border border-rose-500/20"
                      >
                        <UiIcon name="trash" className="w-3.5 h-3.5" />
                        حذف
                      </button>
                    </div>
                  </ListCard>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Offer Modal */}
      <Modal
        open={showModal}
        onClose={closeAndReset}
        title={editingOffer ? 'تعديل عرض' : 'إضافة عرض جديد'}
        width="max-w-2xl"
        footer={
          <>
            <Btn type="submit" form="offer-form" variant="primary">
              {editingOffer ? 'حفظ التعديلات' : 'إضافة العرض'}
            </Btn>
            <Btn type="button" variant="ghost" onClick={closeAndReset}>
              إلغاء
            </Btn>
          </>
        }
      >
        <form id="offer-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>العنوان (إنجليزي) *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className={FIELD}
                placeholder="Summer Sale"
                dir="ltr"
              />
            </div>

            <div>
              <label className={LABEL}>العنوان (عربي)</label>
              <input
                type="text"
                value={formData.titleAr}
                onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
                className={FIELD}
                placeholder="تخفيضات الصيف"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>الوصف (إنجليزي)</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className={`${FIELD} resize-none`}
                rows={3}
                placeholder="Description..."
                dir="ltr"
              />
            </div>

            <div>
              <label className={LABEL}>الوصف (عربي)</label>
              <textarea
                value={formData.descriptionAr}
                onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                className={FIELD}
                rows={3}
                placeholder="الوصف..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>الفرع</label>
              <select
                value={formData.branchId}
                onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                className={FIELD}
              >
                <option value="">جميع الفروع</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL}>نسبة الخصم (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.discountPercent}
                onChange={(e) => setFormData({ ...formData, discountPercent: e.target.value })}
                className={FIELD}
                placeholder="20"
              />
            </div>
          </div>

          <Toggle
            label="نشر العرض"
            checked={formData.isPublished}
            onChange={(v) => setFormData({ ...formData, isPublished: v })}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>تاريخ البداية *</label>
              <input
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className={FIELD}
              />
            </div>

            <div>
              <label className={LABEL}>تاريخ النهاية *</label>
              <input
                type="date"
                required
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className={FIELD}
              />
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف"
        description={pendingDelete ? `هل أنت متأكد من حذف العرض "${pendingDelete.title}"؟` : ''}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Stagger>
  );
}

export default OffersPage;
