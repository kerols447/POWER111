import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import PlansSection from '../components/PlansSection';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { addPendingOperation, getCachedMembersForBranch } from '../utils/offlineDb';
import { arDate, localDate } from '../utils/dates';
import { displayPhone } from '../utils/whatsapp';
import NoticeBanner from '../components/NoticeBanner';
import {
  Badge, Btn, CARD, EmptyState, FIELD, Field, ListCard, Loading, Modal, OfflineBanner, PageHeader, Row,
  Picker, SearchField, SectionTitle, Segmented, TableShell, Td, Th, TONE, UiIcon
} from '../components/ui';

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

/* ───────────── Local icons with no kit equivalent ───────────── */

const IconSnowflake = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20m0-20l-3 3m3-3l3 3m-3 17l-3-3m3 3l3-3M2 12h20M2 12l3-3m-3 3l3 3m17-3l-3-3m3 3l-3 3" />
  </svg>
);

/* ───────────── Main Component ───────────── */

function SubscriptionsPage() {
  const { user, isOwner } = useAuth();
  const isOnline = useOnlineStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const presetMemberHandled = useRef(false);
  const [tab, setTab] = useState<Tab>('subscriptions');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;

  // New subscription modal
  const [showNewSub, setShowNewSub] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [startDate, setStartDate] = useState(localDate);
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

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

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
    setStartDate(localDate());
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

  // Arriving from a member's page (/admin/subscriptions?member=…) opens the form with
  // that member and his branch's plans already loaded, so nobody searches him again.
  useEffect(() => {
    const memberId = searchParams.get('member');
    if (!memberId || presetMemberHandled.current) return;
    presetMemberHandled.current = true;

    const openForMember = async () => {
      await openNewSubscription();
      try {
        const res = await fetch(`/api/members/${memberId}`, { credentials: 'include' });
        const data = await res.json();
        if (res.ok && data.data) {
          await selectMember(data.data);
        } else {
          setError('مش قادر يحمّل بيانات العضو — اختاره من البحث');
        }
      } catch {
        setError('مش قادر يحمّل بيانات العضو — اختاره من البحث');
      }
      setSearchParams({}, { replace: true });
    };
    openForMember();
  }, [searchParams]);

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
        setNotice({ kind: 'ok', text: 'تم حفظ الاشتراك محلياً (سيتم التزامن عند عودة الاتصال)' });
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
        setNotice({ kind: 'ok', text: 'تم حفظ الاشتراك محلياً (سيتم التزامن عند عودة الاتصال)' });
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
      setNotice({ kind: 'ok', text: 'تم حفظ التجديد محلياً (سيتم التزامن عند عودة الاتصال)' });
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
      setNotice({ kind: 'ok', text: 'تم حفظ التجديد محلياً (سيتم التزامن عند عودة الاتصال)' });
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
      setNotice({ kind: 'ok', text: 'تم حفظ التجميد محلياً (سيتم التزامن عند عودة الاتصال)' });
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
      setNotice({ kind: 'ok', text: 'تم حفظ التجميد محلياً (سيتم التزامن عند عودة الاتصال)' });
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
      setNotice({ kind: 'ok', text: 'تم حفظ إلغاء التجميد محلياً (سيتم التزامن عند عودة الاتصال)' });
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
      setNotice({ kind: 'ok', text: 'تم حفظ إلغاء التجميد محلياً (سيتم التزامن عند عودة الاتصال)' });
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
    setNotice({ kind: 'ok', text: 'تم حفظ الدفعة محلياً (سيتم التزامن عند عودة الاتصال)' });
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

  const formatPrice = (piasters: number) => `${(piasters / 100).toLocaleString('ar-EG-u-nu-latn')} ج.م`;

  const getStatusBadge = (status: string) => {
    const config: Record<string, { tone: 'gold' | 'green' | 'red' | 'amber' | 'gray'; dot: string; label: string }> = {
      ACTIVE: { tone: 'green', dot: 'bg-emerald-400', label: 'نشط' },
      EXPIRED: { tone: 'red', dot: 'bg-rose-400', label: 'منتهي' },
      FROZEN: { tone: 'gold', dot: 'bg-primary', label: 'مجمد' },
      CANCELLED: { tone: 'gray', dot: 'bg-gray-400', label: 'ملغي' },
      PENDING_REVIEW: { tone: 'amber', dot: 'bg-amber-400', label: 'قيد المراجعة' }
    };
    const c = config[status] || config.ACTIVE;
    return (
      <Badge tone={c.tone}>
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
        {c.label}
      </Badge>
    );
  };

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = { CASH: 'نقدي', BANK_TRANSFER: 'تحويل بنكي', CARD: 'بطاقة', OTHER: 'أخرى' };
    return labels[method] || method;
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'CASH': return <UiIcon name="wallet" className="w-4 h-4" />;
      case 'CARD': return <UiIcon name="expenses" className="w-4 h-4" />;
      default: return <UiIcon name="expenses" className="w-4 h-4" />;
    }
  };

  const finalPrice = selectedPlan ? selectedPlan.pricePiasters - Math.round(discount * 100) : 0;

  // Calculate progress percentage for payment
  const getPaymentProgress = (paid: number, total: number) => {
    if (total === 0) return 100;
    return Math.min(100, Math.round((paid / total) * 100));
  };

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* Offline Banner */}
      {!isOnline && <OfflineBanner />}

      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {/* Header */}
      <PageHeader
        icon="subscriptions"
        title="الاشتراكات"
        caption="إدارة الاشتراكات والمدفوعات"
        actions={
          <Btn variant="primary" icon="plus" onClick={openNewSubscription}>
            اشتراك جديد
          </Btn>
        }
      />

      {/* Tabs */}
      <Segmented
        value={tab}
        onChange={setTab}
        ariaLabel="أقسام الاشتراكات"
        options={[
          { key: 'subscriptions', label: 'الاشتراكات' },
          { key: 'plans', label: 'الخطط' }
        ]}
      />

      {tab === 'plans' && <PlansSection />}

      {tab === 'subscriptions' && (
        <>
          {/* Filters */}
          <div className={`${CARD} p-4 sm:p-5`}>
            <div className="mb-3 sm:mb-4">
              <SectionTitle>تصفية النتائج</SectionTitle>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <SearchField
                value={search}
                onChange={(v) => { setSearch(v); setPage(1); }}
                placeholder="بحث بالاسم، الهاتف، أو كود العضو..."
                className="w-full"
              />
              {!singleBranchUser && (
                <Picker
                  value={branchFilter}
                  onChange={(v) => { setBranchFilter(v); setPage(1); }}
                  ariaLabel="تصفية بالفرع"
                  className="w-full"
                  options={[
                    { value: '', label: 'كل الفروع' },
                    ...branches.map(b => ({ value: b.id, label: b.name }))
                  ]}
                />
              )}
              <Picker
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1); }}
                ariaLabel="تصفية بالحالة"
                className="w-full"
                options={[
                  { value: '', label: 'كل الحالات' },
                  { value: 'ACTIVE', label: 'نشط' },
                  { value: 'EXPIRED', label: 'منتهي' },
                  { value: 'FROZEN', label: 'مجمد' },
                  { value: 'CANCELLED', label: 'ملغي' }
                ]}
              />
            </div>
          </div>

          {/* Table / Cards */}
          <div className={`${CARD} overflow-hidden`}>
            {loading ? (
              <Loading />
            ) : subscriptions.length === 0 ? (
              <EmptyState icon="subscriptions" title="لا توجد اشتراكات" />
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block">
                  <TableShell
                    minWidth="min-w-[860px]"
                    head={
                      <>
                        <Th>العضو</Th>
                        <Th>الخطة</Th>
                        <Th>الفرع</Th>
                        <Th className="hidden xl:table-cell">تاريخ البدء</Th>
                        <Th>تاريخ الانتهاء</Th>
                        <Th>السعر</Th>
                        <Th>المدفوع</Th>
                        <Th>الحالة</Th>
                      </>
                    }
                  >
                    {subscriptions.map(sub => {
                      const progress = getPaymentProgress(sub.paidPiasters, sub.pricePiasters);
                      return (
                        <Row key={sub.id} onClick={() => openDetail(sub)}>
                          <Td>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                                <UiIcon name="member" className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-white">{sub.member.person.name}</div>
                                <div className="text-xs text-primary/70 font-mono">{sub.member.memberCode}</div>
                              </div>
                            </div>
                          </Td>
                          <Td>
                            <span className="text-sm text-gray-200 font-medium">{sub.plan.nameAr}</span>
                          </Td>
                          <Td>
                            <span className="inline-flex items-center gap-1.5 text-sm text-gray-300">
                              <UiIcon name="branches" className="w-3.5 h-3.5 text-gray-500" />
                              {sub.branch.code}
                            </span>
                          </Td>
                          <Td className="hidden xl:table-cell">
                            <div className="flex items-center gap-1.5 text-sm text-gray-400">
                              <UiIcon name="calendar" className="w-3.5 h-3.5 text-gray-500" />
                              {arDate(sub.startDate)}
                            </div>
                          </Td>
                          <Td>
                            <div className="flex items-center gap-1.5 text-sm text-gray-400">
                              <UiIcon name="clock" className="w-3.5 h-3.5 text-gray-500" />
                              {arDate(sub.endDate)}
                            </div>
                          </Td>
                          <Td className="text-sm font-semibold text-white">{formatPrice(sub.pricePiasters)}</Td>
                          <Td>
                            <div className="space-y-1">
                              <span className={`text-sm font-medium ${progress >= 100 ? 'text-emerald-400' : 'text-primary'}`}>
                                {formatPrice(sub.paidPiasters)}
                              </span>
                              <div className="w-16 h-1 bg-dark rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-colors ${progress >= 100 ? 'bg-emerald-400' : 'bg-primary'}`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          </Td>
                          <Td>{getStatusBadge(sub.status)}</Td>
                        </Row>
                      );
                    })}
                  </TableShell>
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden p-3 space-y-3">
                  {subscriptions.map(sub => {
                    const progress = getPaymentProgress(sub.paidPiasters, sub.pricePiasters);
                    return (
                      <ListCard key={sub.id} onClick={() => openDetail(sub)}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
                              <UiIcon name="member" className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white truncate">{sub.member.person.name}</div>
                              <div className="text-xs text-primary/70 font-mono">{sub.member.memberCode}</div>
                            </div>
                          </div>
                          {getStatusBadge(sub.status)}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-gray-400">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-dark border border-dark-border rounded-lg">
                            <UiIcon name="products" className="w-3 h-3" />
                            {sub.plan.nameAr}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-dark border border-dark-border rounded-lg">
                            <UiIcon name="branches" className="w-3 h-3" />
                            {sub.branch.code}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                          <div className="flex items-center gap-1">
                            <UiIcon name="calendar" className="w-3 h-3" />
                            {arDate(sub.startDate)}
                          </div>
                          <UiIcon name="chevronLeft" className="w-3 h-3 text-gray-600" />
                          <div className="flex items-center gap-1">
                            <UiIcon name="clock" className="w-3 h-3" />
                            {arDate(sub.endDate)}
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex-1 mr-4">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-500">المدفوع</span>
                              <span className={`text-xs font-semibold ${progress >= 100 ? 'text-emerald-400' : 'text-primary'}`}>
                                {progress}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-dark rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-colors ${progress >= 100 ? 'bg-emerald-400' : 'bg-primary'}`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-left">
                            <div className="text-xs text-gray-500">السعر</div>
                            <div className="text-sm font-bold text-white">{formatPrice(sub.pricePiasters)}</div>
                          </div>
                        </div>
                      </ListCard>
                    );
                  })}
                </div>
              </>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-t border-dark-border">
                <Btn variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  السابق
                </Btn>
                <span className="text-sm text-gray-400 font-medium">
                  صفحة <span className="text-primary font-bold">{page}</span> من <span className="text-white font-bold">{totalPages}</span>
                </span>
                <Btn variant="ghost" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  التالي
                </Btn>
              </div>
            )}
          </div>
        </>
      )}

      {/* ──────── New Subscription Modal ──────── */}
      {showNewSub && (
        <Modal
          open
          title="اشتراك جديد"
          onClose={() => setShowNewSub(false)}
          width="max-w-lg"
          footer={
            <>
              <Btn type="button" variant="ghost" onClick={() => setShowNewSub(false)}>
                إلغاء
              </Btn>
              <Btn
                type="submit"
                form="new-subscription-form"
                variant="primary"
                disabled={!selectedMember || !selectedPlan || submitting}
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    جاري الحفظ...
                  </span>
                ) : !isOnline ? 'حفظ محلياً' : 'حفظ'}
              </Btn>
            </>
          }
        >
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center gap-2">
              <UiIcon name="warning" className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form id="new-subscription-form" onSubmit={handleCreateSubscription} className="space-y-4">
            {/* Member selection */}
            <Field label="العضو" required>
              {selectedMember ? (
                <div className="flex items-center justify-between gap-3 p-3.5 bg-dark border border-dark-border rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <UiIcon name="member" className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-white font-medium text-sm">{selectedMember.person.name}</div>
                      <div className="text-xs text-gray-400">{selectedMember.memberCode}{displayPhone(selectedMember.person.phone) === '—' ? '' : ` — ${selectedMember.person.phone}`}</div>
                    </div>
                  </div>
                  <Btn type="button" variant="ghost" onClick={() => setSelectedMember(null)}>
                    تغيير
                  </Btn>
                </div>
              ) : (
                <div>
                  <SearchField
                    value={memberSearch}
                    onChange={(v) => { setMemberSearch(v); searchMembers(v); }}
                    placeholder="ابحث عن عضو بالاسم أو الهاتف أو الكود..."
                  />
                  {memberResults.length > 0 && (
                    <div className="mt-2 bg-dark-card border border-dark-border rounded-xl max-h-40 overflow-y-auto">
                      {memberResults.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => selectMember(m)}
                          className="w-full text-right px-4 py-3 min-h-[44px] hover:bg-white/[0.03] border-b border-dark-border/40 last:border-0 transition-colors"
                        >
                          <div className="text-white text-sm font-medium">{m.person.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{[m.memberCode, displayPhone(m.person.phone), m.branch.code].filter((v) => v && v !== '—').join(' — ')}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Field>

            {/* Plan selection */}
            {selectedMember && (
              <Field label="الخطة" required>
                {plans.length === 0 ? (
                  <div className="p-3 bg-primary/10 border border-primary/25 rounded-xl text-primary text-sm">
                    لا توجد خطط مفعلة لهذا الفرع
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {plans.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedPlan(p); setInitialPayment(p.pricePiasters / 100); }}
                        className={`p-3.5 min-h-[44px] rounded-xl border text-right transition-colors ${
                          selectedPlan?.id === p.id
                            ? 'bg-primary/10 border-primary/40 text-white'
                            : 'bg-dark border-dark-border text-gray-300 hover:border-primary/30'
                        }`}
                      >
                        <div className="font-semibold text-sm">{p.nameAr}</div>
                        <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                          <span className="flex items-center gap-1"><UiIcon name="clock" className="w-3 h-3" />{p.durationDays} يوم</span>
                          <span>—</span>
                          <span className="text-primary/80 font-medium">{formatPrice(p.pricePiasters)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            )}

            {selectedPlan && (
              <>
                <Field label="تاريخ البدء">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={FIELD}
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="خصم (ج.م)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discount}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      className={FIELD}
                    />
                  </Field>
                  <Field label="السعر بعد الخصم">
                    <div className="px-4 py-2.5 min-h-[44px] flex items-center bg-primary/10 border border-primary/25 rounded-xl text-primary font-bold text-sm">
                      {formatPrice(finalPrice)}
                    </div>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="الدفعة الأولى (ج.م)">
                    <input
                      type="number"
                      min="0"
                      max={finalPrice / 100}
                      step="0.01"
                      value={initialPayment}
                      onChange={(e) => setInitialPayment(parseFloat(e.target.value) || 0)}
                      className={FIELD}
                    />
                  </Field>
                  <Field label="طريقة الدفع">
                    <Picker
                      value={paymentMethod}
                      onChange={setPaymentMethod}
                      ariaLabel="طريقة الدفع"
                      className="w-full"
                      options={[
                        { value: 'CASH', label: 'نقدي' },
                        { value: 'BANK_TRANSFER', label: 'تحويل بنكي' },
                        { value: 'CARD', label: 'بطاقة' },
                        { value: 'OTHER', label: 'أخرى' }
                      ]}
                    />
                  </Field>
                </div>

                {initialPayment * 100 < finalPrice && (
                  <div className="p-3 bg-primary/10 border border-primary/25 rounded-xl flex items-center gap-2">
                    <UiIcon name="wallet" className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-primary text-sm">
                      المتبقي: <span className="font-bold">{formatPrice(finalPrice - Math.round(initialPayment * 100))}</span>
                    </span>
                  </div>
                )}

                <Field label="ملاحظات">
                  <input
                    type="text"
                    value={subNotes}
                    onChange={(e) => setSubNotes(e.target.value)}
                    className={FIELD}
                  />
                </Field>
              </>
            )}
          </form>
        </Modal>
      )}

      {/* ──────── Detail Modal ──────── */}
      {showDetail && selectedSub && (
        <Modal
          open
          title="تفاصيل الاشتراك"
          subtitle={<div className="mt-2">{getStatusBadge(selectedSub.status)}</div>}
          onClose={() => setShowDetail(false)}
          width="max-w-2xl"
          footer={
            <>
              {selectedSub.outstandingPiasters > 0 && (
                <Btn type="button" variant="primary" icon="wallet" onClick={openPaymentModal}>
                  {!isOnline ? 'تسجيل دفعة (محلياً)' : 'تسجيل دفعة'}
                </Btn>
              )}
              {selectedSub.status === 'ACTIVE' && !selectedSub.isFrozen && (
                <Btn type="button" variant="ghost" onClick={handleFreeze}>
                  <IconSnowflake className="w-4 h-4" />
                  {!isOnline ? 'تجميد (محلياً)' : 'تجميد'}
                </Btn>
              )}
              {selectedSub.isFrozen && (
                <Btn type="button" variant="ghost" icon="refresh" onClick={handleUnfreeze}>
                  {!isOnline ? 'إلغاء التجميد (محلياً)' : 'إلغاء التجميد'}
                </Btn>
              )}
              <Btn type="button" variant="ghost" icon="refresh" onClick={handleRenew}>
                {!isOnline ? 'تجديد (محلياً)' : 'تجديد'}
              </Btn>
              <Btn type="button" variant="ghost" icon="print" onClick={openReceipt}>
                إيصال
              </Btn>
            </>
          }
        >
          {/* Info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 bg-dark border border-dark-border rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <UiIcon name="member" className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-500">العضو</span>
              </div>
              <div className="text-white font-semibold text-sm">{selectedSub.member.person.name}</div>
              <div className="text-xs text-primary/70 font-mono mt-0.5">{selectedSub.member.memberCode}</div>
            </div>
            <div className="p-3.5 bg-dark border border-dark-border rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <UiIcon name="phone" className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-500">الهاتف</span>
              </div>
              <div className="text-white text-sm font-medium" dir="ltr">{displayPhone(selectedSub.member.person.phone)}</div>
            </div>
            <div className="p-3.5 bg-dark border border-dark-border rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <UiIcon name="subscriptions" className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-500">الخطة</span>
              </div>
              <div className="text-white font-semibold text-sm">{selectedSub.plan.nameAr}</div>
              <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                <UiIcon name="clock" className="w-3 h-3" />
                {selectedSub.plan.durationDays} يوم
              </div>
            </div>
            <div className="p-3.5 bg-dark border border-dark-border rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <UiIcon name="branches" className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-500">الفرع</span>
              </div>
              <div className="text-white text-sm font-medium">{selectedSub.branch.name}</div>
            </div>
            <div className="p-3.5 bg-dark border border-dark-border rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <UiIcon name="calendar" className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-500">تاريخ البدء</span>
              </div>
              <div className="text-white text-sm">{arDate(selectedSub.startDate)}</div>
            </div>
            <div className="p-3.5 bg-dark border border-dark-border rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <UiIcon name="clock" className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-500">تاريخ الانتهاء</span>
              </div>
              <div className="text-white text-sm">{arDate(selectedSub.endDate)}</div>
            </div>
          </div>

          {/* Financial summary */}
          <div className="p-4 sm:p-5 bg-dark border border-dark-border rounded-xl">
            <SectionTitle>الملخص المالي</SectionTitle>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">السعر الإجمالي</span>
                <span className="text-white font-bold text-sm">{formatPrice(selectedSub.pricePiasters)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm flex items-center gap-1.5">
                  <UiIcon name="check" className="w-3.5 h-3.5 text-emerald-400" />
                  المدفوع
                </span>
                <span className="text-emerald-400 font-bold text-sm">{formatPrice(selectedSub.paidPiasters)}</span>
              </div>
              {/* Progress bar */}
              <div className="py-1">
                <div className="w-full h-2 bg-dark-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-colors duration-700 ${
                      getPaymentProgress(selectedSub.paidPiasters, selectedSub.pricePiasters) >= 100
                        ? 'bg-emerald-400'
                        : 'bg-primary'
                    }`}
                    style={{ width: `${getPaymentProgress(selectedSub.paidPiasters, selectedSub.pricePiasters)}%` }}
                  />
                </div>
                <div className="text-center text-xs text-gray-500 mt-1">
                  {getPaymentProgress(selectedSub.paidPiasters, selectedSub.pricePiasters)}% مكتمل
                </div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-dark-border/40">
                <span className="text-gray-400 text-sm font-medium">المتبقي</span>
                <span className={`font-bold text-base ${selectedSub.outstandingPiasters > 0 ? 'text-primary' : 'text-emerald-400'}`}>
                  {formatPrice(selectedSub.outstandingPiasters)}
                </span>
              </div>
            </div>
          </div>

          {/* Payments history */}
          <div>
            <SectionTitle>سجل المدفوعات</SectionTitle>
            <div className="mt-3">
              {!isOnline && selectedSub.payments.length === 0 ? (
                <EmptyState icon="warning" title="سجل المدفوعات غير متاح بدون اتصال" />
              ) : selectedSub.payments.length === 0 ? (
                <EmptyState icon="wallet" title="لا توجد مدفوعات" />
              ) : (
                <div className="space-y-2">
                  {selectedSub.payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3.5 bg-dark border border-dark-border rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                          {getMethodIcon(p.method)}
                        </div>
                        <div>
                          <div className="text-white text-sm font-semibold">{formatPrice(p.amountPiasters)}</div>
                          <div className="text-xs text-gray-400 flex items-center gap-1.5">
                            <span>{getMethodLabel(p.method)}</span>
                            {p.reference && (
                              <>
                                <span className="text-gray-600">—</span>
                                <span className="font-mono text-gray-500">{p.reference}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <UiIcon name="calendar" className="w-3 h-3" />
                        {arDate(p.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ──────── Payment Modal ──────── */}
      {showPayment && selectedSub && (
        <Modal
          open
          title={!isOnline ? 'تسجيل دفعة (محلياً)' : 'تسجيل دفعة'}
          onClose={() => setShowPayment(false)}
          width="max-w-md"
          footer={
            <>
              <Btn type="button" variant="ghost" onClick={() => setShowPayment(false)}>
                إلغاء
              </Btn>
              <Btn type="submit" form="record-payment-form" variant="primary" icon="wallet">
                {!isOnline ? 'حفظ محلياً' : 'تسجيل'}
              </Btn>
            </>
          }
        >
          {!isOnline && (
            <div className="p-3 bg-primary/10 border border-primary/25 rounded-xl flex items-center gap-2">
              <UiIcon name="warning" className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-primary text-xs sm:text-sm">سيتم حفظ الدفعة محلياً وتزامنها تلقائياً عند عودة الاتصال</span>
            </div>
          )}

          <div className="p-4 bg-primary/10 border border-primary/25 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <UiIcon name="wallet" className="w-4 h-4 text-gray-500" />
              <span className="text-xs text-gray-500">المتبقي</span>
            </div>
            <div className="text-primary font-extrabold text-2xl">{formatPrice(selectedSub.pricePiasters - selectedSub.paidPiasters)}</div>
          </div>

          <form id="record-payment-form" onSubmit={handleRecordPayment} className="space-y-4">
            <Field label="المبلغ (ج.م)" required>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                className={FIELD}
              />
            </Field>
            <Field label="طريقة الدفع" required>
              <Picker
                value={payMethod}
                onChange={setPayMethod}
                ariaLabel="طريقة الدفع"
                className="w-full"
                options={[
                  { value: 'CASH', label: 'نقدي' },
                  { value: 'BANK_TRANSFER', label: 'تحويل بنكي' },
                  { value: 'CARD', label: 'بطاقة' },
                  { value: 'OTHER', label: 'أخرى' }
                ]}
              />
            </Field>
            <Field label="رقم المرجع">
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="رقم العملية أو التحويل"
                className={FIELD}
              />
            </Field>
            <Field label="ملاحظات">
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className={FIELD}
              />
            </Field>
          </form>
        </Modal>
      )}

      {/* ──────── Receipt Modal ──────── */}
      {showReceipt && selectedSub && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setShowReceipt(false);
          }}
        >
          <div className="relative bg-white rounded-2xl max-w-md w-full my-auto shadow-2xl shadow-black/50 overflow-hidden">
            <div className="p-5 sm:p-6" ref={receiptRef} dir="rtl">
              <div className="text-center border-b-2 border-dark-border pb-4 mb-4">
                <h2 className="text-xl font-bold text-gray-800">POWER 111</h2>
                <p className="text-sm text-gray-600 mt-1">إيصال اشتراك</p>
                <p className="text-xs text-gray-500 mt-1">{arDate()}</p>
              </div>

              <div className="space-y-2.5 mb-4">
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
                  <span className="text-gray-800">{displayPhone(selectedSub.member.person.phone)}</span>
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
                  <span className="text-gray-800">{arDate(selectedSub.startDate)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">إلى:</span>
                  <span className="text-gray-800">{arDate(selectedSub.endDate)}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-400 pt-3 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">السعر:</span>
                  <span className="font-medium text-gray-800">{formatPrice(selectedSub.pricePiasters)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">المدفوع:</span>
                  <span className="font-medium text-emerald-600">{formatPrice(selectedSub.paidPiasters)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-gray-700">المتبقي:</span>
                  <span className={(selectedSub.pricePiasters - selectedSub.paidPiasters) > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                    {formatPrice(selectedSub.pricePiasters - selectedSub.paidPiasters)}
                  </span>
                </div>
              </div>

              {selectedSub.payments && selectedSub.payments.length > 0 && (
                <div className="border-t border-dashed border-gray-400 pt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="text-right py-1.5 text-gray-600 font-medium">المبلغ</th>
                        <th className="text-right py-1.5 text-gray-600 font-medium">الطريقة</th>
                        <th className="text-right py-1.5 text-gray-600 font-medium">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSub.payments.map(p => (
                        <tr key={p.id} className="border-b border-gray-200">
                          <td className="py-1.5 text-gray-800">{formatPrice(p.amountPiasters)}</td>
                          <td className="py-1.5 text-gray-600">{getMethodLabel(p.method)}</td>
                          <td className="py-1.5 text-gray-600">{arDate(p.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border-t-2 border-dark-border pt-3 mt-4 text-center text-xs text-gray-500">
                شكراً لاشتراككم معنا
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex gap-3">
              <button
                type="button"
                onClick={() => setShowReceipt(false)}
                className="flex-1 min-h-[44px] py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors text-sm font-medium"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] py-2.5 bg-gradient-to-br from-primary-light to-primary hover:from-primary hover:to-primary-dark text-black rounded-xl transition-colors text-sm font-bold"
              >
                <UiIcon name="print" className="w-4 h-4" />
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
