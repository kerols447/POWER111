import { useState, useEffect, useRef } from 'react';
import PlansSection from '../components/PlansSection';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { addPendingOperation, getCachedMembersForBranch } from '../utils/offlineDb';

interface Subscription {
  id: string;
  memberId: string;
  planId: string;
  branchId: string;
  startDate: string;
  endDate: string;
  pricePiasters: number;
  paidPiasters: number;
  status: string;
  isFrozen: boolean;
  frozenAt?: string;
  frozenDaysUsed: number;
  notes?: string;
  member: {
    id: string;
    memberCode: string;
    person: { id: string; name: string; phone: string };
  };
  plan: { id: string; name: string; nameAr: string; durationDays: number };
  branch: { id: string; name: string; code: string };
}

interface Branch { id: string; name: string; code: string; }
interface Plan { id: string; branchId: string; name: string; nameAr: string; durationDays: number; pricePiasters: number; isActive: boolean; }
interface Member { id: string; memberCode: string; person: { id: string; name: string; phone: string }; branch: { id: string; name: string; code: string }; }
interface Payment { id: string; amountPiasters: number; method: string; reference?: string; notes?: string; createdAt: string; }

interface SubscriptionDetail extends Subscription {
  member: Member & { person: { id: string; name: string; phone: string; email?: string; gender?: string } };
  plan: Plan & { name: string; nameAr: string; durationDays: number; pricePiasters: number };
  branch: Branch;
  payments: Payment[];
  outstandingPiasters: number;
}

type Tab = 'subscriptions' | 'plans';

function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function SubscriptionsPage() {
  const { user, isOwner } = useAuth();
  const isOnline = useOnlineStatus();
  const [tab, setTab] = useState<Tab>('subscriptions');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;

  // New subscription modal
  const [showNewSub, setShowNewSub] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [discount, setDiscount] = useState(0);
  const [initialPayment, setInitialPayment] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [subNotes, setSubNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Detail modal
  const [selectedSub, setSelectedSub] = useState<SubscriptionDetail | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Payment modal
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Receipt
  const [showReceipt, setShowReceipt] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOnline) {
      fetchSubscriptions();
    }
    fetchBranches();
  }, [page, search, branchFilter, statusFilter, isOnline]);

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), pageSize: '20' });
      if (search) params.set('search', search);
      if (branchFilter) params.set('branchId', branchFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/subscriptions?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSubscriptions(data.data);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (err) {
      console.error('Error fetching subscriptions:', err);
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

  const searchMembers = async (q: string) => {
    if (q.length < 2) { setMemberResults([]); return; }
    if (!isOnline) {
      try {
        const branchId = branchFilter || branches[0]?.id || '';
        if (!branchId) return;
        const cached = await getCachedMembersForBranch(branchId);
        const lq = q.toLowerCase();
        const filtered = cached
          .filter(m => m.name.toLowerCase().includes(lq) || m.phone.includes(q) || m.memberCode.toLowerCase().includes(lq))
          .slice(0, 10)
          .map(m => ({
            id: m.id,
            memberCode: m.memberCode,
            person: { id: m.id, name: m.name, phone: m.phone },
            branch: branches.find(b => b.id === m.branchId) || { id: m.branchId, name: '', code: '' }
          } as Member));
        setMemberResults(filtered);
      } catch { /* ignore */ }
      return;
    }
    try {
      const res = await fetch(`/api/members?search=${encodeURIComponent(q)}&pageSize=10`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setMemberResults(data.data);
    } catch (err) {
      console.error('Error searching members:', err);
    }
  };

  const openNewSubscription = async () => {
    setError('');
    setSelectedMember(null);
    setSelectedPlan(null);
    setMemberSearch('');
    setMemberResults([]);
    setDiscount(0);
    setInitialPayment(0);
    setSubNotes('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setShowNewSub(true);
  };

  const selectMember = async (member: Member) => {
    setSelectedMember(member);
    setMemberSearch('');
    setMemberResults([]);
    const branchId = member.branch.id;
    if (!isOnline) {
      try {
        const cached = localStorage.getItem(`plans_cache_${branchId}`);
        if (cached) setPlans(JSON.parse(cached));
      } catch { /* ignore */ }
      return;
    }
    try {
      const res = await fetch(`/api/plans?branchId=${branchId}&isActive=true`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setPlans(data.data);
        try { localStorage.setItem(`plans_cache_${branchId}`, JSON.stringify(data.data)); } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('Error fetching plans:', err);
      try {
        const cached = localStorage.getItem(`plans_cache_${branchId}`);
        if (cached) setPlans(JSON.parse(cached));
      } catch { /* ignore */ }
    }
  };

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !selectedPlan) return;
    setError('');
    setSubmitting(true);

    if (!isOnline) {
      try {
        await addPendingOperation({
          id: generateOperationId(),
          type: 'NEW_SUBSCRIPTION',
          payload: {
            memberId: selectedMember.id,
            planId: selectedPlan.id,
            startDate,
            discountPiasters: Math.round(discount * 100),
            paidPiasters: Math.round(initialPayment * 100),
            paymentMethod,
            notes: subNotes || undefined
          },
          timestamp: Date.now(),
          branchId: selectedMember.branch.id,
          userId: user!.id
        });
        setShowNewSub(false);
        alert('تم حفظ الاشتراك محلياً (سيتم التزامن عند عودة الاتصال)');
      } catch {
        setError('حدث خطأ في الحفظ المحلي');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          memberId: selectedMember.id,
          planId: selectedPlan.id,
          startDate,
          discountPiasters: Math.round(discount * 100),
          paidPiasters: Math.round(initialPayment * 100),
          paymentMethod,
          notes: subNotes || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'حدث خطأ');
        return;
      }

      setShowNewSub(false);
      fetchSubscriptions();
    } catch (err) {
      try {
        await addPendingOperation({
          id: generateOperationId(),
          type: 'NEW_SUBSCRIPTION',
          payload: {
            memberId: selectedMember.id,
            planId: selectedPlan.id,
            startDate,
            discountPiasters: Math.round(discount * 100),
            paidPiasters: Math.round(initialPayment * 100),
            paymentMethod,
            notes: subNotes || undefined
          },
          timestamp: Date.now(),
          branchId: selectedMember.branch.id,
          userId: user!.id
        });
        setShowNewSub(false);
        alert('تم حفظ الاشتراك محلياً (سيتم التزامن عند عودة الاتصال)');
      } catch {
        setError('حدث خطأ في الاتصال');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (sub: Subscription) => {
    if (!isOnline) {
      setSelectedSub({
        ...sub,
        member: sub.member as any,
        plan: sub.plan as any,
        branch: sub.branch,
        payments: [],
        outstandingPiasters: sub.pricePiasters - sub.paidPiasters
      });
      setShowDetail(true);
      return;
    }
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSelectedSub(data.data);
        setShowDetail(true);
      }
    } catch (err) {
      console.error('Error fetching subscription detail:', err);
    }
  };

  const handleRenew = async () => {
    if (!selectedSub) return;
    if (!isOnline) {
      await addPendingOperation({
        id: generateOperationId(),
        type: 'RENEW_SUBSCRIPTION',
        payload: { subscriptionId: selectedSub.id },
        timestamp: Date.now(),
        branchId: selectedSub.branchId,
        userId: user!.id
      });
      setShowDetail(false);
      alert('تم حفظ التجديد محلياً (سيتم التزامن عند عودة الاتصال)');
      return;
    }
    try {
      const res = await fetch(`/api/subscriptions/${selectedSub.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({})
      });
      if (res.ok) {
        setShowDetail(false);
        fetchSubscriptions();
      }
    } catch (err) {
      await addPendingOperation({
        id: generateOperationId(),
        type: 'RENEW_SUBSCRIPTION',
        payload: { subscriptionId: selectedSub.id },
        timestamp: Date.now(),
        branchId: selectedSub.branchId,
        userId: user!.id
      });
      setShowDetail(false);
      alert('تم حفظ التجديد محلياً (سيتم التزامن عند عودة الاتصال)');
    }
  };

  const handleFreeze = async () => {
    if (!selectedSub) return;
    if (!isOnline) {
      await addPendingOperation({
        id: generateOperationId(),
        type: 'FREEZE_SUBSCRIPTION',
        payload: { subscriptionId: selectedSub.id },
        timestamp: Date.now(),
        branchId: selectedSub.branchId,
        userId: user!.id
      });
      setShowDetail(false);
      alert('تم حفظ التجميد محلياً (سيتم التزامن عند عودة الاتصال)');
      return;
    }
    try {
      const res = await fetch(`/api/subscriptions/${selectedSub.id}/freeze`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (res.ok) {
        setShowDetail(false);
        fetchSubscriptions();
      }
    } catch (err) {
      await addPendingOperation({
        id: generateOperationId(),
        type: 'FREEZE_SUBSCRIPTION',
        payload: { subscriptionId: selectedSub.id },
        timestamp: Date.now(),
        branchId: selectedSub.branchId,
        userId: user!.id
      });
      setShowDetail(false);
      alert('تم حفظ التجميد محلياً (سيتم التزامن عند عودة الاتصال)');
    }
  };

  const handleUnfreeze = async () => {
    if (!selectedSub) return;
    if (!isOnline) {
      await addPendingOperation({
        id: generateOperationId(),
        type: 'UNFREEZE_SUBSCRIPTION',
        payload: { subscriptionId: selectedSub.id },
        timestamp: Date.now(),
        branchId: selectedSub.branchId,
        userId: user!.id
      });
      setShowDetail(false);
      alert('تم حفظ إلغاء التجميد محلياً (سيتم التزامن عند عودة الاتصال)');
      return;
    }
    try {
      const res = await fetch(`/api/subscriptions/${selectedSub.id}/unfreeze`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (res.ok) {
        setShowDetail(false);
        fetchSubscriptions();
      }
    } catch (err) {
      await addPendingOperation({
        id: generateOperationId(),
        type: 'UNFREEZE_SUBSCRIPTION',
        payload: { subscriptionId: selectedSub.id },
        timestamp: Date.now(),
        branchId: selectedSub.branchId,
        userId: user!.id
      });
      setShowDetail(false);
      alert('تم حفظ إلغاء التجميد محلياً (سيتم التزامن عند عودة الاتصال)');
    }
  };

  const openPaymentModal = () => {
    if (!selectedSub) return;
    const outstanding = (selectedSub.pricePiasters - selectedSub.paidPiasters) / 100;
    setPayAmount(outstanding);
    setPayMethod('CASH');
    setPayRef('');
    setPayNotes('');
    setShowPayment(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub) return;

    if (!isOnline) {
      await handleOfflinePayment();
      return;
    }

    try {
      const res = await fetch(`/api/subscriptions/${selectedSub.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amountPiasters: Math.round(payAmount * 100),
          method: payMethod,
          reference: payRef || undefined,
          notes: payNotes || undefined
        })
      });

      if (res.ok) {
        setShowPayment(false);
        openDetail(selectedSub);
        fetchSubscriptions();
      }
    } catch (err) {
      console.error('Error recording payment:', err);
      await handleOfflinePayment();
    }
  };

  const handleOfflinePayment = async () => {
    if (!selectedSub) return;
    const operationId = generateOperationId();
    await addPendingOperation({
      id: operationId,
      type: 'PAYMENT',
      payload: {
        subscriptionId: selectedSub.id,
        amountPiasters: Math.round(payAmount * 100),
        method: payMethod,
        reference: payRef || undefined,
        notes: payNotes || undefined,
        paymentTimestamp: new Date().toISOString()
      },
      timestamp: Date.now(),
      branchId: selectedSub.branchId,
      userId: user!.id
    });

    setShowPayment(false);
    setShowDetail(false);
    alert('تم حفظ الدفعة محلياً (سيتم التزامن عند عودة الاتصال)');
  };

  const openReceipt = async () => {
    if (!selectedSub || !isOnline) return;
    try {
      const res = await fetch(`/api/subscriptions/${selectedSub.id}/receipt`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSelectedSub({ ...selectedSub, ...data.data });
        setShowDetail(false);
        setShowReceipt(true);
      }
    } catch (err) {
      console.error('Error fetching receipt:', err);
    }
  };

  const handlePrintReceipt = () => {
    const content = receiptRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl"><head><title>إيصال</title>
      <style>
        body { font-family: 'Cairo', sans-serif; padding: 20px; direction: rtl; }
        .receipt { max-width: 400px; margin: 0 auto; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
        .row { display: flex; justify-content: space-between; padding: 4px 0; }
        .divider { border-top: 1px dashed #999; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: right; }
        th { background: #f5f5f5; }
      </style></head><body>
      ${content.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const formatPrice = (piasters: number) => `${(piasters / 100).toLocaleString('ar-EG')} ج.م`;

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: 'bg-green-500/20 text-green-400 border-green-500/50',
      EXPIRED: 'bg-red-500/20 text-red-400 border-red-500/50',
      FROZEN: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      CANCELLED: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
      PENDING_REVIEW: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
    };
    const labels: Record<string, string> = {
      ACTIVE: 'نشط',
      EXPIRED: 'منتهي',
      FROZEN: 'مجمد',
      CANCELLED: 'ملغي',
      PENDING_REVIEW: 'قيد المراجعة'
    };
    return (
      <span className={`px-2 py-1 rounded text-xs border ${colors[status] || colors.ACTIVE}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = { CASH: 'نقدي', BANK_TRANSFER: 'تحويل بنكي', CARD: 'بطاقة', OTHER: 'أخرى' };
    return labels[method] || method;
  };

  const finalPrice = selectedPlan ? selectedPlan.pricePiasters - Math.round(discount * 100) : 0;

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
          <h1 className="text-2xl font-bold text-white">الاشتراكات</h1>
          <p className="text-gray-400 mt-1">إدارة الاشتراكات والمدفوعات</p>
        </div>
        <button
          onClick={openNewSubscription}
          className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
        >
          + اشتراك جديد
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-dark-border">
        <button
          onClick={() => setTab('subscriptions')}
          className={`px-4 py-2 font-medium transition-colors ${tab === 'subscriptions' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-white'}`}
        >
          الاشتراكات
        </button>
        <button
          onClick={() => setTab('plans')}
          className={`px-4 py-2 font-medium transition-colors ${tab === 'plans' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-white'}`}
        >
          الخطط
        </button>
      </div>

      {tab === 'plans' && <PlansSection />}

      {tab === 'subscriptions' && (
        <>
          {/* Filters */}
          <div className="bg-dark-card border border-dark-border rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input
                type="text"
                placeholder="بحث بالاسم، الهاتف، أو كود العضو..."
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
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
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
                <option value="FROZEN">مجمد</option>
                <option value="CANCELLED">ملغي</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-400">جاري التحميل...</div>
            ) : subscriptions.length === 0 ? (
              <div className="p-8 text-center text-gray-400">لا توجد اشتراكات</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-dark border-b border-dark-border">
                    <tr>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">العضو</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الخطة</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الفرع</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">تاريخ البدء</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">تاريخ الانتهاء</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">السعر</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">المدفوع</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-border">
                    {subscriptions.map(sub => (
                      <tr
                        key={sub.id}
                        onClick={() => openDetail(sub)}
                        className="hover:bg-dark/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-white">{sub.member.person.name}</div>
                          <div className="text-xs text-primary font-mono">{sub.member.memberCode}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">{sub.plan.nameAr}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">{sub.branch.code}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{new Date(sub.startDate).toLocaleDateString('ar-EG')}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{new Date(sub.endDate).toLocaleDateString('ar-EG')}</td>
                        <td className="px-4 py-3 text-sm text-white">{formatPrice(sub.pricePiasters)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={sub.paidPiasters >= sub.pricePiasters ? 'text-green-400' : 'text-yellow-400'}>
                            {formatPrice(sub.paidPiasters)}
                          </span>
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(sub.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-dark border border-dark-border text-white disabled:opacity-50">
                  السابق
                </button>
                <span className="text-sm text-gray-400">صفحة {page} من {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded bg-dark border border-dark-border text-white disabled:opacity-50">
                  التالي
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* New Subscription Modal */}
      {showNewSub && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">اشتراك جديد</h2>
                <button onClick={() => setShowNewSub(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">{error}</div>}

              <form onSubmit={handleCreateSubscription} className="space-y-4">
                {/* Member selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">العضو *</label>
                  {selectedMember ? (
                    <div className="flex items-center justify-between p-3 bg-dark border border-dark-border rounded-lg">
                      <div>
                        <div className="text-white font-medium">{selectedMember.person.name}</div>
                        <div className="text-xs text-gray-400">{selectedMember.memberCode} — {selectedMember.person.phone}</div>
                      </div>
                      <button type="button" onClick={() => setSelectedMember(null)} className="text-gray-400 hover:text-white text-sm">تغيير</button>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        placeholder="ابحث عن عضو بالاسم أو الهاتف أو الكود..."
                        value={memberSearch}
                        onChange={(e) => { setMemberSearch(e.target.value); searchMembers(e.target.value); }}
                        className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                      />
                      {memberResults.length > 0 && (
                        <div className="mt-2 bg-dark border border-dark-border rounded-lg max-h-40 overflow-y-auto">
                          {memberResults.map(m => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => selectMember(m)}
                              className="w-full text-right px-4 py-2 hover:bg-dark-hover border-b border-dark-border last:border-0"
                            >
                              <div className="text-white text-sm">{m.person.name}</div>
                              <div className="text-xs text-gray-400">{m.memberCode} — {m.person.phone} — {m.branch.code}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Plan selection */}
                {selectedMember && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">الخطة *</label>
                    {plans.length === 0 ? (
                      <div className="text-sm text-yellow-400">لا توجد خطط مفعلة لهذا الفرع</div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {plans.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setSelectedPlan(p); setInitialPayment(p.pricePiasters / 100); }}
                            className={`p-3 rounded-lg border text-right transition-colors ${selectedPlan?.id === p.id ? 'bg-primary/20 border-primary text-white' : 'bg-dark border-dark-border text-gray-300 hover:border-primary'}`}
                          >
                            <div className="font-medium text-sm">{p.nameAr}</div>
                            <div className="text-xs text-gray-400 mt-1">{p.durationDays} يوم — {formatPrice(p.pricePiasters)}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedPlan && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">تاريخ البدء</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">خصم (ج.م)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={discount}
                          onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                          className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">السعر بعد الخصم</label>
                        <div className="px-4 py-2 bg-dark border border-dark-border rounded-lg text-white font-medium">
                          {formatPrice(finalPrice)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">الدفعة الأولى (ج.م)</label>
                        <input
                          type="number"
                          min="0"
                          max={finalPrice / 100}
                          step="0.01"
                          value={initialPayment}
                          onChange={(e) => setInitialPayment(parseFloat(e.target.value) || 0)}
                          className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">طريقة الدفع</label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                        >
                          <option value="CASH">نقدي</option>
                          <option value="BANK_TRANSFER">تحويل بنكي</option>
                          <option value="CARD">بطاقة</option>
                          <option value="OTHER">أخرى</option>
                        </select>
                      </div>
                    </div>

                    {initialPayment * 100 < finalPrice && (
                      <div className="p-3 bg-yellow-500/10 border border-yellow-500/50 rounded-lg text-yellow-400 text-sm">
                        المتبقي: {formatPrice(finalPrice - Math.round(initialPayment * 100))}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">ملاحظات</label>
                      <input
                        type="text"
                        value={subNotes}
                        onChange={(e) => setSubNotes(e.target.value)}
                        className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowNewSub(false)} className="flex-1 py-2 bg-dark border border-dark-border text-white rounded-lg hover:bg-dark/80">
                    إلغاء
                  </button>
                  <button type="submit" disabled={!selectedMember || !selectedPlan || submitting} className={`flex-1 py-2 text-white rounded-lg disabled:opacity-50 ${!isOnline ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-primary hover:bg-primary-dark'}`}>
                    {submitting ? 'جاري الحفظ...' : !isOnline ? 'حفظ محلياً' : 'حفظ'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && selectedSub && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">تفاصيل الاشتراك</h2>
                <button onClick={() => setShowDetail(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-dark rounded-lg">
                  <div className="text-xs text-gray-400">العضو</div>
                  <div className="text-white font-medium">{selectedSub.member.person.name}</div>
                  <div className="text-xs text-primary font-mono">{selectedSub.member.memberCode}</div>
                </div>
                <div className="p-3 bg-dark rounded-lg">
                  <div className="text-xs text-gray-400">الهاتف</div>
                  <div className="text-white">{selectedSub.member.person.phone}</div>
                </div>
                <div className="p-3 bg-dark rounded-lg">
                  <div className="text-xs text-gray-400">الخطة</div>
                  <div className="text-white font-medium">{selectedSub.plan.nameAr}</div>
                  <div className="text-xs text-gray-400">{selectedSub.plan.durationDays} يوم</div>
                </div>
                <div className="p-3 bg-dark rounded-lg">
                  <div className="text-xs text-gray-400">الفرع</div>
                  <div className="text-white">{selectedSub.branch.name}</div>
                </div>
                <div className="p-3 bg-dark rounded-lg">
                  <div className="text-xs text-gray-400">تاريخ البدء</div>
                  <div className="text-white">{new Date(selectedSub.startDate).toLocaleDateString('ar-EG')}</div>
                </div>
                <div className="p-3 bg-dark rounded-lg">
                  <div className="text-xs text-gray-400">تاريخ الانتهاء</div>
                  <div className="text-white">{new Date(selectedSub.endDate).toLocaleDateString('ar-EG')}</div>
                </div>
              </div>

              {/* Financial summary */}
              <div className="p-4 bg-dark rounded-lg mb-6">
                <h3 className="text-sm font-medium text-gray-400 mb-3">الملخص المالي</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300">السعر الإجمالي</span>
                    <span className="text-white font-medium">{formatPrice(selectedSub.pricePiasters)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">المدفوع</span>
                    <span className="text-green-400 font-medium">{formatPrice(selectedSub.paidPiasters)}</span>
                  </div>
                  <div className="flex justify-between border-t border-dark-border pt-2">
                    <span className="text-gray-300">المتبقي</span>
                    <span className={`font-medium ${selectedSub.outstandingPiasters > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {formatPrice(selectedSub.outstandingPiasters)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 mb-6">
                {selectedSub.outstandingPiasters > 0 && (
                  <button onClick={openPaymentModal} className="px-3 py-2 bg-green-500/20 text-green-400 border border-green-500/50 rounded-lg hover:bg-green-500/30 text-sm">
                    {!isOnline ? 'تسجيل دفعة (محلياً)' : 'تسجيل دفعة'}
                  </button>
                )}
                {selectedSub.status === 'ACTIVE' && !selectedSub.isFrozen && (
                  <button onClick={handleFreeze} className="px-3 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded-lg hover:bg-blue-500/30 text-sm">
                    {!isOnline ? 'تجميد (محلياً)' : 'تجميد'}
                  </button>
                )}
                {selectedSub.isFrozen && (
                  <button onClick={handleUnfreeze} className="px-3 py-2 bg-green-500/20 text-green-400 border border-green-500/50 rounded-lg hover:bg-green-500/30 text-sm">
                    {!isOnline ? 'إلغاء التجميد (محلياً)' : 'إلغاء التجميد'}
                  </button>
                )}
                <button onClick={handleRenew} className="px-3 py-2 bg-primary/20 text-primary border border-primary/50 rounded-lg hover:bg-primary/30 text-sm">
                  {!isOnline ? 'تجديد (محلياً)' : 'تجديد'}
                </button>
                <button onClick={openReceipt} className="px-3 py-2 bg-gray-500/20 text-gray-400 border border-gray-500/50 rounded-lg hover:bg-gray-500/30 text-sm">
                  إيصال
                </button>
              </div>

              {/* Payments history */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3">سجل المدفوعات</h3>
                {!isOnline && selectedSub.payments.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">سجل المدفوعات غير متاح بدون اتصال</div>
                ) : selectedSub.payments.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">لا توجد مدفوعات</div>
                ) : (
                  <div className="space-y-2">
                    {selectedSub.payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-dark rounded-lg">
                        <div>
                          <div className="text-white text-sm font-medium">{formatPrice(p.amountPiasters)}</div>
                          <div className="text-xs text-gray-400">{getMethodLabel(p.method)} {p.reference ? `— ${p.reference}` : ''}</div>
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(p.createdAt).toLocaleDateString('ar-EG')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && selectedSub && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-dark-card border border-dark-border rounded-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">
                  {!isOnline ? 'تسجيل دفعة (محلياً)' : 'تسجيل دفعة'}
                </h2>
                <button onClick={() => setShowPayment(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              {!isOnline && (
                <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/50 rounded-lg text-yellow-400 text-sm">
                  سيتم حفظ الدفعة محلياً وتزامنها تلقائياً عند عودة الاتصال
                </div>
              )}

              <div className="mb-4 p-3 bg-dark rounded-lg">
                <div className="text-xs text-gray-400">المتبقي</div>
                <div className="text-yellow-400 font-bold text-lg">{formatPrice(selectedSub.pricePiasters - selectedSub.paidPiasters)}</div>
              </div>

              <form onSubmit={handleRecordPayment} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">المبلغ (ج.م) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">طريقة الدفع *</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                  >
                    <option value="CASH">نقدي</option>
                    <option value="BANK_TRANSFER">تحويل بنكي</option>
                    <option value="CARD">بطاقة</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">رقم المرجع</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="رقم العملية أو التحويل"
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">ملاحظات</label>
                  <input
                    type="text"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowPayment(false)} className="flex-1 py-2 bg-dark border border-dark-border text-white rounded-lg hover:bg-dark/80">
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className={`flex-1 py-2 text-white rounded-lg ${
                      !isOnline ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-primary hover:bg-primary-dark'
                    }`}
                  >
                    {!isOnline ? 'حفظ محلياً' : 'تسجيل'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Receipt */}
      {showReceipt && selectedSub && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6" ref={receiptRef} dir="rtl">
              <div className="text-center border-b-2 border-gray-800 pb-4 mb-4">
                <h2 className="text-xl font-bold text-gray-800">POWER 111</h2>
                <p className="text-sm text-gray-600">إيصال اشتراك</p>
                <p className="text-xs text-gray-500 mt-1">{new Date().toLocaleDateString('ar-EG')}</p>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">العضو:</span>
                  <span className="font-medium text-gray-800">{selectedSub.member.person.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">الكود:</span>
                  <span className="font-mono text-gray-800">{selectedSub.member.memberCode}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">الهاتف:</span>
                  <span className="text-gray-800">{selectedSub.member.person.phone}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">الخطة:</span>
                  <span className="font-medium text-gray-800">{selectedSub.plan.nameAr}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">الفرع:</span>
                  <span className="text-gray-800">{selectedSub.branch.name}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-400 pt-3 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">من:</span>
                  <span className="text-gray-800">{new Date(selectedSub.startDate).toLocaleDateString('ar-EG')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">إلى:</span>
                  <span className="text-gray-800">{new Date(selectedSub.endDate).toLocaleDateString('ar-EG')}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-400 pt-3 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">السعر:</span>
                  <span className="font-medium text-gray-800">{formatPrice(selectedSub.pricePiasters)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">المدفوع:</span>
                  <span className="font-medium text-green-600">{formatPrice(selectedSub.paidPiasters)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-gray-700">المتبقي:</span>
                  <span className={(selectedSub.pricePiasters - selectedSub.paidPiasters) > 0 ? 'text-red-600' : 'text-green-600'}>
                    {formatPrice(selectedSub.pricePiasters - selectedSub.paidPiasters)}
                  </span>
                </div>
              </div>

              {selectedSub.payments && selectedSub.payments.length > 0 && (
                <div className="border-t border-dashed border-gray-400 pt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="text-right py-1 text-gray-600">المبلغ</th>
                        <th className="text-right py-1 text-gray-600">الطريقة</th>
                        <th className="text-right py-1 text-gray-600">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSub.payments.map(p => (
                        <tr key={p.id} className="border-b border-gray-200">
                          <td className="py-1 text-gray-800">{formatPrice(p.amountPiasters)}</td>
                          <td className="py-1 text-gray-600">{getMethodLabel(p.method)}</td>
                          <td className="py-1 text-gray-600">{new Date(p.createdAt).toLocaleDateString('ar-EG')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border-t-2 border-gray-800 pt-3 mt-4 text-center text-xs text-gray-500">
                شكراً لاشتراككم معنا
              </div>
            </div>

            <div className="p-4 border-t border-dark-border flex gap-3">
              <button onClick={() => setShowReceipt(false)} className="flex-1 py-2 bg-dark border border-dark-border text-white rounded-lg hover:bg-dark/80">
                إغلاق
              </button>
              <button onClick={handlePrintReceipt} className="flex-1 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg">
                طباعة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SubscriptionsPage;
