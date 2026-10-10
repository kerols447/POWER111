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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">إدارة العروض</h1>
        <button
          onClick={() => {
            setEditingOffer(null);
            resetForm();
            setShowModal(true);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          + إضافة عرض جديد
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">إجمالي العروض</div>
          <div className="text-2xl font-bold text-white">{offers.length}</div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">العروض المنشورة</div>
          <div className="text-2xl font-bold text-green-400">{offers.filter(o => o.isPublished).length}</div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">العروض النشطة حالياً</div>
          <div className="text-2xl font-bold text-yellow-400">
            {offers.filter(o => {
              const now = new Date();
              return new Date(o.startDate) <= now && new Date(o.endDate) >= now && o.isPublished;
            }).length}
          </div>
        </div>
      </div>

      {/* Offers List */}
      <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-dark border-b border-dark-border">
            <tr>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">العنوان</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الفرع</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الخصم</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">البداية</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">النهاية</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الحالة</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {offers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  لا توجد عروض حالياً
                </td>
              </tr>
            ) : (
              offers.map((offer) => {
                const now = new Date();
                const isActive = new Date(offer.startDate) <= now && new Date(offer.endDate) >= now;
                return (
                  <tr key={offer.id} className="border-b border-dark-border hover:bg-dark/50">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{offer.titleAr || offer.title}</div>
                      {offer.descriptionAr && (
                        <div className="text-sm text-gray-400 mt-1">{offer.descriptionAr}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {offer.branchId
                        ? branches.find(b => b.id === offer.branchId)?.name || '—'
                        : 'جميع الفروع'}
                    </td>
                    <td className="px-4 py-3">
                      {offer.discountPercent ? (
                        <span className="text-yellow-400 font-bold">{offer.discountPercent}%</span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{formatDate(offer.startDate)}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{formatDate(offer.endDate)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleTogglePublished(offer)}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          offer.isPublished
                            ? isActive
                              ? 'bg-green-500/10 text-green-400 border border-green-500/50'
                              : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/50'
                            : 'bg-red-500/10 text-red-400 border border-red-500/50'
                        }`}
                      >
                        {offer.isPublished ? (isActive ? 'نشط' : 'منتهي') : 'مسودة'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(offer)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDelete(offer)}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                        >
                          حذف
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingOffer ? 'تعديل عرض' : 'إضافة عرض جديد'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    العنوان (إنجليزي) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="Summer Sale"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    العنوان (عربي)
                  </label>
                  <input
                    type="text"
                    value={formData.titleAr}
                    onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="تخفيضات الصيف"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    الوصف (إنجليزي)
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                    rows={3}
                    placeholder="Description..."
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    الوصف (عربي)
                  </label>
                  <textarea
                    value={formData.descriptionAr}
                    onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                    rows={3}
                    placeholder="الوصف..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    الفرع
                  </label>
                  <select
                    value={formData.branchId}
                    onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
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
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    نسبة الخصم (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.discountPercent}
                    onChange={(e) => setFormData({ ...formData, discountPercent: e.target.value })}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="20"
                  />
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isPublished}
                      onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-600 bg-dark text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-300">نشر العرض</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    تاريخ البداية *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    تاريخ النهاية *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
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
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default OffersPage;
