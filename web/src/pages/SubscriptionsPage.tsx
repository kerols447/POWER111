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

/* ───────────── SVG Icon Components ───────────── */

const IconPlus = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const IconClose = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const IconSearch = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const IconUser = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const IconPhone = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const IconCalendar = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const IconCreditCard = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);

const IconBuilding = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const IconSnowflake = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20m0-20l-3 3m3-3l3 3m-3 17l-3-3m3 3l3-3M2 12h20M2 12l3-3m-3 3l3 3m17-3l-3-3m3 3l-3 3" />
  </svg>
);

const IconRefresh = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const IconReceipt = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
  </svg>
);

const IconPrinter = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
  </svg>
);

const IconChevronLeft = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);

const IconChevronRight = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const IconWifiOff = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
  </svg>
);

const IconTag = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

const IconCash = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconFilter = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const IconClock = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconCheck = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const IconSubscription = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const IconLayers = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
  </svg>
);

const IconSwap = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
  </svg>
);

/* ───────────── Main Component ───────────── */

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
    const config: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
      ACTIVE: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400', label: 'نشط' },
      EXPIRED: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30', dot: 'bg-rose-400', label: 'منتهي' },
      FROZEN: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-400', label: 'مجمد' },
      CANCELLED: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/30', dot: 'bg-gray-400', label: 'ملغي' },
      PENDING_REVIEW: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-400/30', dot: 'bg-amber-300', label: 'قيد المراجعة' }
    };
    const c = config[status] || config.ACTIVE;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse`} />
        {c.label}
      </span>
    );
  };

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = { CASH: 'نقدي', BANK_TRANSFER: 'تحويل بنكي', CARD: 'بطاقة', OTHER: 'أخرى' };
    return labels[method] || method;
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'CASH': return <IconCash className="w-4 h-4" />;
      case 'CARD': return <IconCreditCard className="w-4 h-4" />;
      default: return <IconCreditCard className="w-4 h-4" />;
    }
  };

  const finalPrice = selectedPlan ? selectedPlan.pricePiasters - Math.round(discount * 100) : 0;

  // Calculate progress percentage for payment
  const getPaymentProgress = (paid: number, total: number) => {
    if (total === 0) return 100;
    return Math.min(100, Math.round((paid / total) * 100));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 border border-amber-500/30 rounded-xl p-3 sm:p-4">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-400/10 via-transparent to-transparent" />
          <div className="relative flex items-center gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <IconWifiOff className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-amber-300/90 text-xs sm:text-sm leading-relaxed">
              غير متصل بالإنترنت — جميع العمليات تُحفظ محلياً وتُزامَن تلقائياً عند عودة الاتصال
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-gray-700/50 p-4 sm:p-6 lg:p-8">
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-32 h-32 sm:w-48 sm:h-48 bg-gradient-to-br from-amber-500/10 to-transparent rounded-full -translate-x-1/2 -translate-y-1/2 blur-2xl" />
        <div className="absolute bottom-0 right-0 w-24 h-24 sm:w-36 sm:h-36 bg-gradient-to-tl from-amber-500/5 to-transparent rounded-full translate-x-1/3 translate-y-1/3 blur-xl" />
        <div className="absolute top-1/2 right-1/4 w-1 h-1 bg-amber-400/40 rounded-full" />
        <div className="absolute top-1/3 right-1/3 w-1.5 h-1.5 bg-amber-400/20 rounded-full" />

        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <IconSubscription className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-white via-white to-gray-300 bg-clip-text text-transparent">
                الاشتراكات
              </h1>
              <p className="text-gray-400 text-xs sm:text-sm mt-0.5">إدارة الاشتراكات والمدفوعات</p>
            </div>
          </div>
          <button
            onClick={openNewSubscription}
            className="group relative inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5 active:translate-y-0 text-sm sm:text-base"
          >
            <IconPlus className="w-5 h-5 transition-transform duration-300 group-hover:rotate-90" />
            <span>اشتراك جديد</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-800/50 rounded-xl border border-gray-700/50 w-fit">
        <button
          onClick={() => setTab('subscriptions')}
          className={`relative flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-medium text-sm transition-all duration-300 ${
            tab === 'subscriptions'
              ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-amber-400 shadow-sm'
              : 'text-gray-400 hover:text-white hover:bg-gray-700/30'
          }`}
        >
          <IconSubscription className="w-4 h-4" />
          <span>الاشتراكات</span>
        </button>
        <button
          onClick={() => setTab('plans')}
          className={`relative flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-medium text-sm transition-all duration-300 ${
            tab === 'plans'
              ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-amber-400 shadow-sm'
              : 'text-gray-400 hover:text-white hover:bg-gray-700/30'
          }`}
        >
          <IconLayers className="w-4 h-4" />
          <span>الخطط</span>
        </button>
      </div>

      {tab === 'plans' && <PlansSection />}

      {tab === 'subscriptions' && (
        <>
          {/* Filters */}
          <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700/50 rounded-xl p-4 sm:p-5">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <IconFilter className="w-4 h-4 text-amber-400" />
                </div>
                <h3 className="text-sm font-medium text-gray-300">تصفية النتائج</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <IconSearch className="w-4 h-4 text-gray-500 group-focus-within:text-amber-400 transition-colors" />
                  </div>
                  <input
                    type="text"
                    placeholder="بحث بالاسم، الهاتف، أو كود العضو..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="w-full pr-10 pl-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all duration-200"
                  />
                </div>
                {!singleBranchUser && (
                  <div className="relative">
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <IconBuilding className="w-4 h-4 text-gray-500" />
                    </div>
                    <select
                      value={branchFilter}
                      onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
                      className="w-full pr-10 pl-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all duration-200 appearance-none"
                    >
                      <option value="">كل الفروع</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <IconTag className="w-4 h-4 text-gray-500" />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className="w-full pr-10 pl-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all duration-200 appearance-none"
                  >
                    <option value="">كل الحالات</option>
                    <option value="ACTIVE">نشط</option>
                    <option value="EXPIRED">منتهي</option>
                    <option value="FROZEN">مجمد</option>
                    <option value="CANCELLED">ملغي</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Table / Cards */}
          <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700/50 rounded-xl">
            {loading ? (
              <div className="p-8 sm:p-12 text-center">
                <div className="inline-flex items-center gap-3 px-5 py-3 bg-gray-700/30 rounded-xl border border-gray-600/30">
                  <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
                  <span className="text-gray-400 text-sm">جاري التحميل...</span>
                </div>
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-700/30 flex items-center justify-center">
                  <IconSubscription className="w-8 h-8 text-gray-500" />
                </div>
                <p className="text-gray-400 text-sm">لا توجد اشتراكات</p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700/50">
                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">العضو</th>
                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الخطة</th>
                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الفرع</th>
                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">تاريخ البدء</th>
                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">تاريخ الانتهاء</th>
                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">السعر</th>
                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">المدفوع</th>
                        <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/30">
                      {subscriptions.map(sub => {
                        const progress = getPaymentProgress(sub.paidPiasters, sub.pricePiasters);
                        return (
                          <tr
                            key={sub.id}
                            onClick={() => openDetail(sub)}
                            className="group hover:bg-amber-500/5 cursor-pointer transition-all duration-200"
                          >
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/20 group-hover:border-amber-500/40 transition-colors">
                                  <IconUser className="w-4 h-4 text-amber-400" />
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors">{sub.member.person.name}</div>
                                  <div className="text-xs text-amber-400/70 font-mono">{sub.member.memberCode}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-sm text-gray-200 font-medium">{sub.plan.nameAr}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-1.5 text-sm text-gray-300">
                                <IconBuilding className="w-3.5 h-3.5 text-gray-500" />
                                {sub.branch.code}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1.5 text-sm text-gray-400">
                                <IconCalendar className="w-3.5 h-3.5 text-gray-500" />
                                {new Date(sub.startDate).toLocaleDateString('ar-EG')}
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1.5 text-sm text-gray-400">
                                <IconClock className="w-3.5 h-3.5 text-gray-500" />
                                {new Date(sub.endDate).toLocaleDateString('ar-EG')}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm font-semibold text-white">{formatPrice(sub.pricePiasters)}</td>
                            <td className="px-5 py-4">
                              <div className="space-y-1">
                                <span className={`text-sm font-medium ${progress >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  {formatPrice(sub.paidPiasters)}
                                </span>
                                <div className="w-16 h-1 bg-gray-700/50 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${progress >= 100 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-amber-500 to-amber-400'}`}
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">{getStatusBadge(sub.status)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="lg:hidden divide-y divide-gray-700/30">
                  {subscriptions.map(sub => {
                    const progress = getPaymentProgress(sub.paidPiasters, sub.pricePiasters);
                    return (
                      <div
                        key={sub.id}
                        onClick={() => openDetail(sub)}
                        className="p-4 hover:bg-amber-500/5 cursor-pointer transition-all duration-200 active:bg-amber-500/10"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/20">
                              <IconUser className="w-5 h-5 text-amber-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white truncate">{sub.member.person.name}</div>
                              <div className="text-xs text-amber-400/70 font-mono">{sub.member.memberCode}</div>
                            </div>
                          </div>
                          {getStatusBadge(sub.status)}
                        </div>

                        <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700/30 rounded-md">
                            <IconLayers className="w-3 h-3" />
                            {sub.plan.nameAr}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700/30 rounded-md">
                            <IconBuilding className="w-3 h-3" />
                            {sub.branch.code}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                          <div className="flex items-center gap-1">
                            <IconCalendar className="w-3 h-3" />
                            {new Date(sub.startDate).toLocaleDateString('ar-EG')}
                          </div>
                          <IconChevronLeft className="w-3 h-3 text-gray-600" />
                          <div className="flex items-center gap-1">
                            <IconClock className="w-3 h-3" />
                            {new Date(sub.endDate).toLocaleDateString('ar-EG')}
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex-1 mr-4">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-500">المدفوع</span>
                              <span className={`text-xs font-semibold ${progress >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {progress}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${progress >= 100 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-amber-500 to-amber-400'}`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-left">
                            <div className="text-xs text-gray-500">السعر</div>
                            <div className="text-sm font-bold text-white">{formatPrice(sub.pricePiasters)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-t border-gray-700/50 bg-gray-900/30">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-gray-800/80 border border-gray-700/50 text-white text-sm font-medium disabled:opacity-40 hover:bg-gray-700/80 hover:border-gray-600/50 transition-all duration-200 disabled:hover:bg-gray-800/80"
                >
                  <IconChevronRight className="w-4 h-4" />
                  <span className="hidden sm:inline">السابق</span>
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 font-medium">
                    صفحة <span className="text-amber-400 font-semibold">{page}</span> من <span className="text-gray-300">{totalPages}</span>
                  </span>
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-gray-800/80 border border-gray-700/50 text-white text-sm font-medium disabled:opacity-40 hover:bg-gray-700/80 hover:border-gray-600/50 transition-all duration-200 disabled:hover:bg-gray-800/80"
                >
                  <span className="hidden sm:inline">التالي</span>
                  <IconChevronLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ──────── New Subscription Modal ──────── */}
      {showNewSub && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4" onClick={() => setShowNewSub(false)}>
          <div className="relative bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700/50 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>
            {/* Modal header gradient line */}
            <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 rounded-t-2xl" />

            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <IconPlus className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">اشتراك جديد</h2>
                </div>
                <button onClick={() => setShowNewSub(false)} className="w-8 h-8 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200">
                  <IconClose className="w-4 h-4" />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                    <IconClose className="w-3 h-3" />
                  </div>
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateSubscription} className="space-y-4">
                {/* Member selection */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                    <IconUser className="w-4 h-4 text-amber-400" />
                    العضو *
                  </label>
                  {selectedMember ? (
                    <div className="flex items-center justify-between p-3.5 bg-gray-900/60 border border-gray-700/50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center">
                          <IconUser className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <div className="text-white font-medium text-sm">{selectedMember.person.name}</div>
                          <div className="text-xs text-gray-400">{selectedMember.memberCode} — {selectedMember.person.phone}</div>
                        </div>
                      </div>
                      <button type="button" onClick={() => setSelectedMember(null)} className="text-xs text-amber-400 hover:text-amber-300 font-medium px-2 py-1 rounded-lg hover:bg-amber-500/10 transition-colors">
                        تغيير
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <IconSearch className="w-4 h-4 text-gray-500" />
                        </div>
                        <input
                          type="text"
                          placeholder="ابحث عن عضو بالاسم أو الهاتف أو الكود..."
                          value={memberSearch}
                          onChange={(e) => { setMemberSearch(e.target.value); searchMembers(e.target.value); }}
                          className="w-full pr-10 pl-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                        />
                      </div>
                      {memberResults.length > 0 && (
                        <div className="mt-2 bg-gray-800 border border-gray-700/50 rounded-xl max-h-40 overflow-y-auto shadow-xl">
                          {memberResults.map(m => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => selectMember(m)}
                              className="w-full text-right px-4 py-2.5 hover:bg-amber-500/10 border-b border-gray-700/30 last:border-0 transition-colors"
                            >
                              <div className="text-white text-sm font-medium">{m.person.name}</div>
                              <div className="text-xs text-gray-400 mt-0.5">{m.memberCode} — {m.person.phone} — {m.branch.code}</div>
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
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                      <IconLayers className="w-4 h-4 text-amber-400" />
                      الخطة *
                    </label>
                    {plans.length === 0 ? (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-sm">
                        لا توجد خطط مفعلة لهذا الفرع
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {plans.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setSelectedPlan(p); setInitialPayment(p.pricePiasters / 100); }}
                            className={`p-3.5 rounded-xl border text-right transition-all duration-200 ${
                              selectedPlan?.id === p.id
                                ? 'bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/50 text-white shadow-sm shadow-amber-500/10'
                                : 'bg-gray-900/60 border-gray-700/50 text-gray-300 hover:border-amber-500/30 hover:bg-gray-800/60'
                            }`}
                          >
                            <div className="font-semibold text-sm">{p.nameAr}</div>
                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                              <span className="flex items-center gap-1"><IconClock className="w-3 h-3" />{p.durationDays} يوم</span>
                              <span>—</span>
                              <span className="text-amber-400/80 font-medium">{formatPrice(p.pricePiasters)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedPlan && (
                  <>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                        <IconCalendar className="w-4 h-4 text-amber-400" />
                        تاريخ البدء
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                          <IconTag className="w-4 h-4 text-amber-400" />
                          خصم (ج.م)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={discount}
                          onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                          className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-300 mb-2 block">السعر بعد الخصم</label>
                        <div className="px-4 py-2.5 bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/30 rounded-xl text-amber-300 font-bold text-sm">
                          {formatPrice(finalPrice)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                          <IconCash className="w-4 h-4 text-amber-400" />
                          الدفعة الأولى (ج.م)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={finalPrice / 100}
                          step="0.01"
                          value={initialPayment}
                          onChange={(e) => setInitialPayment(parseFloat(e.target.value) || 0)}
                          className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                          <IconCreditCard className="w-4 h-4 text-amber-400" />
                          طريقة الدفع
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all appearance-none"
                        >
                          <option value="CASH">نقدي</option>
                          <option value="BANK_TRANSFER">تحويل بنكي</option>
                          <option value="CARD">بطاقة</option>
                          <option value="OTHER">أخرى</option>
                        </select>
                      </div>
                    </div>

                    {initialPayment * 100 < finalPrice && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                          <IconTag className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                        <span className="text-amber-300/90 text-sm">
                          المتبقي: <span className="font-bold">{formatPrice(finalPrice - Math.round(initialPayment * 100))}</span>
                        </span>
                      </div>
                    )}

                    <div>
                      <label className="text-sm font-medium text-gray-300 mb-2 block">ملاحظات</label>
                      <input
                        type="text"
                        value={subNotes}
                        onChange={(e) => setSubNotes(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-4 border-t border-gray-700/30">
                  <button type="button" onClick={() => setShowNewSub(false)} className="flex-1 py-2.5 bg-gray-800/80 border border-gray-700/50 text-white rounded-xl hover:bg-gray-700/80 transition-all duration-200 text-sm font-medium">
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={!selectedMember || !selectedPlan || submitting}
                    className={`flex-1 py-2.5 text-white rounded-xl disabled:opacity-40 font-semibold text-sm transition-all duration-200 shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:hover:translate-y-0 ${
                      !isOnline
                        ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 shadow-amber-600/20'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 shadow-amber-500/25'
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

      {/* ──────── Detail Modal ──────── */}
      {showDetail && selectedSub && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4" onClick={() => setShowDetail(false)}>
          <div className="relative bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700/50 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>
            {/* Header gradient bar */}
            <div className="h-1 bg-gradient-to-r from-amber-500 via-emerald-500 to-amber-600 rounded-t-2xl" />

            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <IconSubscription className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white">تفاصيل الاشتراك</h2>
                    <div className="mt-1">{getStatusBadge(selectedSub.status)}</div>
                  </div>
                </div>
                <button onClick={() => setShowDetail(false)} className="w-8 h-8 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200">
                  <IconClose className="w-4 h-4" />
                </button>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <div className="p-3.5 bg-gray-900/60 border border-gray-700/30 rounded-xl hover:border-gray-600/50 transition-colors group">
                  <div className="flex items-center gap-2 mb-1">
                    <IconUser className="w-3.5 h-3.5 text-amber-400/60 group-hover:text-amber-400 transition-colors" />
                    <span className="text-xs text-gray-500">العضو</span>
                  </div>
                  <div className="text-white font-semibold text-sm">{selectedSub.member.person.name}</div>
                  <div className="text-xs text-amber-400/70 font-mono mt-0.5">{selectedSub.member.memberCode}</div>
                </div>
                <div className="p-3.5 bg-gray-900/60 border border-gray-700/30 rounded-xl hover:border-gray-600/50 transition-colors group">
                  <div className="flex items-center gap-2 mb-1">
                    <IconPhone className="w-3.5 h-3.5 text-amber-400/60 group-hover:text-amber-400 transition-colors" />
                    <span className="text-xs text-gray-500">الهاتف</span>
                  </div>
                  <div className="text-white text-sm font-medium" dir="ltr">{selectedSub.member.person.phone}</div>
                </div>
                <div className="p-3.5 bg-gray-900/60 border border-gray-700/30 rounded-xl hover:border-gray-600/50 transition-colors group">
                  <div className="flex items-center gap-2 mb-1">
                    <IconLayers className="w-3.5 h-3.5 text-amber-400/60 group-hover:text-amber-400 transition-colors" />
                    <span className="text-xs text-gray-500">الخطة</span>
                  </div>
                  <div className="text-white font-semibold text-sm">{selectedSub.plan.nameAr}</div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                    <IconClock className="w-3 h-3" />
                    {selectedSub.plan.durationDays} يوم
                  </div>
                </div>
                <div className="p-3.5 bg-gray-900/60 border border-gray-700/30 rounded-xl hover:border-gray-600/50 transition-colors group">
                  <div className="flex items-center gap-2 mb-1">
                    <IconBuilding className="w-3.5 h-3.5 text-amber-400/60 group-hover:text-amber-400 transition-colors" />
                    <span className="text-xs text-gray-500">الفرع</span>
                  </div>
                  <div className="text-white text-sm font-medium">{selectedSub.branch.name}</div>
                </div>
                <div className="p-3.5 bg-gray-900/60 border border-gray-700/30 rounded-xl hover:border-gray-600/50 transition-colors group">
                  <div className="flex items-center gap-2 mb-1">
                    <IconCalendar className="w-3.5 h-3.5 text-amber-400/60 group-hover:text-amber-400 transition-colors" />
                    <span className="text-xs text-gray-500">تاريخ البدء</span>
                  </div>
                  <div className="text-white text-sm">{new Date(selectedSub.startDate).toLocaleDateString('ar-EG')}</div>
                </div>
                <div className="p-3.5 bg-gray-900/60 border border-gray-700/30 rounded-xl hover:border-gray-600/50 transition-colors group">
                  <div className="flex items-center gap-2 mb-1">
                    <IconClock className="w-3.5 h-3.5 text-amber-400/60 group-hover:text-amber-400 transition-colors" />
                    <span className="text-xs text-gray-500">تاريخ الانتهاء</span>
                  </div>
                  <div className="text-white text-sm">{new Date(selectedSub.endDate).toLocaleDateString('ar-EG')}</div>
                </div>
              </div>

              {/* Financial summary */}
              <div className="relative overflow-hidden p-4 sm:p-5 bg-gradient-to-br from-gray-900/80 to-gray-800/50 border border-gray-700/30 rounded-xl mb-6">
                <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-lg" />
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-4">
                  <IconCash className="w-4 h-4 text-amber-400" />
                  الملخص المالي
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">السعر الإجمالي</span>
                    <span className="text-white font-bold text-sm">{formatPrice(selectedSub.pricePiasters)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm flex items-center gap-1.5">
                      <IconCheck className="w-3.5 h-3.5 text-emerald-400" />
                      المدفوع
                    </span>
                    <span className="text-emerald-400 font-bold text-sm">{formatPrice(selectedSub.paidPiasters)}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="py-1">
                    <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          getPaymentProgress(selectedSub.paidPiasters, selectedSub.pricePiasters) >= 100
                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                            : 'bg-gradient-to-r from-amber-500 to-amber-400'
                        }`}
                        style={{ width: `${getPaymentProgress(selectedSub.paidPiasters, selectedSub.pricePiasters)}%` }}
                      />
                    </div>
                    <div className="text-center text-xs text-gray-500 mt-1">
                      {getPaymentProgress(selectedSub.paidPiasters, selectedSub.pricePiasters)}% مكتمل
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-700/30">
                    <span className="text-gray-400 text-sm font-medium">المتبقي</span>
                    <span className={`font-bold text-base ${selectedSub.outstandingPiasters > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {formatPrice(selectedSub.outstandingPiasters)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 mb-6">
                {selectedSub.outstandingPiasters > 0 && (
                  <button
                    onClick={openPaymentModal}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-500/15 to-emerald-600/10 text-emerald-400 border border-emerald-500/30 rounded-xl hover:from-emerald-500/25 hover:to-emerald-600/20 hover:border-emerald-500/50 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <IconCash className="w-4 h-4" />
                    {!isOnline ? 'تسجيل دفعة (محلياً)' : 'تسجيل دفعة'}
                  </button>
                )}
                {selectedSub.status === 'ACTIVE' && !selectedSub.isFrozen && (
                  <button
                    onClick={handleFreeze}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500/10 to-amber-600/5 text-amber-400 border border-amber-500/30 rounded-xl hover:from-amber-500/20 hover:to-amber-600/10 hover:border-amber-500/50 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <IconSnowflake className="w-4 h-4" />
                    {!isOnline ? 'تجميد (محلياً)' : 'تجميد'}
                  </button>
                )}
                {selectedSub.isFrozen && (
                  <button
                    onClick={handleUnfreeze}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-500/15 to-emerald-600/10 text-emerald-400 border border-emerald-500/30 rounded-xl hover:from-emerald-500/25 hover:to-emerald-600/20 hover:border-emerald-500/50 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <IconRefresh className="w-4 h-4" />
                    {!isOnline ? 'إلغاء التجميد (محلياً)' : 'إلغاء التجميد'}
                  </button>
                )}
                <button
                  onClick={handleRenew}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500/15 to-amber-600/10 text-amber-400 border border-amber-500/30 rounded-xl hover:from-amber-500/25 hover:to-amber-600/20 hover:border-amber-500/50 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
                >
                  <IconRefresh className="w-4 h-4" />
                  {!isOnline ? 'تجديد (محلياً)' : 'تجديد'}
                </button>
                <button
                  onClick={openReceipt}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-gray-500/15 to-gray-600/10 text-gray-400 border border-gray-500/30 rounded-xl hover:from-gray-500/25 hover:to-gray-600/20 hover:border-gray-500/50 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
                >
                  <IconReceipt className="w-4 h-4" />
                  إيصال
                </button>
              </div>

              {/* Payments history */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-3">
                  <IconCreditCard className="w-4 h-4 text-amber-400" />
                  سجل المدفوعات
                </h3>
                {!isOnline && selectedSub.payments.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-gray-700/30 flex items-center justify-center">
                      <IconWifiOff className="w-6 h-6 text-gray-500" />
                    </div>
                    <p className="text-gray-500 text-sm">سجل المدفوعات غير متاح بدون اتصال</p>
                  </div>
                ) : selectedSub.payments.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-gray-700/30 flex items-center justify-center">
                      <IconCreditCard className="w-6 h-6 text-gray-500" />
                    </div>
                    <p className="text-gray-500 text-sm">لا توجد مدفوعات</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedSub.payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3.5 bg-gray-900/60 border border-gray-700/30 rounded-xl hover:border-gray-600/40 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
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
                          <IconCalendar className="w-3 h-3" />
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

      {/* ──────── Payment Modal ──────── */}
      {showPayment && selectedSub && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-3 sm:p-4" onClick={() => setShowPayment(false)}>
          <div className="relative bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700/50 rounded-2xl max-w-md w-full shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>
            {/* Header gradient bar */}
            <div className="h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-600 rounded-t-2xl" />

            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <IconCash className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">
                    {!isOnline ? 'تسجيل دفعة (محلياً)' : 'تسجيل دفعة'}
                  </h2>
                </div>
                <button onClick={() => setShowPayment(false)} className="w-8 h-8 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200">
                  <IconClose className="w-4 h-4" />
                </button>
              </div>

              {!isOnline && (
                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2">
                  <IconWifiOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="text-amber-300/90 text-xs sm:text-sm">سيتم حفظ الدفعة محلياً وتزامنها تلقائياً عند عودة الاتصال</span>
                </div>
              )}

              <div className="mb-5 p-4 bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/30 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <IconTag className="w-4 h-4 text-amber-400/60" />
                  <span className="text-xs text-amber-400/60">المتبقي</span>
                </div>
                <div className="text-amber-300 font-bold text-2xl">{formatPrice(selectedSub.pricePiasters - selectedSub.paidPiasters)}</div>
              </div>

              <form onSubmit={handleRecordPayment} className="space-y-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                    <IconCash className="w-4 h-4 text-amber-400" />
                    المبلغ (ج.م) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                    <IconCreditCard className="w-4 h-4 text-amber-400" />
                    طريقة الدفع *
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all appearance-none"
                  >
                    <option value="CASH">نقدي</option>
                    <option value="BANK_TRANSFER">تحويل بنكي</option>
                    <option value="CARD">بطاقة</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">رقم المرجع</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="رقم العملية أو التحويل"
                    className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">ملاحظات</label>
                  <input
                    type="text"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  />
                </div>
                <div className="flex gap-3 pt-4 border-t border-gray-700/30">
                  <button type="button" onClick={() => setShowPayment(false)} className="flex-1 py-2.5 bg-gray-800/80 border border-gray-700/50 text-white rounded-xl hover:bg-gray-700/80 transition-all duration-200 text-sm font-medium">
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className={`flex-1 py-2.5 text-white rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg hover:-translate-y-0.5 active:translate-y-0 ${
                      !isOnline
                        ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 shadow-amber-600/20'
                        : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-emerald-500/25'
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

      {/* ──────── Receipt Modal ──────── */}
      {showReceipt && selectedSub && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4" onClick={() => setShowReceipt(false)}>
          <div className="relative bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>
            <div className="p-5 sm:p-6" ref={receiptRef} dir="rtl">
              <div className="text-center border-b-2 border-gray-800 pb-4 mb-4">
                <h2 className="text-xl font-bold text-gray-800">POWER 111</h2>
                <p className="text-sm text-gray-600 mt-1">إيصال اشتراك</p>
                <p className="text-xs text-gray-500 mt-1">{new Date().toLocaleDateString('ar-EG')}</p>
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
                          <td className="py-1.5 text-gray-600">{new Date(p.createdAt).toLocaleDateString('ar-EG')}</td>
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

            <div className="p-4 border-t border-gray-200 flex gap-3">
              <button onClick={() => setShowReceipt(false)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors text-sm font-medium">
                إغلاق
              </button>
              <button onClick={handlePrintReceipt} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white rounded-xl transition-all duration-200 shadow-lg shadow-amber-500/20 text-sm font-semibold">
                <IconPrinter className="w-4 h-4" />
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
