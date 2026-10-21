import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { addPendingOperation } from '../utils/offlineDb';
import { localDate } from '../utils/dates';
import ConfirmDialog from '../components/ConfirmDialog';
import NoticeBanner from '../components/NoticeBanner';
import {
  PageHeader, StatTile, SectionTitle, Badge, Btn, Picker, SearchField,
  TableShell, Th, Td, Row, ListCard, EmptyState, Loading, Modal, Field,
  UiIcon, CARD, FIELD, TONE, OfflineBanner
} from '../components/ui';

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

// Offline marker stays drawn on its own — it is the one signal the owner must never mistake for anything else.
const OfflineIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M12 12h.01M8.464 8.464l-2.828-2.828M15.536 15.536l2.828 2.828" />
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
    date: localDate()
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
      date: localDate()
    });
    setShowModal(true);
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      category: expense.category,
      description: expense.description,
      amountPiasters: expense.amountPiasters,
      date: localDate(new Date(expense.date))
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
    return date.toLocaleDateString('ar-EG-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amountPiasters, 0);

  return (
    <div className="space-y-5 sm:space-y-7" dir="rtl">
      {/* Offline Banner */}
      {!isOnline && <OfflineBanner />}

      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {/* Header */}
      <PageHeader
        icon="expenses"
        title="المصروفات"
        caption="إدارة مصروفات الفروع"
        tone={TONE.expenses}
        actions={
          <Btn icon="plus" variant="primary" onClick={openAddModal}>
            {!isOnline ? 'إضافة محلياً' : 'إضافة مصروف جديد'}
          </Btn>
        }
      />

      {/* Summary Tiles — the whole fetched branch dataset, not a page slice */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          icon="expenses"
          tone={TONE.expenses}
          label="إجمالي المصروفات"
          value={formatPrice(totalExpenses)}
          caption={`${expenses.length} مصروف`}
        />
        <StatTile
          icon="wallet"
          tone={TONE.neutral}
          label="مصروف"
          value={expenses.length}
        />
      </div>

      {/* Filters */}
      <div className={`${CARD} p-4 sm:p-5`}>
        <div className="mb-4">
          <SectionTitle tone={TONE.expenses}>التصفية والبحث</SectionTitle>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {!singleBranchUser && (
            <Picker
              value={selectedBranch}
              onChange={(v) => setSelectedBranch(v)}
              ariaLabel="الفرع"
              className="w-full"
              options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            />
          )}
          <Picker
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v)}
            ariaLabel="الفئة"
            className="w-full"
            options={[
              { value: '', label: 'جميع الفئات' },
              ...CATEGORIES.map((cat) => ({ value: cat, label: cat }))
            ]}
          />
          <SearchField
            value={search}
            onChange={(v) => setSearch(v)}
            placeholder="وصف المصروف..."
            className="w-full"
          />
        </div>
      </div>

      {/* Expenses Table */}
      <div className={`${CARD} overflow-hidden`}>
        {loading ? (
          <Loading />
        ) : expenses.length === 0 ? (
          <EmptyState
            icon="expenses"
            title="لا توجد مصروفات"
            hint="قم بإضافة مصروف جديد للبدء"
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block">
              <TableShell
                head={
                  <>
                    <Th>التاريخ</Th>
                    <Th>الفئة</Th>
                    <Th>الوصف</Th>
                    <Th>المبلغ</Th>
                    <Th className="hidden lg:table-cell">الفرع</Th>
                    <Th>إجراءات</Th>
                  </>
                }
              >
                {expenses.map((expense) => (
                  <Row key={expense.id}>
                    <Td>
                      <span className="text-sm text-gray-300">{formatDate(expense.date)}</span>
                    </Td>
                    <Td>
                      <Badge tone="gold">{expense.category}</Badge>
                    </Td>
                    <Td>
                      <span className="text-sm text-white">{expense.description}</span>
                    </Td>
                    <Td>
                      <span className="text-sm font-semibold text-rose-400">{formatPrice(expense.amountPiasters)}</span>
                    </Td>
                    <Td className="hidden lg:table-cell">
                      <span className="text-sm text-gray-300">{expense.branch.name}</span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(expense)}
                          className="inline-flex items-center gap-1.5 px-2.5 xl:px-3 min-h-[44px] sm:min-h-[36px] bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-lg border border-primary/20 hover:border-primary/40 transition-colors"
                        >
                          <UiIcon name="edit" className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">تعديل</span>
                        </button>
                        <button
                          onClick={() => setPendingDelete(expense)}
                          className="inline-flex items-center gap-1.5 px-2.5 xl:px-3 min-h-[44px] sm:min-h-[36px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg border border-rose-500/20 hover:border-rose-500/40 transition-colors"
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

            {/* Mobile Cards */}
            <div className="sm:hidden p-3 space-y-3">
              {expenses.map((expense) => (
                <ListCard key={expense.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white leading-snug">{expense.description}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge tone="gold">{expense.category}</Badge>
                        <span className="text-xs text-gray-500">{formatDate(expense.date)}</span>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-rose-400 flex-shrink-0">
                      {formatPrice(expense.amountPiasters)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-dark-border/30">
                    <span className="text-xs text-gray-500 truncate">{expense.branch.name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => openEditModal(expense)}
                        className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg bg-primary/10 text-primary text-xs font-semibold border border-primary/20"
                      >
                        <UiIcon name="edit" className="w-3.5 h-3.5" />
                        تعديل
                      </button>
                      <button
                        onClick={() => setPendingDelete(expense)}
                        className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg bg-rose-500/10 text-rose-400 text-xs font-semibold border border-rose-500/20"
                      >
                        <UiIcon name="trash" className="w-3.5 h-3.5" />
                        حذف
                      </button>
                    </div>
                  </div>
                </ListCard>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={showModal}
        width="max-w-lg"
        title={!isOnline ? (editingExpense ? 'تعديل (محلياً)' : 'إضافة (محلياً)') : (editingExpense ? 'تعديل المصروف' : 'إضافة مصروف جديد')}
        onClose={() => setShowModal(false)}
        footer={
          <>
            <Btn type="submit" form="expense-form" variant="primary">
              {!isOnline ? 'حفظ محلياً' : (editingExpense ? 'تحديث' : 'إضافة')}
            </Btn>
            <Btn type="button" variant="ghost" onClick={() => setShowModal(false)}>
              إلغاء
            </Btn>
          </>
        }
      >
        <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
          <Field label="الفئة" required>
            <Picker
              value={formData.category}
              onChange={(v) => setFormData({ ...formData, category: v })}
              ariaLabel="الفئة"
              className="w-full"
              options={CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
            />
          </Field>

          <Field label="الوصف" required>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="وصف مختصر للمصروف"
              className={FIELD}
            />
          </Field>

          <Field label="المبلغ (جنيه)" required>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={formData.amountPiasters / 100}
              onChange={(e) => setFormData({ ...formData, amountPiasters: Math.round(parseFloat(e.target.value) * 100) })}
              className={FIELD}
            />
          </Field>

          <Field label="التاريخ" required>
            <input
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className={FIELD}
            />
          </Field>

          {!isOnline && (
            <div className="p-4 bg-primary/10 border border-primary/30 rounded-xl">
              <div className="flex items-center gap-2 text-primary">
                <OfflineIcon />
                <p className="text-sm">
                  سيتم حفظ هذا {editingExpense ? 'التعديل' : 'المصروف'} محلياً وتزامنه عند عودة الاتصال
                </p>
              </div>
            </div>
          )}
        </form>
      </Modal>

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
