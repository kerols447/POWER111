import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { addPendingOperation } from '../utils/offlineDb';

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
        fetchExpenses();
      } else {
        alert(data.error || 'حدث خطأ');
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
    alert('تم حفظ المصروف محلياً (سيتم التزامن عند عودة الاتصال)');
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
    alert('تم حفظ التعديل محلياً (سيتم التزامن عند عودة الاتصال)');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return;

    if (!isOnline) {
      const operationId = generateOperationId();
      await addPendingOperation({
        id: operationId,
        type: 'DELETE_EXPENSE',
        payload: { expenseId: id },
        timestamp: Date.now(),
        branchId: selectedBranch,
        userId: user!.id
      });
      alert('تم حفظ الحذف محلياً (سيتم التزامن عند عودة الاتصال)');
      return;
    }

    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await res.json();
      if (data.success || data.id) {
        fetchExpenses();
      } else {
        alert(data.error || 'حدث خطأ');
      }
    } catch (error) {
      console.error('Error deleting expense:', error);
      const operationId = generateOperationId();
      await addPendingOperation({
        id: operationId,
        type: 'DELETE_EXPENSE',
        payload: { expenseId: id },
        timestamp: Date.now(),
        branchId: selectedBranch,
        userId: user!.id
      });
      alert('تم حفظ الحذف محلياً (سيتم التزامن عند عودة الاتصال)');
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
        <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-3 text-yellow-400 text-sm">
          غير متصل بالإنترنت — جميع العمليات تُحفظ محلياً وتُزامَن تلقائياً عند عودة الاتصال
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">المصروفات</h1>
        <button
          onClick={openAddModal}
          className={`px-4 py-2 text-white rounded-lg transition-colors ${
            !isOnline
              ? 'bg-yellow-600 hover:bg-yellow-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {!isOnline ? 'إضافة محلياً' : 'إضافة مصروف جديد'}
        </button>
      </div>

      {/* Summary */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-sm text-gray-400 mb-1">إجمالي المصروفات</div>
        <div className="text-2xl font-bold text-red-400">{formatPrice(totalExpenses)}</div>
        <div className="text-sm text-gray-500 mt-1">{expenses.length} مصروف</div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Branch Selector */}
          {!singleBranchUser && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                الفرع
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-sm font-medium text-gray-300 mb-2">
              الفئة
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">جميع الفئات</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              بحث
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="وصف المصروف..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">جاري التحميل...</div>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            لا توجد مصروفات. قم بإضافة مصروف جديد للبدء.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                    التاريخ
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                    الفئة
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                    الوصف
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                    المبلغ
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                    الفرع
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-gray-750">
                    <td className="px-4 py-3 text-gray-300">
                      {formatDate(expense.date)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs font-medium bg-gray-700 text-gray-300 rounded">
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white">
                      {expense.description}
                    </td>
                    <td className="px-4 py-3 text-red-400 font-medium">
                      {formatPrice(expense.amountPiasters)}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {expense.branch.name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(expense)}
                          className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDelete(expense.id)}
                          className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
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
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-lg w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                {!isOnline ? (editingExpense ? 'تعديل المصروف (محلياً)' : 'إضافة مصروف (محلياً)') : (editingExpense ? 'تعديل المصروف' : 'إضافة مصروف جديد')}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    الفئة *
                  </label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    الوصف *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="وصف مختصر للمصروف"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    المبلغ (جنيه) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.amountPiasters / 100}
                    onChange={(e) => setFormData({ ...formData, amountPiasters: Math.round(parseFloat(e.target.value) * 100) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    التاريخ *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {!isOnline && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/50 rounded-lg text-yellow-400 text-sm">
                    سيتم حفظ هذا {editingExpense ? 'التعديل' : 'المصروف'} محلياً وتزامنه عند عودة الاتصال
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors ${
                      !isOnline
                        ? 'bg-yellow-600 hover:bg-yellow-700'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {!isOnline ? 'حفظ محلياً' : (editingExpense ? 'تحديث' : 'إضافة')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
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
