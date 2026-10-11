import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

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

// SVG Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const TagIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const FireIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const PercentIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

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
        alert(data.error || 'حدث خطأ');
      }
    } catch (error) {
      console.error('Error saving offer:', error);
      alert('حدث خطأ في حفظ البيانات');
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

  const handleDelete = async (offer: Offer) => {
    if (!confirm(`هل أنت متأكد من حذف العرض "${offer.title}"؟`)) {
      return;
    }

    try {
      const res = await fetch(`/api/offers/${offer.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        fetchOffers();
      } else {
        const data = await res.json();
        alert(data.error || 'حدث خطأ');
      }
    } catch (error) {
      console.error('Error deleting offer:', error);
      alert('حدث خطأ في حذف العرض');
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
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const activeOffers = offers.filter(o => {
    const now = new Date();
    return new Date(o.startDate) <= now && new Date(o.endDate) >= now && o.isPublished;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>جاري التحميل...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <TagIcon />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              إدارة العروض
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">إدارة العروض والخصومات</p>
          </div>
        </div>
        <button
          onClick={() => {
            setEditingOffer(null);
            resetForm();
            setShowModal(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 transform hover:-translate-y-0.5"
        >
          <PlusIcon />
          <span>إضافة عرض جديد</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.06),transparent_50%)]"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <TagIcon />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">إجمالي العروض</span>
            </div>
            <p className="text-2xl font-bold text-white">{offers.length}</p>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.06),transparent_50%)]"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <SparklesIcon />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">المنشورة</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{offers.filter(o => o.isPublished).length}</p>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.06),transparent_50%)]"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <FireIcon />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">النشطة حالياً</span>
            </div>
            <p className="text-2xl font-bold text-amber-400">{activeOffers}</p>
          </div>
        </div>
      </div>

      {/* Offers Table */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-700/50">
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">العنوان</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">الفرع</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الخصم</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">البداية</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">النهاية</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الحالة</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/30">
              {offers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-700/30 flex items-center justify-center">
                      <TagIcon />
                    </div>
                    <p className="text-gray-400 text-lg font-medium">لا توجد عروض حالياً</p>
                    <p className="text-gray-500 text-sm mt-1">قم بإضافة عرض جديد للبدء</p>
                  </td>
                </tr>
              ) : (
                offers.map((offer) => {
                  const now = new Date();
                  const isActive = new Date(offer.startDate) <= now && new Date(offer.endDate) >= now;
                  return (
                    <tr key={offer.id} className="hover:bg-amber-500/5 transition-colors duration-200">
                      <td className="px-4 sm:px-6 py-4">
                        <div className="text-white font-medium">{offer.titleAr || offer.title}</div>
                        {offer.descriptionAr && (
                          <div className="text-sm text-gray-400 mt-1 line-clamp-1">{offer.descriptionAr}</div>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-gray-300 text-sm hidden md:table-cell">
                        {offer.branchId
                          ? branches.find(b => b.id === offer.branchId)?.name || '—'
                          : 'جميع الفروع'}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        {offer.discountPercent ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-500/10 text-amber-300 rounded-full border border-amber-500/20">
                            <PercentIcon />
                            {offer.discountPercent}%
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-gray-400 text-sm hidden lg:table-cell">
                        <div className="flex items-center gap-1.5">
                          <CalendarIcon />
                          {formatDate(offer.startDate)}
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-gray-400 text-sm hidden lg:table-cell">
                        <div className="flex items-center gap-1.5">
                          <CalendarIcon />
                          {formatDate(offer.endDate)}
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <button
                          onClick={() => handleTogglePublished(offer)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                            offer.isPublished
                              ? isActive
                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20'
                              : 'bg-gray-700/30 text-gray-400 border border-gray-600/30 hover:bg-gray-700/50'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            offer.isPublished
                              ? isActive ? 'bg-emerald-400' : 'bg-amber-400'
                              : 'bg-gray-500'
                          }`}></span>
                          {offer.isPublished ? (isActive ? 'نشط' : 'منتهي') : 'مسودة'}
                        </button>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(offer)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/20 hover:bg-amber-500/20 transition-all duration-200"
                          >
                            <EditIcon />
                            <span className="hidden sm:inline">تعديل</span>
                          </button>
                          <button
                            onClick={() => handleDelete(offer)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-500/10 text-rose-300 rounded-lg border border-rose-500/20 hover:bg-rose-500/20 transition-all duration-200"
                          >
                            <TrashIcon />
                            <span className="hidden sm:inline">حذف</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div
            className="relative bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 rounded-2xl border border-gray-700/50 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
                    <TagIcon />
                  </div>
                  <h2 className="text-xl font-bold text-white">
                    {editingOffer ? 'تعديل عرض' : 'إضافة عرض جديد'}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingOffer(null);
                    resetForm();
                  }}
                  className="w-8 h-8 rounded-lg bg-gray-700/50 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                >
                  <CloseIcon />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      العنوان (إنجليزي) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                      placeholder="Summer Sale"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      العنوان (عربي)
                    </label>
                    <input
                      type="text"
                      value={formData.titleAr}
                      onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                      placeholder="تخفيضات الصيف"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      الوصف (إنجليزي)
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200 resize-none"
                      rows={3}
                      placeholder="Description..."
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      الوصف (عربي)
                    </label>
                    <textarea
                      value={formData.descriptionAr}
                      onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200 resize-none"
                      rows={3}
                      placeholder="الوصف..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      الفرع
                    </label>
                    <select
                      value={formData.branchId}
                      onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
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
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      نسبة الخصم (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.discountPercent}
                      onChange={(e) => setFormData({ ...formData, discountPercent: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                      placeholder="20"
                    />
                  </div>

                  <div className="flex items-end">
                    <label className="flex items-center gap-3 cursor-pointer group py-2.5 px-4 bg-gray-900/50 border border-gray-700/50 rounded-xl w-full hover:border-amber-500/30 transition-all duration-200">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={formData.isPublished}
                          onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-5 h-5 rounded-md border-2 border-gray-600 peer-checked:border-amber-500 peer-checked:bg-amber-500 transition-all duration-200 flex items-center justify-center">
                          {formData.isPublished && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">نشر العرض</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      تاريخ البداية *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      تاريخ النهاية *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-xl"
                  >
                    {editingOffer ? 'حفظ التعديلات' : 'إضافة العرض'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingOffer(null);
                      resetForm();
                    }}
                    className="flex-1 px-5 py-2.5 bg-gray-700/50 hover:bg-gray-700 text-white rounded-xl font-medium transition-all duration-200 border border-gray-600/30"
                  >
                    إلغاء
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

export default OffersPage;
