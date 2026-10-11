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
    const config: Record<string, { colors: string; label: string; dot: string }> = {
      ACTIVE: {
        colors: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        label: 'نشط',
        dot: 'bg-emerald-400'
      },
      EXPIRED: {
        colors: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        label: 'منتهي',
        dot: 'bg-rose-400'
      },
      SUSPENDED: {
        colors: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        label: 'موقوف',
        dot: 'bg-amber-400'
      },
      FROZEN: {
        colors: 'bg-primary/10 text-primary border-primary/30',
        label: 'مجمد',
        dot: 'bg-primary'
      },
      INACTIVE: {
        colors: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
        label: 'غير نشط',
        dot: 'bg-gray-400'
      }
    };
    const c = config[status] || config.INACTIVE;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${c.colors}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
        {c.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <div className="text-gray-400 text-sm">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-4 sm:p-5">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-amber-500/60 via-amber-500/20 to-transparent" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.25l-.53.53-.53-.53a.75.75 0 011.06 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-400">غير متصل بالإنترنت</p>
              <p className="text-xs text-amber-400/60 mt-0.5">جميع العمليات تُحفظ محلياً وتُزامَن تلقائياً عند عودة الاتصال</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">الأعضاء</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة أعضاء الجيم</p>
        </div>
        <button
          onClick={() => {
            setError('');
            setSuccess('');
            setFormData({ name: '', phone: '', email: '', gender: 'Male', branchId: singleBranchUser && user?.branches?.[0] ? user.branches[0].id : '' });
            setShowModal(true);
          }}
          className="relative overflow-hidden inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-amber-600 hover:from-amber-600 hover:to-primary text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30 group"
        >
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3M2.25 9.75h19.5a2.25 2.25 0 012.25 2.25v6a2.25 2.25 0 01-2.25 2.25H2.25A2.25 2.25 0 010 18v-6a2.25 2.25 0 012.25-2.25z" />
          </svg>
          <span>إضافة عضو</span>
        </button>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-dark-card to-dark-card border border-primary/20 rounded-2xl p-4 sm:p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full -translate-y-6 translate-x-6" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-primary/15 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              <span className="text-xs text-primary/70 font-medium">إجمالي الأعضاء</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-primary tracking-tight">{members.length}</p>
            <div className="mt-2 flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              <span className="text-[10px] text-primary/50">في هذه الصفحة</span>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-dark-card to-dark-card border border-emerald-500/20 rounded-2xl p-4 sm:p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full -translate-y-6 translate-x-6" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-emerald-500/15 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-xs text-emerald-400/70 font-medium">نشط</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight">
              {members.filter(m => m.status === 'ACTIVE').length}
            </p>
            <div className="mt-2 flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-[10px] text-emerald-400/50">اشتراك فعّال</span>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-br from-rose-500/10 via-dark-card to-dark-card border border-rose-500/20 rounded-2xl p-4 sm:p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/5 rounded-full -translate-y-6 translate-x-6" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-rose-500/15 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <span className="text-xs text-rose-400/70 font-medium">منتهي</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-rose-400 tracking-tight">
              {members.filter(m => m.status === 'EXPIRED').length}
            </p>
            <div className="mt-2 flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-pulse" />
              <span className="text-[10px] text-rose-400/50">بحاجة لتجديد</span>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-dark-card to-dark-card border border-amber-500/20 rounded-2xl p-4 sm:p-5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full -translate-y-6 translate-x-6" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-amber-500/15 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-xs text-amber-400/70 font-medium">موقوف / مجمد</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-amber-400 tracking-tight">
              {members.filter(m => m.status === 'SUSPENDED' || m.status === 'FROZEN').length}
            </p>
            <div className="mt-2 flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
              <span className="text-[10px] text-amber-400/50">غير نشط مؤقتاً</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/40 via-primary/10 to-transparent" />
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-white">تصفية النتائج</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Search */}
            <div className="relative">
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="بحث بالاسم، الهاتف، أو الكود..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-4 pr-10 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>

            {/* Branch Filter */}
            {!singleBranchUser && (
              <div className="relative">
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                  </svg>
                </div>
                <select
                  value={branchFilter}
                  onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
                  className="w-full pl-4 pr-10 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 transition-colors appearance-none"
                >
                  <option value="">كل الفروع</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Status Filter */}
            <div className="relative">
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="w-full pl-4 pr-10 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 transition-colors appearance-none"
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
        </div>
      </div>

      {/* Members Table */}
      <div className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/40 via-primary/10 to-transparent" />

        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-20 h-20 bg-dark rounded-2xl flex items-center justify-center border border-dark-border mb-4">
              <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm font-medium">لا يوجد أعضاء</p>
            <p className="text-gray-600 text-xs mt-1">جرّب تغيير معايير البحث أو أضف عضواً جديداً</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-dark-border">
                    <th className="px-5 py-4 text-right text-xs font-semibold text-gray-500">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                        </svg>
                        الكود
                      </div>
                    </th>
                    <th className="px-5 py-4 text-right text-xs font-semibold text-gray-500">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                        الاسم
                      </div>
                    </th>
                    <th className="px-5 py-4 text-right text-xs font-semibold text-gray-500">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                        </svg>
                        الهاتف
                      </div>
                    </th>
                    <th className="px-5 py-4 text-right text-xs font-semibold text-gray-500">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        الفرع
                      </div>
                    </th>
                    <th className="px-5 py-4 text-right text-xs font-semibold text-gray-500">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        الحالة
                      </div>
                    </th>
                    <th className="px-5 py-4 text-right text-xs font-semibold text-gray-500">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                        تاريخ الإنشاء
                      </div>
                    </th>
                    <th className="px-5 py-4 text-right text-xs font-semibold text-gray-500">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(member => (
                    <tr
                      key={member.id}
                      onClick={() => navigate(`/admin/members/${member.id}`)}
                      className="border-b border-dark-border/30 last:border-0 hover:bg-white/[0.02] cursor-pointer transition-colors group"
                    >
                      <td className="px-5 py-4">
                        <span className="text-sm font-mono font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-lg border border-primary/20">
                          {member.memberCode}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center flex-shrink-0 border border-primary/10">
                            <span className="text-sm font-bold text-primary">
                              {member.person.name.charAt(0)}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-white group-hover:text-primary transition-colors">
                            {member.person.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm text-gray-300 font-mono">{member.person.phone}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-dark rounded-lg flex items-center justify-center border border-dark-border">
                            <span className="text-[10px] font-bold text-gray-400">{member.branch.code.charAt(0)}</span>
                          </div>
                          <span className="text-sm text-gray-300">{member.branch.code}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">{getStatusBadge(member.status)}</td>
                      <td className="px-5 py-4">
                        <span className="text-sm text-gray-400">
                          {new Date(member.createdAt).toLocaleDateString('ar-EG')}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {hasPermission('DELETE_MEMBERS') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(member.id, member.person.name);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium rounded-lg border border-rose-500/20 hover:border-rose-500/40 transition-all"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                            حذف
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="sm:hidden divide-y divide-dark-border/50">
              {members.map(member => (
                <div
                  key={member.id}
                  onClick={() => navigate(`/admin/members/${member.id}`)}
                  className="p-4 hover:bg-white/[0.02] cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center flex-shrink-0 border border-primary/10">
                        <span className="text-base font-bold text-primary">
                          {member.person.name.charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{member.person.name}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{member.person.phone}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {getStatusBadge(member.status)}
                      <span className="text-xs font-mono font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                        {member.memberCode}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-dark-border/30">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-dark rounded flex items-center justify-center border border-dark-border">
                        <span className="text-[9px] font-bold text-gray-400">{member.branch.code.charAt(0)}</span>
                      </div>
                      <span className="text-xs text-gray-400">{member.branch.code}</span>
                      <span className="text-gray-600 mx-1">|</span>
                      <span className="text-xs text-gray-500">
                        {new Date(member.createdAt).toLocaleDateString('ar-EG')}
                      </span>
                    </div>
                    {hasPermission('DELETE_MEMBERS') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(member.id, member.person.name);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 text-rose-400 text-xs font-medium rounded-lg border border-rose-500/20"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        حذف
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-dark-border">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-dark border border-dark-border text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:border-primary/30 hover:bg-primary/5 transition-all"
            >
              <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              السابق
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400 font-medium">
                صفحة <span className="text-primary font-bold">{page}</span> من <span className="text-white font-bold">{totalPages}</span>
              </span>
            </div>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-dark border border-dark-border text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:border-primary/30 hover:bg-primary/5 transition-all"
            >
              التالي
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/50">
            {/* Modal Header Gradient */}
            <div className="relative bg-gradient-to-br from-primary/10 via-dark-card to-dark-card p-5 sm:p-6 border-b border-dark-border">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center border border-primary/10">
                    <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3M2.25 9.75h19.5a2.25 2.25 0 012.25 2.25v6a2.25 2.25 0 01-2.25 2.25H2.25A2.25 2.25 0 010 18v-6a2.25 2.25 0 012.25-2.25z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">إضافة عضو جديد</h2>
                    <p className="text-xs text-gray-500 mt-0.5">أدخل بيانات العضو أدناه</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-dark border border-dark-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {error && (
                <div className="mb-5 flex items-center gap-3 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                  <div className="w-8 h-8 bg-rose-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                  <p className="text-sm text-rose-400 font-medium">{error}</p>
                </div>
              )}

              {success && (
                <div className="mb-5 flex items-center gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                  <div className="w-8 h-8 bg-emerald-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-emerald-400 font-medium">{success}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                    الاسم <span className="text-primary">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 transition-colors placeholder:text-gray-600"
                    placeholder="أدخل اسم العضو"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    الهاتف <span className="text-primary">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="01xxxxxxxxx"
                    className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 transition-colors placeholder:text-gray-600 font-mono"
                    dir="ltr"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    البريد الإلكتروني
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 transition-colors placeholder:text-gray-600"
                    placeholder="example@email.com"
                    dir="ltr"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                    </svg>
                    النوع
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, gender: 'Male' })}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        formData.gender === 'Male'
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-dark border-dark-border text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      ذكر
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, gender: 'Female' })}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        formData.gender === 'Female'
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-dark border-dark-border text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      أنثى
                    </button>
                  </div>
                </div>

                {/* Branch */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                    </svg>
                    الفرع <span className="text-primary">*</span>
                  </label>
                  {singleBranchUser ? (
                    <div className="w-full px-4 py-2.5 bg-dark/50 border border-dark-border rounded-xl text-gray-400 text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {user?.branches?.[0]?.name}
                    </div>
                  ) : (
                    <select
                      required
                      value={formData.branchId}
                      onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                      className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 transition-colors appearance-none"
                    >
                      <option value="">اختر الفرع</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-dark-border">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 bg-dark border border-dark-border text-white rounded-xl text-sm font-medium hover:bg-white/[0.03] hover:border-gray-600 transition-all"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`flex-1 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg ${
                      !isOnline
                        ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-600 shadow-amber-900/20'
                        : 'bg-gradient-to-r from-primary to-amber-600 hover:from-amber-600 hover:to-primary shadow-primary/20'
                    }`}
                  >
                    {submitting ? (
                      <span className="inline-flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        جاري الحفظ...
                      </span>
                    ) : !isOnline ? 'حفظ محلياً' : 'حفظ'}
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
