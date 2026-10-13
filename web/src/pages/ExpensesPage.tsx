import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { addPendingOperation } from '../utils/offlineDb';
import ConfirmDialog from '../components/ConfirmDialog';
import NoticeBanner from '../components/NoticeBanner';

interface Expense {
  id: string;
  branchId: string;
  category: string;
  description: string;
  amountPiasters: number;
  date: string;
  branch: {
    id: string;
    name: string;
  };
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

const CATEGORIES = [
  'إيجار',
  'كهرباء ومياه',
  'رواتب',
  'صيانة',
  'مستلزمات',
  'تسويق',
  'نقل ومواصلات',
  'أخرى'
];

// SVG Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const WalletIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h.75A2.25 2.25 0 0118 6v0a2.25 2.25 0 01-2.25 2.25H15M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  </svg>
);

const ReceiptIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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

const OfflineIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M12 12h.01M8.464 8.464l-2.828-2.828M15.536 15.536l2.828 2.828" />
  </svg>
);

const FilterIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export default function ExpensesPage() {
  const { user, isOwner } = useAuth();
  const isOnline = useOnlineStatus();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;

  const [formData, setFormData] = useState({
    category: 'أخرى',
    description: '',
    amountPiasters: 0,
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    if (selectedBranch && isOnline) {
      fetchExpenses();
    }
  }, [selectedBranch, categoryFilter, search, isOnline]);

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      const data = await res.json();
      const branchList = Array.isArray(data) ? data : (data.branches || []);
      setBranches(branchList);
      if (branchList.length > 0 && !selectedBranch) {
        setSelectedBranch(branchList[0].id);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ branchId: selectedBranch });
      if (categoryFilter) params.append('category', categoryFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/expenses?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (Array.isArray(data)) {
        setExpenses(data);
      } else {
        setExpenses([]);
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingExpense(null);
    setFormData({
      category: 'أخرى',
      description: '',
      amountPiasters: 0,
      date: new Date().toISOString().split('T')[0]
    });
    setShowModal(true);
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      category: expense.category,
      description: expense.description,
      amountPiasters: expense.amountPiasters,
      date: new Date(expense.date).toISOString().split('T')[0]
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOnline) {
      if (editingExpense) {
        await handleOfflineEditExpense();
      } else {
        await handleOfflineExpense();
      }
      return;
    }

    try {
      const url = editingExpense ? `/api/expenses/${editingExpense.id}` : '/api/expenses';
      const method = editingExpense ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          branchId: selectedBranch
        })
      });

      const data = await res.json();
      if (data.id || data.success) {
        setShowModal(false);
        setNotice({ kind: 'ok', text: editingExpense ? 'تم تعديل المصروف' : 'تم إضافة المصروف' });
        fetchExpenses();
      } else {
        setNotice({ kind: 'err', text: data.error || data.message || 'حدث خطأ أثناء الحفظ' });
      }
    } catch (error) {
      console.error('Error saving expense:', error);
      if (editingExpense) {
        await handleOfflineEditExpense();
      } else {
        await handleOfflineExpense();
      }
    }
  };

  const handleOfflineExpense = async () => {
    const operationId = generateOperationId();
    await addPendingOperation({
      id: operationId,
      type: 'EXPENSE',
      payload: {
        category: formData.category,
        description: formData.description,
        amountPiasters: formData.amountPiasters,
        date: formData.date,
        expenseTimestamp: new Date().toISOString()
      },
      timestamp: Date.now(),
      branchId: selectedBranch,
      userId: user!.id
    });

    setShowModal(false);
    setNotice({ kind: 'ok', text: 'تم حفظ المصروف محلياً — سيتم التزامن عند عودة الاتصال' });
  };

  const handleOfflineEditExpense = async () => {
    const operationId = generateOperationId();
    await addPendingOperation({
      id: operationId,
      type: 'EDIT_EXPENSE',
      payload: {
        expenseId: editingExpense!.id,
        category: formData.category,
        description: formData.description,
        amountPiasters: formData.amountPiasters,
        date: formData.date
      },
      timestamp: Date.now(),
      branchId: selectedBranch,
      userId: user!.id
    });

    setShowModal(false);
    setNotice({ kind: 'ok', text: 'تم حفظ التعديل محلياً — سيتم التزامن عند عودة الاتصال' });
  };

  const queueOfflineDelete = async (id: string) => {
    await addPendingOperation({
      id: generateOperationId(),
      type: 'DELETE_EXPENSE',
      payload: { expenseId: id },
      timestamp: Date.now(),
      branchId: selectedBranch,
      userId: user!.id
    });
    setNotice({ kind: 'ok', text: 'تم حفظ الحذف محلياً — سيتم التزامن عند عودة الاتصال' });
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const id = pendingDelete.id;

    if (!isOnline) {
      try {
        await queueOfflineDelete(id);
        fetchExpenses();
      } catch {
        setNotice({ kind: 'err', text: 'تعذر حذف المصروف — أعد المحاولة' });
      } finally {
        setDeleting(false);
        setPendingDelete(null);
      }
      return;
    }

    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok && (data.success || data.id)) {
        setNotice({ kind: 'ok', text: 'تم حذف المصروف' });
        fetchExpenses();
      } else {
        setNotice({ kind: 'err', text: data.error || data.message || 'حدث خطأ أثناء الحذف' });
      }
    } catch {
      try {
        await queueOfflineDelete(id);
        fetchExpenses();
      } catch {
        setNotice({ kind: 'err', text: 'حدث خطأ أثناء حذف المصروف' });
      }
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const formatPrice = (piasters: number) => {
    const egp = piasters / 100;
    return `${egp.toFixed(2)} جنيه`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amountPiasters, 0);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.1),transparent_50%)]"></div>
          <div className="relative flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <OfflineIcon />
            </div>
            <p className="text-amber-300 text-sm font-medium">
              غير متصل بالإنترنت — جميع العمليات تُحفظ محلياً وتُزامَن تلقائياً عند عودة الاتصال
            </p>
          </div>
        </div>
      )}

      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <WalletIcon />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              المصروفات
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">إدارة مصروفات الفروع</p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className={`inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-xl font-medium transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 ${
            !isOnline
              ? 'bg-gradient-to-r from-amber-600 to-amber-700 shadow-amber-600/20 hover:shadow-amber-600/30'
              : 'bg-gradient-to-r from-amber-500 to-amber-600 shadow-amber-500/20 hover:shadow-amber-500/30'
          }`}
        >
          <PlusIcon />
          <span>{!isOnline ? 'إضافة محلياً' : 'إضافة مصروف جديد'}</span>
        </button>
      </div>

      {/* Summary Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.08),transparent_50%)]"></div>
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent"></div>
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500/20 to-rose-600/10 flex items-center justify-center border border-rose-500/20">
            <ReceiptIcon />
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-1">إجمالي المصروفات</p>
            <p className="text-3xl font-bold text-rose-400">{formatPrice(totalExpenses)}</p>
            <p className="text-sm text-gray-500 mt-1">{expenses.length} مصروف</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-6">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
        <div className="flex items-center gap-2 mb-4">
          <FilterIcon />
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">التصفية والبحث</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Branch Selector */}
          {!singleBranchUser && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                الفرع
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              الفئة
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
            >
              <option value="">جميع الفئات</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              بحث
            </label>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="وصف المصروف..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <SearchIcon />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center gap-3 text-gray-400">
              <svg className="animate-spin w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>جاري التحميل...</span>
            </div>
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-700/30 flex items-center justify-center">
              <ReceiptIcon />
            </div>
            <p className="text-gray-400 text-lg font-medium">لا توجد مصروفات</p>
            <p className="text-gray-500 text-sm mt-1">قم بإضافة مصروف جديد للبدء</p>
          </div>
        ) : (
          <>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    التاريخ
                  </th>
                  <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    الفئة
                  </th>
                  <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                    الوصف
                  </th>
                  <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    المبلغ
                  </th>
                  <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    الفرع
                  </th>
                  <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/30">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-amber-500/5 transition-colors duration-200">
                    <td className="px-4 sm:px-6 py-4 text-sm text-gray-300">
                      {formatDate(expense.date)}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <span className="inline-flex px-3 py-1 text-xs font-medium bg-amber-500/10 text-amber-300 rounded-full border border-amber-500/20">
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-white hidden sm:table-cell">
                      {expense.description}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm font-semibold text-rose-400">
                      {formatPrice(expense.amountPiasters)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-gray-300 hidden lg:table-cell">
                      {expense.branch.name}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(expense)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-10 text-xs font-medium bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/20 hover:bg-amber-500/20 transition-all duration-200"
                        >
                          <EditIcon />
                          <span className="hidden sm:inline">تعديل</span>
                        </button>
                        <button
                          onClick={() => setPendingDelete(expense)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-10 text-xs font-medium bg-rose-500/10 text-rose-300 rounded-lg border border-rose-500/20 hover:bg-rose-500/20 transition-all duration-200"
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

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-gray-700/30">
            {expenses.map((expense) => (
              <div key={expense.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white leading-snug">{expense.description}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="inline-flex px-2.5 py-1 text-xs font-medium bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/20">
                        {expense.category}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(expense.date)}</span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-rose-400 flex-shrink-0">
                    {formatPrice(expense.amountPiasters)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-700/30">
                  <span className="text-xs text-gray-500 truncate">{expense.branch.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => openEditModal(expense)}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 min-h-11 text-xs font-medium bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/20 active:bg-amber-500/20 transition-colors"
                    >
                      <EditIcon />
                      تعديل
                    </button>
                    <button
                      onClick={() => setPendingDelete(expense)}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 min-h-11 text-xs font-medium bg-rose-500/10 text-rose-300 rounded-lg border border-rose-500/20 active:bg-rose-500/20 transition-colors"
                    >
                      <TrashIcon />
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div
            className="relative bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 rounded-2xl border border-gray-700/50 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal decorative top line */}
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>

            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
                    <WalletIcon />
                  </div>
                  <h2 className="text-xl font-bold text-white">
                    {!isOnline ? (editingExpense ? 'تعديل (محلياً)' : 'إضافة (محلياً)') : (editingExpense ? 'تعديل المصروف' : 'إضافة مصروف جديد')}
                  </h2>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 shrink-0 rounded-lg bg-gray-700/50 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                >
                  <CloseIcon />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    الفئة *
                  </label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    الوصف *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="وصف مختصر للمصروف"
                    className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    المبلغ (جنيه) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.amountPiasters / 100}
                    onChange={(e) => setFormData({ ...formData, amountPiasters: Math.round(parseFloat(e.target.value) * 100) })}
                    className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    التاريخ *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                  />
                </div>

                {!isOnline && (
                  <div className="relative overflow-hidden p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <div className="flex items-center gap-2">
                      <OfflineIcon />
                      <p className="text-amber-300 text-sm">
                        سيتم حفظ هذا {editingExpense ? 'التعديل' : 'المصروف'} محلياً وتزامنه عند عودة الاتصال
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className={`flex-1 px-5 py-2.5 text-white rounded-xl font-medium transition-all duration-300 shadow-lg hover:shadow-xl ${
                      !isOnline
                        ? 'bg-gradient-to-r from-amber-600 to-amber-700'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600'
                    }`}
                  >
                    {!isOnline ? 'حفظ محلياً' : (editingExpense ? 'تحديث' : 'إضافة')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
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

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف المصروف"
        description={pendingDelete ? `سيتم حذف "${pendingDelete.description}" (${formatPrice(pendingDelete.amountPiasters)}) نهائياً.` : ''}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
