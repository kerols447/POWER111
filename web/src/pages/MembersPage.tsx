import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { addPendingOperation } from '../utils/offlineDb';

interface Member {
  id: string;
  memberCode: string;
  status: string;
  person: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    gender?: string;
    photoPath?: string;
  };
  branch: {
    id: string;
    name: string;
    code: string;
  };
  subscriptions: Array<{
    id: string;
    endDate: string;
    status: string;
  }>;
  createdAt: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function MembersPage() {
  const navigate = useNavigate();
  const { user, isOwner, hasPermission } = useAuth();
  const isOnline = useOnlineStatus();
  const [members, setMembers] = useState<Member[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    gender: 'Male',
    branchId: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Auto-fill branch for non-OWNER users with single branch
  const userBranchCount = user?.branches?.length || 0;
  const singleBranchUser = !isOwner && userBranchCount === 1;

  useEffect(() => {
    fetchMembers();
    fetchBranches();
  }, [page, search, branchFilter, statusFilter]);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '20'
      });
      if (search) params.set('search', search);
      if (branchFilter) params.set('branchId', branchFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/members?${params}`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setMembers(data.data);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (err) {
      console.error('Error fetching members:', err);
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

  const handleDelete = async (memberId: string, memberName: string) => {
    if (!confirm(`هل أنت متأكد من حذف العضو "${memberName}"؟`)) {
      return;
    }

    if (!isOnline) {
      try {
        await addPendingOperation({
          id: generateOperationId(),
          type: 'DELETE_MEMBER',
          payload: { memberId },
          timestamp: Date.now(),
          branchId: branchFilter || user?.branches?.[0]?.id || '',
          userId: user!.id
        });
        alert('تم حفظ الحذف محلياً (سيتم التزامن عند عودة الاتصال)');
        fetchMembers();
      } catch {
        alert('حدث خطأ في الحفظ المحلي');
      }
      return;
    }

    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        fetchMembers();
      } else {
        const data = await res.json();
        alert(data.error || 'حدث خطأ في حذف العضو');
      }
    } catch (err) {
      try {
        await addPendingOperation({
          id: generateOperationId(),
          type: 'DELETE_MEMBER',
          payload: { memberId },
          timestamp: Date.now(),
          branchId: branchFilter || user?.branches?.[0]?.id || '',
          userId: user!.id
        });
        alert('تم حفظ الحذف محلياً (سيتم التزامن عند عودة الاتصال)');
      } catch {
        alert('حدث خطأ في حذف العضو');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    const branchId = singleBranchUser && user?.branches?.[0] ? user.branches[0].id : formData.branchId;

    if (!isOnline) {
      try {
        await addPendingOperation({
          id: generateOperationId(),
          type: 'NEW_MEMBER',
          payload: { name: formData.name, phone: formData.phone, email: formData.email || undefined, gender: formData.gender, branchId },
          timestamp: Date.now(),
          branchId,
          userId: user!.id
        });
        setShowModal(false);
        setFormData({ name: '', phone: '', email: '', gender: 'Male', branchId: '' });
        alert('تم حفظ العضو محلياً (سيتم التزامن عند عودة الاتصال)');
      } catch {
        setError('حدث خطأ في الحفظ المحلي');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'حدث خطأ في إنشاء العضو');
        return;
      }

      const newMemberId = data.data?.id;
      setShowModal(false);
      setFormData({ name: '', phone: '', email: '', gender: 'Male', branchId: '' });
      fetchMembers();

      if (newMemberId) {
        navigate(`/admin/members/${newMemberId}`);
      } else {
        setSuccess(data.warning || 'تم إنشاء العضو بنجاح');
      }
    } catch (err) {
      try {
        await addPendingOperation({
          id: generateOperationId(),
          type: 'NEW_MEMBER',
          payload: { name: formData.name, phone: formData.phone, email: formData.email || undefined, gender: formData.gender, branchId },
          timestamp: Date.now(),
          branchId,
          userId: user!.id
        });
        setShowModal(false);
        setFormData({ name: '', phone: '', email: '', gender: 'Male', branchId: '' });
        alert('تم حفظ العضو محلياً (سيتم التزامن عند عودة الاتصال)');
      } catch {
        setError('حدث خطأ في الاتصال بالخادم');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: 'bg-green-500/20 text-green-400 border-green-500/50',
      EXPIRED: 'bg-red-500/20 text-red-400 border-red-500/50',
      SUSPENDED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      FROZEN: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      INACTIVE: 'bg-gray-500/20 text-gray-400 border-gray-500/50'
    };
    const labels: Record<string, string> = {
      ACTIVE: 'نشط',
      EXPIRED: 'منتهي',
      SUSPENDED: 'موقوف',
      FROZEN: 'مجمد',
      INACTIVE: 'غير نشط'
    };
    return (
      <span className={`px-2 py-1 rounded text-xs border ${colors[status] || colors.INACTIVE}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-3 text-yellow-400 text-sm">
          غير متصل بالإنترنت — جميع العمليات تُحفظ محلياً وتُزامَن تلقائياً عند عودة الاتصال
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">الأعضاء</h1>
          <p className="text-gray-400 mt-1">إدارة أعضاء الجيم</p>
        </div>
        <button
          onClick={() => {
            setError('');
            setSuccess('');
            setFormData({ name: '', phone: '', email: '', gender: 'Male', branchId: singleBranchUser && user?.branches?.[0] ? user.branches[0].id : '' });
            setShowModal(true);
          }}
          className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
        >
          + إضافة عضو
        </button>
      </div>

      {/* Filters */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="بحث بالاسم، الهاتف، أو الكود..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
          />
          {!singleBranchUser && (
            <select
              value={branchFilter}
              onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
              className="px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
            >
              <option value="">كل الفروع</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
          >
            <option value="">كل الحالات</option>
            <option value="ACTIVE">نشط</option>
            <option value="EXPIRED">منتهي</option>
            <option value="SUSPENDED">موقوف</option>
            <option value="FROZEN">مجمد</option>
            <option value="INACTIVE">غير نشط</option>
          </select>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">جاري التحميل...</div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            لا يوجد أعضاء
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark border-b border-dark-border">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الكود</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الاسم</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الهاتف</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الفرع</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الحالة</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">تاريخ الإنشاء</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {members.map(member => (
                  <tr
                    key={member.id}
                    onClick={() => navigate(`/admin/members/${member.id}`)}
                    className="hover:bg-dark/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-mono text-primary">{member.memberCode}</td>
                    <td className="px-4 py-3 text-sm text-white">{member.person.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{member.person.phone}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{member.branch.code}</td>
                    <td className="px-4 py-3">{getStatusBadge(member.status)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {new Date(member.createdAt).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="px-4 py-3">
                      {hasPermission('DELETE_MEMBERS') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(member.id, member.person.name);
                          }}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                        >
                          حذف
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded bg-dark border border-dark-border text-white disabled:opacity-50"
            >
              السابق
            </button>
            <span className="text-sm text-gray-400">
              صفحة {page} من {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded bg-dark border border-dark-border text-white disabled:opacity-50"
            >
              التالي
            </button>
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">إضافة عضو جديد</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 p-3 bg-green-500/10 border border-green-500/50 rounded-lg text-green-400 text-sm">
                  {success}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">الاسم *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">الهاتف *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="01xxxxxxxxx"
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">النوع</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                  >
                    <option value="Male">ذكر</option>
                    <option value="Female">أنثى</option>
                  </select>
                </div>

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

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2 bg-dark border border-dark-border text-white rounded-lg hover:bg-dark/80"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`flex-1 py-2 text-white rounded-lg disabled:opacity-50 ${!isOnline ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-primary hover:bg-primary-dark'}`}
                  >
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

export default MembersPage;
