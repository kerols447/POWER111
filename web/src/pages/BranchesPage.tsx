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
        <div className="text-gray-400">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">إدارة الفروع</h1>
        <button
          onClick={() => {
            setEditingBranch(null);
            setFormData({ name: '', code: '', address: '', locationUrl: '', phone: '', whatsapp: '' });
            setShowModal(true);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          + إضافة فرع جديد
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">إجمالي الفروع</div>
          <div className="text-2xl font-bold text-white">{branches.length}</div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">الفروع النشطة</div>
          <div className="text-2xl font-bold text-green-400">{branches.filter(b => b.isActive).length}</div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">إجمالي الأعضاء</div>
          <div className="text-2xl font-bold text-blue-400">{branches.reduce((sum, b) => sum + b._count.members, 0)}</div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">إجمالي المنتجات</div>
          <div className="text-2xl font-bold text-purple-400">{branches.reduce((sum, b) => sum + b._count.products, 0)}</div>
        </div>
      </div>

      {/* Branches List */}
      <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-dark border-b border-dark-border">
            <tr>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الكود</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الاسم</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">العنوان</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الهاتف</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الأعضاء</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الحالة</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.id} className="border-b border-dark-border hover:bg-dark/50">
                <td className="px-4 py-3 text-white font-mono text-sm">{branch.code}</td>
                <td className="px-4 py-3 text-white font-medium">{branch.name}</td>
                <td className="px-4 py-3 text-gray-300">{branch.address || '-'}</td>
                <td className="px-4 py-3 text-gray-300 font-mono">{branch.phone || '-'}</td>
                <td className="px-4 py-3">
                  <span className="text-blue-400">{branch._count.members}</span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleActive(branch)}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      branch.isActive
                        ? 'bg-green-500/10 text-green-400 border border-green-500/50'
                        : 'bg-red-500/10 text-red-400 border border-red-500/50'
                    }`}
                  >
                    {branch.isActive ? 'نشط' : 'معطل'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(branch)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                    >
                      تعديل
                    </button>
                    <button
                      onClick={() => handleDelete(branch)}
                      disabled={branch._count.members > 0 || branch._count.products > 0}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingBranch ? 'تعديل فرع' : 'إضافة فرع جديد'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  اسم الفرع *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="POWER 111 — فرع جديد"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  كود الفرع *
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                  placeholder="BR05"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  العنوان
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="العنوان بالتفصيل"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  رابط الموقع (Google Maps)
                </label>
                <input
                  type="url"
                  value={formData.locationUrl}
                  onChange={(e) => setFormData({ ...formData, locationUrl: e.target.value })}
                  className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="https://maps.google.com/..."
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  رقم الهاتف
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                  placeholder="01234567890"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  رقم الواتساب
                </label>
                <input
                  type="tel"
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                  className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                  placeholder="01234567890"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
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

export default BranchesPage;
