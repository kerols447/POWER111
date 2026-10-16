import { useState, useEffect } from 'react';

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

// SVG Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const BuildingIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const PackageIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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

const MapPinIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const PhoneIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

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
        alert(data.error || 'حدث خطأ');
      }
    } catch (error) {
      console.error('Error saving branch:', error);
      alert('حدث خطأ في حفظ البيانات');
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

  const handleDelete = async (branch: Branch) => {
    if (!confirm(`هل أنت متأكد من حذف فرع "${branch.name}"؟`)) {
      return;
    }

    try {
      const res = await fetch(`/api/branches/${branch.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        fetchBranches();
      } else {
        const data = await res.json();
        alert(data.error || data.message || 'حدث خطأ');
      }
    } catch (error) {
      console.error('Error deleting branch:', error);
      alert('حدث خطأ في حذف الفرع');
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
            <BuildingIcon />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              إدارة الفروع
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">إدارة فروع المنشأة</p>
          </div>
        </div>
        <button
          onClick={() => {
            setEditingBranch(null);
            setFormData({ name: '', code: '', address: '', locationUrl: '', phone: '', whatsapp: '' });
            setShowModal(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 transform hover:-translate-y-0.5"
        >
          <PlusIcon />
          <span>إضافة فرع جديد</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative overflow-hidden bg-gradient-to-br from-dark-card/80 via-dark-card/60 to-dark-card/80 backdrop-blur-sm rounded-2xl border border-dark-border/50 p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.06),transparent_50%)]"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <BuildingIcon />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">إجمالي الفروع</span>
            </div>
            <p className="text-2xl font-bold text-white">{branches.length}</p>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-br from-dark-card/80 via-dark-card/60 to-dark-card/80 backdrop-blur-sm rounded-2xl border border-dark-border/50 p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.06),transparent_50%)]"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircleIcon />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">الفروع النشطة</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{branches.filter(b => b.isActive).length}</p>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-br from-dark-card/80 via-dark-card/60 to-dark-card/80 backdrop-blur-sm rounded-2xl border border-dark-border/50 p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.06),transparent_50%)]"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <UsersIcon />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">إجمالي الأعضاء</span>
            </div>
            <p className="text-2xl font-bold text-amber-400">{branches.reduce((sum, b) => sum + b._count.members, 0)}</p>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-br from-dark-card/80 via-dark-card/60 to-dark-card/80 backdrop-blur-sm rounded-2xl border border-dark-border/50 p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.06),transparent_50%)]"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <PackageIcon />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">إجمالي المنتجات</span>
            </div>
            <p className="text-2xl font-bold text-yellow-400">{branches.reduce((sum, b) => sum + b._count.products, 0)}</p>
          </div>
        </div>
      </div>

      {/* Branches Table */}
      <div className="relative overflow-hidden bg-gradient-to-br from-dark-card/80 via-dark-card/60 to-dark-card/80 backdrop-blur-sm rounded-2xl border border-dark-border/50">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-dark-border/50">
                <th className="px-2.5 sm:px-3.5 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الكود</th>
                <th className="px-2.5 sm:px-3.5 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الاسم</th>
                <th className="px-2.5 sm:px-3.5 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">العنوان</th>
                <th className="px-2.5 sm:px-3.5 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">الهاتف</th>
                <th className="px-2.5 sm:px-3.5 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الأعضاء</th>
                <th className="px-2.5 sm:px-3.5 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الحالة</th>
                <th className="px-2.5 sm:px-3.5 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border/30">
              {branches.map((branch) => (
                <tr key={branch.id} className="hover:bg-amber-500/5 transition-colors duration-200">
                  <td className="px-2.5 sm:px-3.5 py-4">
                    <span className="inline-flex px-2.5 py-1 text-xs font-mono font-medium bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/20">
                      {branch.code}
                    </span>
                  </td>
                  <td className="px-2.5 sm:px-3.5 py-4 text-white font-medium">{branch.name}</td>
                  <td className="px-2.5 sm:px-3.5 py-4 text-gray-400 text-sm hidden lg:table-cell">
                    <div className="flex items-center gap-1.5">
                      <MapPinIcon />
                      <span>{branch.address || '—'}</span>
                    </div>
                  </td>
                  <td className="px-2.5 sm:px-3.5 py-4 text-gray-400 text-sm font-mono hidden md:table-cell">
                    {branch.phone ? (
                      <div className="flex items-center gap-1.5">
                        <PhoneIcon />
                        <span>{branch.phone}</span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-2.5 sm:px-3.5 py-4">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 text-amber-300 text-sm font-bold">
                      {branch._count.members}
                    </span>
                  </td>
                  <td className="px-2.5 sm:px-3.5 py-4">
                    <button
                      onClick={() => handleToggleActive(branch)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                        branch.isActive
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${branch.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                      {branch.isActive ? 'نشط' : 'معطل'}
                    </button>
                  </td>
                  <td className="px-2.5 sm:px-3.5 py-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleEdit(branch)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/20 hover:bg-amber-500/20 transition-all duration-200"
                      >
                        <EditIcon />
                        <span className="hidden sm:inline">تعديل</span>
                      </button>
                      <button
                        onClick={() => handleDelete(branch)}
                        disabled={branch._count.members > 0 || branch._count.products > 0}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-rose-500/10 text-rose-300 rounded-lg border border-rose-500/20 hover:bg-rose-500/20 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-rose-500/10"
                      >
                        <TrashIcon />
                        <span className="hidden sm:inline">حذف</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phone: one card per branch, no sideways scrolling */}
        <div className="sm:hidden divide-y divide-dark-border/30">
          {branches.map((branch) => (
            <div key={branch.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{branch.name}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex px-2.5 py-1 text-xs font-mono font-medium bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/20">
                      {branch.code}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                      branch.isActive
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${branch.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                      {branch.isActive ? 'نشط' : 'معطل'}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-center">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-amber-500/10 text-amber-300 text-sm font-bold">
                    {branch._count.members}
                  </span>
                  <p className="text-[11px] text-gray-500 mt-1">عضو</p>
                </div>
              </div>

              {(branch.address || branch.phone) && (
                <div className="mt-3 space-y-1.5 text-xs text-gray-400">
                  {branch.address && (
                    <div className="flex items-start gap-1.5">
                      <MapPinIcon />
                      <span>{branch.address}</span>
                    </div>
                  )}
                  {branch.phone && (
                    <div className="flex items-center gap-1.5 font-mono">
                      <PhoneIcon />
                      <span>{branch.phone}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleToggleActive(branch)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-10 rounded-lg text-xs font-medium border transition-all duration-200 ${
                    branch.isActive
                      ? 'bg-rose-500/10 text-rose-300 border-rose-500/20 active:bg-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 active:bg-emerald-500/20'
                  }`}
                >
                  {branch.isActive ? 'تعطيل' : 'تفعيل'}
                </button>
                <button
                  onClick={() => handleEdit(branch)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-10 text-xs font-medium bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/20 active:bg-amber-500/20 transition-all duration-200"
                >
                  <EditIcon />
                  <span>تعديل</span>
                </button>
                <button
                  onClick={() => handleDelete(branch)}
                  disabled={branch._count.members > 0 || branch._count.products > 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-10 text-xs font-medium bg-rose-500/10 text-rose-300 rounded-lg border border-rose-500/20 active:bg-rose-500/20 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <TrashIcon />
                  <span>حذف</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div
            className="relative bg-gradient-to-br from-dark-card via-dark-card to-dark-card rounded-2xl border border-dark-border/50 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
                    <BuildingIcon />
                  </div>
                  <h2 className="text-xl font-bold text-white">
                    {editingBranch ? 'تعديل فرع' : 'إضافة فرع جديد'}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingBranch(null);
                    setFormData({ name: '', code: '', address: '', locationUrl: '', phone: '', whatsapp: '' });
                  }}
                  className="w-10 h-10 shrink-0 rounded-lg bg-dark-hover/50 flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-hover transition-colors"
                >
                  <CloseIcon />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    اسم الفرع *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                    placeholder="POWER 111 — فرع جديد"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    كود الفرع *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                    placeholder="BR05"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    العنوان
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                    placeholder="العنوان بالتفصيل"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    رابط الموقع (Google Maps)
                  </label>
                  <input
                    type="url"
                    value={formData.locationUrl}
                    onChange={(e) => setFormData({ ...formData, locationUrl: e.target.value })}
                    className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                    placeholder="https://maps.google.com/..."
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    رقم الهاتف
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                    placeholder="01234567890"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    رقم الواتساب
                  </label>
                  <input
                    type="tel"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                    placeholder="01234567890"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-xl"
                  >
                    {editingBranch ? 'حفظ التعديلات' : 'إضافة الفرع'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingBranch(null);
                      setFormData({ name: '', code: '', address: '', locationUrl: '', phone: '', whatsapp: '' });
                    }}
                    className="flex-1 px-5 py-2.5 bg-dark-hover/50 hover:bg-dark-hover text-white rounded-xl font-medium transition-all duration-200 border border-dark-border/30"
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

export default BranchesPage;
