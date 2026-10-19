import { useState, useEffect, useRef, useCallback } from 'react';
import NoticeBanner from '../components/NoticeBanner';
import { useAuth } from '../contexts/AuthContext';
import {
  drawMembershipCard,
  downloadCardAsPng,
  downloadCardAsPdf
} from '../utils/membershipCard';
import { localDate, startOfMonth, arDate } from '../utils/dates';

interface BranchRef {
  id: string;
  name: string;
  code: string;
}

interface Shift {
  id: string;
  checkInTime: string;
  checkOutTime: string | null;
  branchName: string;
  method: string;
  minutes: number;
}

interface StaffRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  staffCode: string | null;
  isActive: boolean;
  branches: BranchRef[];
  branchNames: string[];
  present: boolean;
  todayShifts: Shift[];
  openShiftId: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  branchName: string | null;
  hoursToday: number;
  hoursTodayLabel: string;
  hoursMonth: number;
  hoursMonthLabel: string;
  salaryPiasters: number | null;
  salaryBasis: 'MONTHLY' | 'HOURLY';
  paidThisMonthPiasters: number;
}

interface SalaryPaymentRow {
  id: string;
  amountPiasters: number;
  periodStart: string;
  periodEnd: string;
  workedMinutes: number;
  paymentMethod: string;
  paymentMethodLabel: string;
  notes: string | null;
  branchName: string;
  createdAt: string;
}

interface SalaryInfo {
  period: { start: string; end: string; label: string };
  staff: { id: string; name: string; staffCode: string | null };
  salary: { basis: 'MONTHLY' | 'HOURLY'; piasters: number | null; label: string | null };
  workedMinutes: number;
  workedLabel: string;
  workedDays: number;
  shifts: number;
  openShifts: number;
  suggestedPiasters: number;
  paidPiasters: number;
  remainingPiasters: number;
  branchId: string | null;
  branches: { id: string; name: string }[];
  payments: SalaryPaymentRow[];
}

interface Summary {
  total: number;
  present: number;
  checkedInToday: number;
  absent: number;
  hoursToday: number;
}

interface ReportTotals {
  shifts: number;
  hours: number;
  openShifts: number;
}

interface StaffReport {
  data: Array<{
    id: string;
    day: string;
    staffName: string;
    staffCode: string | null;
    role: string;
    branchName: string;
    checkInTime: string;
    checkOutTime: string | null;
    open: boolean;
    minutes: number;
  }>;
  totals: ReportTotals;
  byStaff: Array<{ userId: string; staffName: string; staffCode: string | null; role: string; days: number; minutes: number; hoursLabel: string }>;
  byBranch: Array<{ branchId: string; branchName: string; minutes: number; hoursLabel: string }>;
  byDay: Array<{ day: string; minutes: number; hoursLabel: string }>;
}

const roleLabels: Record<string, string> = {
  OWNER: 'مالك',
  BRANCH_MANAGER: 'مدير فرع',
  RECEPTIONIST: 'موظف استقبال',
  ACCOUNTANT: 'محاسب',
  TRAINER: 'مدرب',
  CONTENT_MANAGER: 'مدير محتوى'
};

const staffRoles = ['BRANCH_MANAGER', 'RECEPTIONIST', 'ACCOUNTANT', 'TRAINER', 'CONTENT_MANAGER'];

function fmtMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}س ${String(m).padStart(2, '0')}د`;
}

function money(piasters: number): string {
  return `${(piasters / 100).toLocaleString('ar-EG-u-nu-latn')} ج.م`;
}

const paymentMethods = [
  { value: 'CASH', label: 'نقدي' },
  { value: 'BANK_TRANSFER', label: 'تحويل بنكي' },
  { value: 'CARD', label: 'بطاقة' },
  { value: 'OTHER', label: 'أخرى' }
];

function fmtTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
}

function fmtDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long' });
}

const ClockIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const BadgeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0a2 2 0 114 0m-4 0a2 2 0 104 0m-2 8a2 2 0 100-4 2 2 0 000 4z" />
  </svg>
);

const LoginIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h5a3 3 0 013 3v1" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const WalletIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-4a2 2 0 000 4h4" />
  </svg>
);

export default function StaffPage() {
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<BranchRef[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [tab, setTab] = useState<'today' | 'report'>('today');
  const [branchFilter, setBranchFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [startDate, setStartDate] = useState(startOfMonth);
  const [endDate, setEndDate] = useState(localDate);
  const [report, setReport] = useState<StaffReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [cardStaff, setCardStaff] = useState<StaffRow | null>(null);
  const [cardImage, setCardImage] = useState('');
  const [cardError, setCardError] = useState('');
  const [downloading, setDownloading] = useState('');
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);

  const [payStaff, setPayStaff] = useState<StaffRow | null>(null);
  const [salary, setSalary] = useState<SalaryInfo | null>(null);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [payStart, setPayStart] = useState(startOfMonth);
  const [payEnd, setPayEnd] = useState(localDate);
  const [payEgp, setPayEgp] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payNotes, setPayNotes] = useState('');
  const [payError, setPayError] = useState('');
  const [payBusy, setPayBusy] = useState(false);

  const canSeePayroll = hasPermission('VIEW_EXPENSES');
  const canPayPayroll = hasPermission('CREATE_EXPENSES');

  useEffect(() => {
    fetch('/api/branches', { credentials: 'include' })
      .then(r => r.json())
      .then(list => setBranches(Array.isArray(list) ? list : list.data || []))
      .catch(() => setBranches([]));
  }, []);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (branchFilter) params.set('branchId', branchFilter);
      if (roleFilter) params.set('role', roleFilter);
      if (searchTerm) params.set('search', searchTerm);

      const res = await fetch(`/api/staff?${params.toString()}`, { credentials: 'include' });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message || 'حدث خطأ في جلب بيانات الموظفين');
        setLoading(false);
        return;
      }
      setStaff(body.data || []);
      setSummary(body.summary || null);
      setError('');
    } catch {
      setError('تعذر الاتصال بالخادم. تأكد من الإنترنت ثم حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  }, [branchFilter, roleFilter, searchTerm]);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (branchFilter) params.set('branchId', branchFilter);

      const res = await fetch(`/api/staff/report?${params.toString()}`, { credentials: 'include' });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message || 'حدث خطأ في تقرير الساعات');
        setReportLoading(false);
        return;
      }
      setReport(body);
      setError('');
    } catch {
      setError('تعذر الاتصال بالخادم. تأكد من الإنترنت ثم حاول مرة أخرى');
    } finally {
      setReportLoading(false);
    }
  }, [startDate, endDate, branchFilter]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    if (tab === 'report') fetchReport();
  }, [tab, fetchReport]);

  useEffect(() => {
    const canvas = cardCanvasRef.current;
    if (!canvas || !cardStaff) return;
    setCardError('');
    drawMembershipCard(canvas, {
      memberName: cardStaff.name,
      memberCode: cardStaff.staffCode || '',
      branchName: cardStaff.branchNames.join('، ') || 'كل الفروع',
      planName: '',
      validUntil: '',
      subtitle: `الوظيفة: ${roleLabels[cardStaff.role] || cardStaff.role}   •   ختم دخول وخروج`,
      kind: 'staff',
      isActive: cardStaff.isActive
    }).catch(() => setCardError('تعذر رسم البطاقة، حاول مرة أخرى'));
  }, [cardStaff]);

  const openCard = async (person: StaffRow) => {
    if (!person.staffCode) {
      setNotice({ kind: 'err', text: `${person.name} ملهوش كود موظف. افتح حسابه من صفحة المستخدمين واحفظه، يتاكّد الكود أوتوماتيك.` });
      return;
    }
    setCardStaff(person);
    setCardImage('');
    setCardError('');
    try {
      const res = await fetch(`/api/staff/${person.id}/qr`, { credentials: 'include' });
      const body = await res.json();
      if (!res.ok) {
        setCardError(body.message || 'تعذر إنشاء الكارت');
        return;
      }
      setCardImage(body.data.qrImage);
    } catch {
      setCardError('تعذر الاتصال بالخادم');
    }
  };

  const downloadCard = async (kind: 'png' | 'pdf') => {
    const canvas = cardCanvasRef.current;
    if (!canvas || !cardStaff || downloading) return;
    setDownloading(kind);
    setCardError('');
    try {
      const name = `كارت-${cardStaff.staffCode}-${cardStaff.name}.${kind === 'png' ? 'png' : 'pdf'}`;
      if (kind === 'png') await downloadCardAsPng(canvas, name);
      else await downloadCardAsPdf(canvas, name);
    } catch {
      setCardError('تعذر تحميل الكارت، حاول مرة أخرى');
    } finally {
      setDownloading('');
    }
  };

  const punch = async (person: StaffRow) => {
    const branchId = branchFilter || person.branches[0]?.id;
    if (!branchId) {
      setNotice({ kind: 'err', text: `${person.name} مش متعيين في أي فرع. عيّن فرعه من صفحة المستخدمين.` });
      return;
    }

    setBusyId(person.id);
    try {
      if (person.openShiftId) {
        const res = await fetch(`/api/staff/${person.openShiftId}/checkout`, {
          method: 'POST',
          credentials: 'include'
        });
        const body = await res.json();
        setNotice({ kind: res.ok ? 'ok' : 'err', text: body.message || 'حدث خطأ في تسجيل الانصراف' });
      } else {
        const res = await fetch('/api/staff/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ staffCode: person.staffCode, branchId, method: 'MANUAL' })
        });
        const body = await res.json();
        setNotice({ kind: res.ok ? 'ok' : 'err', text: body.message || 'حدث خطأ في تسجيل الحضور' });
      }
      await fetchStaff();
      if (tab === 'report') await fetchReport();
    } catch {
      setNotice({ kind: 'err', text: 'تعذر الاتصال بالخادم. حاول مرة أخرى' });
    } finally {
      setBusyId(null);
    }
  };

  // The suggested wage is worked out on the server from the same shift cards
  // the hours come from, so the number can never disagree with the attendance.
  const loadSalary = useCallback(async (person: StaffRow, start: string, end: string) => {
    setSalaryLoading(true);
    try {
      const params = new URLSearchParams({ startDate: start, endDate: end });
      const res = await fetch(`/api/staff/${person.id}/salary?${params.toString()}`, { credentials: 'include' });
      const body = await res.json();
      if (!res.ok) {
        setSalary(null);
        setPayError(body.message || 'حدث خطأ في بيانات المرتب');
        return null;
      }
      setPayError('');
      setSalary(body);
      // Only ever prefill what is still owed — a period that is paid up comes back
      // blank so reopening the dialog can't turn into a second salary for the month.
      const owed = Math.max(0, body.suggestedPiasters - body.paidPiasters);
      setPayEgp(owed ? String(owed / 100) : '');
      return body as SalaryInfo;
    } catch {
      setSalary(null);
      setPayError('تعذر الاتصال بالخادم. تأكد من الإنترنت ثم حاول مرة أخرى');
      return null;
    } finally {
      setSalaryLoading(false);
    }
  }, []);

  const openPay = (person: StaffRow) => {
    const start = startOfMonth();
    const end = localDate();
    setPayStart(start);
    setPayEnd(end);
    setPayMethod('CASH');
    setPayNotes('');
    setPayError('');
    setSalary(null);
    setPayStaff(person);
    loadSalary(person, start, end);
  };

  const closePay = () => {
    setPayStaff(null);
    setSalary(null);
    setPayEgp('');
    setPayNotes('');
    setPayError('');
  };

  const changePayPeriod = (start: string, end: string) => {
    setPayStart(start);
    setPayEnd(end);
    if (payStaff) loadSalary(payStaff, start, end);
  };

  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payStaff || payBusy) return;

    const egp = Number(payEgp);
    if (!payEgp.trim() || !Number.isFinite(egp) || egp <= 0) {
      setPayError('اكتب مبلغ صحيح أكبر من صفر');
      return;
    }

    setPayBusy(true);
    try {
      const res = await fetch(`/api/staff/${payStaff.id}/salary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amountPiasters: Math.round(egp * 100),
          periodStart: payStart,
          periodEnd: payEnd,
          workedMinutes: salary?.workedMinutes ?? 0,
          paymentMethod: payMethod,
          notes: payNotes,
          branchId: salary?.branchId ?? undefined
        })
      });
      const body = await res.json();
      if (!res.ok) {
        setPayError(body.message || 'حدث خطأ في صرف المرتب');
        return;
      }
      setNotice({ kind: 'ok', text: body.message });
      closePay();
      fetchStaff();
      if (tab === 'report') fetchReport();
    } catch {
      setPayError('تعذر الاتصال بالخادم. حاول مرة أخرى');
    } finally {
      setPayBusy(false);
    }
  };

  const cancelPayment = async (paymentId: string) => {
    if (!payStaff || payBusy) return;
    setPayBusy(true);
    try {
      const res = await fetch(`/api/staff/salary/${paymentId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const body = await res.json();
      setNotice({ kind: res.ok ? 'ok' : 'err', text: body.message || 'حدث خطأ في إلغاء الصرف' });
      if (res.ok) {
        await loadSalary(payStaff, payStart, payEnd);
        fetchStaff();
      }
    } catch {
      setPayError('تعذر الاتصال بالخادم. حاول مرة أخرى');
    } finally {
      setPayBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
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
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 flex-shrink-0">
            <ClockIcon />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-white truncate">الموظفين والمدربين</h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">كارت لكل موظف — ختم دخول وخروج وحساب ساعات الشغل</p>
          </div>
        </div>
        <button
          onClick={() => { fetchStaff(); if (tab === 'report') fetchReport(); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 text-gray-300 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors self-start sm:self-auto"
        >
          <RefreshIcon />
          <span>تحديث</span>
        </button>
      </div>

      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}
      {error && <NoticeBanner kind="err" text={error} onDismiss={() => setError('')} />}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-5">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
          <p className="text-xs text-gray-500 font-medium">عدد الموظفين</p>
          <p className="text-2xl sm:text-3xl font-bold text-white mt-1">{summary?.total ?? staff.length}</p>
          <p className="text-[11px] text-primary/50 mt-1">{branchFilter ? branches.find(b => b.id === branchFilter)?.name || '' : 'كل الفروع'}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-emerald-500/20 p-4 sm:p-5">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
          <p className="text-xs text-gray-500 font-medium">في الفرع دلوقتي</p>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-400 mt-1">{summary?.present ?? 0}</p>
          <p className="text-[11px] text-gray-500 mt-1">لسه مختمش انصراف</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-5">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
          <p className="text-xs text-gray-500 font-medium">ختموا اليوم</p>
          <p className="text-2xl sm:text-3xl font-bold text-amber-400 mt-1">{summary?.checkedInToday ?? 0}</p>
          <p className="text-[11px] text-gray-500 mt-1">من {summary?.total ?? staff.length} موظف</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-5">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
          <p className="text-xs text-gray-500 font-medium">ساعات اليوم</p>
          <p className="text-2xl sm:text-3xl font-bold text-white mt-1">{fmtMinutes(summary?.hoursToday ?? 0)}</p>
          <p className="text-[11px] text-gray-500 mt-1">إجمالي ورديات اليوم</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('today')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            tab === 'today' ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20' : 'bg-white/5 text-gray-400 hover:bg-white/10'
          }`}
        >
          الورديات اليوم
        </button>
        <button
          onClick={() => setTab('report')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            tab === 'report' ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20' : 'bg-white/5 text-gray-400 hover:bg-white/10'
          }`}
        >
          تقرير الساعات
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select
          value={branchFilter}
          onChange={e => setBranchFilter(e.target.value)}
          className="bg-dark border border-dark-border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50"
        >
          <option value="">كل الفروع</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="bg-dark border border-dark-border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50"
        >
          <option value="">كل التخصصات</option>
          {staffRoles.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
        </select>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setSearchTerm(search.trim()); } }}
            placeholder="اسم الموظف أو الكود..."
            className="flex-1 min-w-0 bg-dark border border-dark-border text-white rounded-xl px-4 py-3 text-sm placeholder:text-gray-600 focus:outline-none focus:border-amber-500/50"
          />
          <button
            onClick={() => setSearchTerm(search.trim())}
            className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl active:scale-95 transition-transform"
          >
            <SearchIcon />
          </button>
        </div>
      </div>

      {tab === 'today' ? (
        staff.length === 0 ? (
          <div className="rounded-2xl bg-dark-card border border-dark-border p-10 text-center">
            <p className="text-gray-400 text-sm">لا يوجد موظفين في هذا الفرع</p>
            <p className="text-gray-600 text-xs mt-2">أضف المدرب أو الموظف من صفحة «المستخدمين»، يطلع له كارت أوتوماتيك.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {staff.map(person => (
              <div key={person.id} className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-5">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-600/5 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold flex-shrink-0">
                    {person.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-bold truncate">{person.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300">
                        {roleLabels[person.role] || person.role}
                      </span>
                      {person.staffCode && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                          {person.staffCode}
                        </span>
                      )}
                      {!person.isActive && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400">متوقف</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-left">
                    {person.present ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                        في الفرع
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                        <span className="w-2 h-2 bg-gray-600 rounded-full" />
                        خارج الوردية
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-2.5">
                    <p className="text-[11px] text-gray-500">دخول</p>
                    <p className="text-sm font-bold text-white mt-0.5">{fmtTime(person.checkInTime)}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-2.5">
                    <p className="text-[11px] text-gray-500">انصراف</p>
                    <p className="text-sm font-bold text-white mt-0.5">{person.openShiftId ? 'شغال' : fmtTime(person.checkOutTime)}</p>
                  </div>
                  <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/15 p-2.5">
                    <p className="text-[11px] text-amber-500/70">ساعات اليوم</p>
                    <p className="text-sm font-bold text-amber-400 mt-0.5">{person.hoursTodayLabel}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                  <span className="truncate min-w-0">{person.branchNames.join('، ') || 'بدون فرع'}</span>
                  <span className="flex-shrink-0">الشهر: <span className="text-gray-300 font-semibold">{person.hoursMonthLabel}</span></span>
                </div>

                {canSeePayroll && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                    <span className="truncate min-w-0">
                      {person.salaryPiasters
                        ? <>المرتب: <span className="text-emerald-400 font-semibold">{money(person.salaryPiasters)}</span> <span className="text-gray-600">{person.salaryBasis === 'HOURLY' ? 'للساعة' : 'شهرياً'}</span></>
                        : <span className="text-gray-600">مرتبوش متحدّش</span>}
                    </span>
                    <span className="flex-shrink-0">
                      متسدد الشهر: <span className={person.paidThisMonthPiasters > 0 ? 'text-emerald-400 font-semibold' : 'text-gray-300 font-semibold'}>{money(person.paidThisMonthPiasters)}</span>
                    </span>
                  </div>
                )}

                {person.present && person.hoursToday > 720 && (
                  <p className="mt-2 text-[11px] text-amber-400">
                    الوردية مفتوحة من {person.hoursTodayLabel} — تأكد إن {person.name} مختم انصراف، الساعات دي بتدخل في المرتب.
                  </p>
                )}

                {person.todayShifts.length > 1 && (
                  <div className="mt-2 space-y-1">
                    {person.todayShifts.map(shift => (
                      <p key={shift.id} className="text-[11px] text-gray-500">
                        {fmtTime(shift.checkInTime)} ← {fmtTime(shift.checkOutTime)} · {shift.branchName} · {fmtMinutes(shift.minutes)}
                      </p>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => punch(person)}
                    disabled={!person.staffCode || busyId === person.id || !person.isActive}
                    className={`flex-1 min-w-[130px] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] ${
                      person.present
                        ? 'bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/15'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/15'
                    }`}
                  >
                    {person.present ? <LogoutIcon /> : <LoginIcon />}
                    <span>{busyId === person.id ? 'جاري...' : person.present ? 'ختم انصراف' : 'ختم دخول'}</span>
                  </button>
                  {canPayPayroll && (
                    <button
                      onClick={() => openPay(person)}
                      className="flex-1 min-w-[104px] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/20 transition-colors active:scale-[0.98]"
                    >
                      <WalletIcon />
                      <span>سداد</span>
                    </button>
                  )}
                  <button
                    onClick={() => openCard(person)}
                    className="flex-1 min-w-[104px] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors active:scale-[0.98]"
                  >
                    <BadgeIcon />
                    <span>الكارت</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">من تاريخ</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-dark border border-dark-border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">إلى تاريخ</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-dark border border-dark-border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchReport}
                disabled={reportLoading}
                className="w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                {reportLoading ? 'جاري الحساب...' : 'احسب الساعات'}
              </button>
            </div>
          </div>

          {report && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-dark-card border border-dark-border p-4">
                  <p className="text-[11px] text-gray-500">إجمالي الساعات</p>
                  <p className="text-lg sm:text-2xl font-bold text-amber-400 mt-1">{fmtMinutes(report.totals.hours)}</p>
                </div>
                <div className="rounded-2xl bg-dark-card border border-dark-border p-4">
                  <p className="text-[11px] text-gray-500">عدد الورديات</p>
                  <p className="text-lg sm:text-2xl font-bold text-white mt-1">{report.totals.shifts}</p>
                </div>
                <div className="rounded-2xl bg-dark-card border border-dark-border p-4">
                  <p className="text-[11px] text-gray-500">لسه جوه</p>
                  <p className="text-lg sm:text-2xl font-bold text-emerald-400 mt-1">{report.totals.openShifts}</p>
                </div>
              </div>

              <div className="rounded-2xl bg-dark-card border border-dark-border overflow-hidden">
                <p className="px-4 sm:px-5 pt-4 pb-2 text-xs font-semibold text-amber-400/70 uppercase tracking-wider">الساعات لكل موظف — لحساب المرتب</p>
                {report.byStaff.length === 0 ? (
                  <p className="p-5 text-sm text-gray-500">لا توجد ورديات في هذه الفترة</p>
                ) : (
                  report.byStaff.map(row => (
                    <div key={row.userId} className="flex items-center gap-3 px-4 sm:px-5 py-3 border-t border-dark-border/60">
                      <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 text-sm font-bold flex-shrink-0">
                        {row.staffName.slice(0, 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">{row.staffName}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                          {roleLabels[row.role] || row.role}
                          {row.staffCode ? ` · ${row.staffCode}` : ''}
                          {row.days ? ` · ${row.days} يوم عمل` : ''}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-sm font-bold text-amber-400">{row.hoursLabel}</span>
                    </div>
                  ))
                )}
              </div>

              {report.byBranch.length > 0 && (
                <div className="rounded-2xl bg-dark-card border border-dark-border overflow-hidden">
                  <p className="px-4 sm:px-5 pt-4 pb-2 text-xs font-semibold text-amber-400/70 uppercase tracking-wider">حسب الفرع</p>
                  {report.byBranch.map(row => (
                    <div key={row.branchId} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-dark-border/60">
                      <span className="text-sm text-gray-300 truncate min-w-0">{row.branchName}</span>
                      <span className="text-sm font-bold text-white flex-shrink-0">{row.hoursLabel}</span>
                    </div>
                  ))}
                </div>
              )}

              {report.data.length > 0 && (
                <div className="rounded-2xl bg-dark-card border border-dark-border overflow-hidden">
                  <p className="px-4 sm:px-5 pt-4 pb-2 text-xs font-semibold text-amber-400/70 uppercase tracking-wider">كل الختمات</p>
                  <div className="max-h-96 overflow-y-auto">
                    {report.data.slice().reverse().map(row => (
                      <div key={row.id} className="flex items-center gap-2 px-4 sm:px-5 py-2.5 border-t border-dark-border/60 text-xs">
                        <span className="text-gray-500 flex-shrink-0 w-20">{fmtDay(row.day)}</span>
                        <span className="text-white font-medium truncate flex-1 min-w-0">{row.staffName}</span>
                        <span className="text-gray-400 flex-shrink-0">{fmtTime(row.checkInTime)} ← {row.open ? 'شغال' : fmtTime(row.checkOutTime)}</span>
                        <span className="text-amber-400 font-bold flex-shrink-0 w-16 text-left">{fmtMinutes(row.minutes)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Payout modal — the amount follows the worked hours, he can still type his own */}
      {payStaff && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center overflow-y-auto p-3 sm:p-4"
          onClick={closePay}
        >
          <div
            className="relative bg-dark-card border border-dark-border rounded-2xl w-full max-w-lg my-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                    <WalletIcon />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-white font-bold truncate">صرف مرتّب {payStaff.name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {salary?.salary.label || 'المرتب لسه متحددش في حسابه'}
                      {payStaff.staffCode ? ` • ${payStaff.staffCode}` : ''}
                    </p>
                  </div>
                </div>
                <button onClick={closePay} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/5">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {payError && <div className="mb-3"><NoticeBanner kind="err" text={payError} onDismiss={() => setPayError('')} /></div>}

              <form onSubmit={submitPay} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">من يوم</label>
                    <input
                      type="date"
                      value={payStart}
                      max={payEnd}
                      onChange={e => changePayPeriod(e.target.value, payEnd)}
                      className="w-full bg-dark border border-dark-border text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">إلى يوم</label>
                    <input
                      type="date"
                      value={payEnd}
                      min={payStart}
                      onChange={e => changePayPeriod(payStart, e.target.value)}
                      className="w-full bg-dark border border-dark-border text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-2.5">
                    <p className="text-[11px] text-gray-500">ساعات الشغل</p>
                    <p className="text-sm font-bold text-amber-400 mt-0.5">
                      {salaryLoading ? '...' : (salary?.workedLabel || '0س 00د')}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-2.5">
                    <p className="text-[11px] text-gray-500">أيام حضر</p>
                    <p className="text-sm font-bold text-white mt-0.5">{salaryLoading ? '...' : (salary?.workedDays ?? 0)}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15 p-2.5">
                    <p className="text-[11px] text-emerald-500/70">المقترح</p>
                    <p className="text-sm font-bold text-emerald-400 mt-0.5">
                      {salaryLoading ? '...' : money(salary?.suggestedPiasters ?? 0)}
                    </p>
                  </div>
                </div>

                {!!salary?.openShifts && (
                  <p className="text-[11px] text-amber-400">
                    {payStaff.name} لسه مختمش انصراف في {salary.openShifts} وردية — الساعات ممكن تتغير.
                  </p>
                )}

                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">مبلغ السداد (ج.م)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    required
                    value={payEgp}
                    onChange={e => setPayEgp(e.target.value)}
                    placeholder={salary?.remainingPiasters ? String(salary.remainingPiasters / 100) : '0'}
                    className="w-full bg-dark border border-dark-border text-white font-mono rounded-xl px-3 py-3 text-lg font-bold focus:outline-none focus:border-emerald-500/50"
                    dir="ltr"
                  />
                  <p className="mt-1.5 text-[11px] text-gray-500">
                    {salary?.salary.basis === 'HOURLY'
                      ? `سعر الساعة ${money(salary.salary.piasters ?? 0)} × ${salary.workedLabel} شغل = ${money(salary.suggestedPiasters)}`
                      : salary?.salary.piasters
                        ? `المرتب الشهري ${money(salary.salary.piasters)} — عدّل الرقم لو شغل نص شهر`
                        : 'اكتب المبلغ بنفسك'}
                    {salary && salary.paidPiasters > 0 ? ` • المتسدد في الفترة دي ${money(salary.paidPiasters)}` : ''}
                    {!!salary && salary.suggestedPiasters > 0 && salary.remainingPiasters === 0 && ' — الفترة دي متسددة بالكامل'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">طريقة الصرف</label>
                    <select
                      value={payMethod}
                      onChange={e => setPayMethod(e.target.value)}
                      className="w-full bg-dark border border-dark-border text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500/50"
                    >
                      {paymentMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">ملاحظات</label>
                    <input
                      type="text"
                      value={payNotes}
                      onChange={e => setPayNotes(e.target.value)}
                      placeholder="اختياري"
                      className="w-full bg-dark border border-dark-border text-white rounded-xl px-3 py-2.5 text-sm placeholder:text-gray-600 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                </div>

                {salary?.branchId && (
                  <p className="text-[11px] text-gray-500">
                    بيتسجل في مصروفات «رواتب» بتاعة {salary.branches.find(b => b.id === salary.branchId)?.name || 'الفرع'} — {salary.period.label}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closePay}
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-gray-300 rounded-xl text-sm font-semibold hover:bg-white/10 transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={payBusy || salaryLoading}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-all"
                  >
                    {payBusy ? 'جاري الصرف...' : 'تم الصرف'}
                  </button>
                </div>
              </form>

              {salary && salary.payments.length > 0 && (
                <div className="mt-4 border-t border-dark-border pt-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">اللي اتصرف في الفترة دي</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {salary.payments.map(p => (
                      <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="text-white font-semibold">{money(p.amountPiasters)} <span className="text-gray-500 font-normal">• {p.paymentMethodLabel} • {p.branchName}</span></p>
                          <p className="text-gray-500 mt-0.5 truncate">
                            {arDate(p.periodStart)} ← {arDate(p.periodEnd)}
                            {p.workedMinutes ? ` • ${fmtMinutes(p.workedMinutes)}` : ''}
                            {p.notes ? ` • ${p.notes}` : ''}
                          </p>
                        </div>
                        {hasPermission('DELETE_EXPENSES') && (
                          <button
                            onClick={() => cancelPayment(p.id)}
                            disabled={payBusy}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 transition-colors"
                          >
                            إلغاء
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Staff card modal */}
      {cardStaff && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto"
          onClick={() => setCardStaff(null)}
        >
          <div
            className="relative bg-gradient-to-br from-dark-card via-dark-card to-dark-card rounded-2xl border border-dark-border/50 w-full max-w-2xl my-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white flex-shrink-0">
                    <BadgeIcon />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-white font-bold truncate">كارت {cardStaff.name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">الكود {cardStaff.staffCode} — يُختم بيها الدخول والخروج</p>
                  </div>
                </div>
                <button onClick={() => setCardStaff(null)} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/5 flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {cardError && <div className="mb-3"><NoticeBanner kind="err" text={cardError} onDismiss={() => setCardError('')} /></div>}

              <div className="rounded-xl overflow-hidden bg-black/40 border border-white/5">
                {cardImage ? (
                  <canvas ref={cardCanvasRef} className="w-full h-auto block" />
                ) : (
                  <div className="flex items-center justify-center py-20 text-gray-500 text-sm">جاري إنشاء الكارت...</div>
                )}
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => downloadCard('png')}
                  disabled={!cardImage || !!downloading}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-all"
                >
                  {downloading === 'png' ? 'جاري التحميل...' : 'تحميل كصورة'}
                </button>
                <button
                  onClick={() => downloadCard('pdf')}
                  disabled={!cardImage || !!downloading}
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-gray-200 rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-white/10 transition-colors"
                >
                  {downloading === 'pdf' ? 'جاري التحميل...' : 'تحميل كـ PDF للطباعة'}
                </button>
              </div>
              <p className="mt-3 text-[11px] text-gray-500">اطبع الكارت وعلّقه للموظف، أو ابعتلهوله على الواتساب. نفس الكارت اللي بيمسحه العضو.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
