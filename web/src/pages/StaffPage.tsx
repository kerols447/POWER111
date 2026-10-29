import { useState, useEffect, useRef, useCallback } from 'react';
import NoticeBanner from '../components/NoticeBanner';
import {
  PageHeader, SectionTitle, StatTile, Badge, Btn, Segmented, Picker, Field,
  LABEL, FIELD, EmptyState, Loading, Modal, CARD, TONE
} from '../components/ui';
import { Stagger } from '../components/Motion';
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

// No kit equivalent for enter/leave arrows — kept but normalised to the kit's stroke and caps.
const LoginIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h5a3 3 0 013 3v1" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
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

  // Payroll has its own permission: logging an expense at the desk is not reading wages.
  const canSeePayroll = hasPermission('MANAGE_SALARIES');
  const canPayPayroll = hasPermission('MANAGE_SALARIES') && hasPermission('CREATE_EXPENSES');

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
      <div dir="rtl">
        <Loading />
      </div>
    );
  }

  return (
    <Stagger className="space-y-5 sm:space-y-7" dir="rtl">
      {/* Header */}
      <PageHeader
        icon="staff"
        title="الموظفين والمدربين"
        caption="كارت لكل موظف — ختم دخول وخروج وحساب ساعات الشغل"
        actions={
          <Btn
            variant="ghost"
            icon="refresh"
            onClick={() => { fetchStaff(); if (tab === 'report') fetchReport(); }}
          >
            <span>تحديث</span>
          </Btn>
        }
      />

      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}
      {error && <NoticeBanner kind="err" text={error} onDismiss={() => setError('')} />}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          icon="staff"
          tone={TONE.members}
          label="عدد الموظفين"
          value={summary?.total ?? staff.length}
          caption={branchFilter ? branches.find(b => b.id === branchFilter)?.name || '' : 'كل الفروع'}
        />
        <StatTile
          icon="users"
          tone={TONE.revenue}
          label="في الفرع دلوقتي"
          value={summary?.present ?? 0}
          caption="لسه مختمش انصراف"
        />
        <StatTile
          icon="check"
          tone={TONE.expiring}
          label="ختموا اليوم"
          value={summary?.checkedInToday ?? 0}
          caption={`من ${summary?.total ?? staff.length} موظف`}
        />
        <StatTile
          icon="clock"
          tone={TONE.attendance}
          label="ساعات اليوم"
          value={fmtMinutes(summary?.hoursToday ?? 0)}
          caption="إجمالي ورديات اليوم"
        />
      </div>

      {/* Tabs */}
      <Segmented
        value={tab}
        onChange={setTab}
        ariaLabel="تبديل العرض"
        options={[
          { key: 'today', label: 'الورديات اليوم' },
          { key: 'report', label: 'تقرير الساعات' }
        ]}
      />

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Picker
          value={branchFilter}
          onChange={setBranchFilter}
          ariaLabel="تصفية بالفرع"
          className="w-full"
          options={[
            { value: '', label: 'كل الفروع' },
            ...branches.map(b => ({ value: b.id, label: b.name }))
          ]}
        />
        <Picker
          value={roleFilter}
          onChange={setRoleFilter}
          ariaLabel="تصفية بالتخصص"
          className="w-full"
          options={[
            { value: '', label: 'كل التخصصات' },
            ...staffRoles.map(r => ({ value: r, label: roleLabels[r] }))
          ]}
        />
        <div className="flex gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setSearchTerm(search.trim()); } }}
            placeholder="اسم الموظف أو الكود..."
            className={`${FIELD} flex-1 min-w-0`}
          />
          <Btn
            variant="primary"
            icon="search"
            aria-label="بحث"
            onClick={() => setSearchTerm(search.trim())}
            className="w-12 shrink-0 px-0"
          />
        </div>
      </div>

      {tab === 'today' ? (
        staff.length === 0 ? (
          <div className={CARD}>
            <EmptyState
              title="لا يوجد موظفين في هذا الفرع"
              hint="أضف المدرب أو الموظف من صفحة «المستخدمين»، يطلع له كارت أوتوماتيك."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {staff.map(person => (
              <div key={person.id} className={`${CARD} p-4 sm:p-5`}>
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                    {person.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{person.name}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Badge tone="gray">{roleLabels[person.role] || person.role}</Badge>
                      {person.staffCode && (
                        <Badge tone="gold" className="font-mono">{person.staffCode}</Badge>
                      )}
                      {!person.isActive && (
                        <Badge tone="red">متوقف</Badge>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-left">
                    {person.present ? (
                      <Badge tone="green">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        في الفرع
                      </Badge>
                    ) : (
                      <Badge tone="gray">
                        <span className="w-1.5 h-1.5 bg-gray-600 rounded-full" />
                        خارج الوردية
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-dark border border-dark-border p-2.5">
                    <p className="text-[11px] text-gray-500">دخول</p>
                    <p className="text-sm font-semibold text-white mt-0.5">{fmtTime(person.checkInTime)}</p>
                  </div>
                  <div className="rounded-xl bg-dark border border-dark-border p-2.5">
                    <p className="text-[11px] text-gray-500">انصراف</p>
                    <p className="text-sm font-semibold text-white mt-0.5">{person.openShiftId ? 'شغال' : fmtTime(person.checkOutTime)}</p>
                  </div>
                  <div className="rounded-xl bg-primary/[0.06] border border-primary/20 p-2.5">
                    <p className="text-[11px] text-primary/70">ساعات اليوم</p>
                    <p className="text-sm font-semibold text-primary mt-0.5">{person.hoursTodayLabel}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                  <span className="truncate min-w-0">{person.branchNames.join('، ') || 'بدون فرع'}</span>
                  <span className="shrink-0">الشهر: <span className="text-white font-semibold">{person.hoursMonthLabel}</span></span>
                </div>

                {canSeePayroll && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                    <span className="truncate min-w-0">
                      {person.salaryPiasters
                        ? <>المرتب: <span className="text-emerald-400 font-semibold">{money(person.salaryPiasters)}</span> <span className="text-gray-600">{person.salaryBasis === 'HOURLY' ? 'للساعة' : 'شهرياً'}</span></>
                        : <span className="text-gray-600">مرتبوش متحدّش</span>}
                    </span>
                    <span className="shrink-0">
                      متسدد الشهر: <span className={person.paidThisMonthPiasters > 0 ? 'text-emerald-400 font-semibold' : 'text-white font-semibold'}>{money(person.paidThisMonthPiasters)}</span>
                    </span>
                  </div>
                )}

                {person.present && person.hoursToday > 720 && (
                  <p className="mt-2 text-[11px] text-primary">
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
                  <Btn
                    onClick={() => punch(person)}
                    disabled={!person.staffCode || busyId === person.id || !person.isActive}
                    variant={person.present ? 'danger' : 'primary'}
                    className="flex-1 min-w-[130px]"
                  >
                    {person.present ? <LogoutIcon /> : <LoginIcon />}
                    <span>{busyId === person.id ? 'جاري...' : person.present ? 'ختم انصراف' : 'ختم دخول'}</span>
                  </Btn>
                  {canPayPayroll && (
                    <Btn
                      onClick={() => openPay(person)}
                      variant="ghost"
                      icon="wallet"
                      className="flex-1 min-w-[104px]"
                    >
                      <span>سداد</span>
                    </Btn>
                  )}
                  <Btn
                    onClick={() => openCard(person)}
                    variant="ghost"
                    icon="barcode"
                    className="flex-1 min-w-[104px]"
                  >
                    <span>الكارت</span>
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="من تاريخ">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className={FIELD}
              />
            </Field>
            <Field label="إلى تاريخ">
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className={FIELD}
              />
            </Field>
            <div className="flex items-end">
              <Btn
                variant="primary"
                onClick={fetchReport}
                disabled={reportLoading}
                className="w-full"
              >
                {reportLoading ? 'جاري الحساب...' : 'احسب الساعات'}
              </Btn>
            </div>
          </div>

          {report && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className={`${CARD} p-4`}>
                  <p className="text-[11px] text-gray-500">إجمالي الساعات</p>
                  <p className="text-lg sm:text-2xl font-extrabold text-primary mt-1">{fmtMinutes(report.totals.hours)}</p>
                </div>
                <div className={`${CARD} p-4`}>
                  <p className="text-[11px] text-gray-500">عدد الورديات</p>
                  <p className="text-lg sm:text-2xl font-extrabold text-white mt-1">{report.totals.shifts}</p>
                </div>
                <div className={`${CARD} p-4`}>
                  <p className="text-[11px] text-gray-500">لسه جوه</p>
                  <p className="text-lg sm:text-2xl font-extrabold text-emerald-400 mt-1">{report.totals.openShifts}</p>
                </div>
              </div>

              <div className={CARD}>
                <div className="px-4 sm:px-5 pt-4 sm:pt-5">
                  <SectionTitle>الساعات لكل موظف — لحساب المرتب</SectionTitle>
                </div>
                {report.byStaff.length === 0 ? (
                  <EmptyState title="لا توجد ورديات في هذه الفترة" />
                ) : (
                  <div className="divide-y divide-dark-border/40 px-2 sm:px-3 pb-2">
                    {report.byStaff.map(row => (
                      <div key={row.userId} className="flex items-center gap-3 px-2 sm:px-3 py-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
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
                        <span className="shrink-0 text-sm font-bold text-primary">{row.hoursLabel}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {report.byBranch.length > 0 && (
                <div className={CARD}>
                  <div className="px-4 sm:px-5 pt-4 sm:pt-5">
                    <SectionTitle>حسب الفرع</SectionTitle>
                  </div>
                  <div className="divide-y divide-dark-border/40 px-2 sm:px-3 pb-2">
                    {report.byBranch.map(row => (
                      <div key={row.branchId} className="flex items-center justify-between gap-3 px-2 sm:px-3 py-3">
                        <span className="text-sm text-gray-300 truncate min-w-0">{row.branchName}</span>
                        <span className="text-sm font-bold text-white shrink-0">{row.hoursLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.data.length > 0 && (
                <div className={CARD}>
                  <div className="px-4 sm:px-5 pt-4 sm:pt-5">
                    <SectionTitle>كل الختمات</SectionTitle>
                  </div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-dark-border/40 px-2 sm:px-3 pb-2">
                    {report.data.slice().reverse().map(row => (
                      <div key={row.id} className="flex items-center gap-2 px-2 sm:px-3 py-2.5 text-xs">
                        <span className="text-gray-500 shrink-0 w-20">{fmtDay(row.day)}</span>
                        <span className="text-white font-semibold truncate flex-1 min-w-0">{row.staffName}</span>
                        <span className="text-gray-400 shrink-0">{fmtTime(row.checkInTime)} ← {row.open ? 'شغال' : fmtTime(row.checkOutTime)}</span>
                        <span className="text-primary font-bold shrink-0 w-16 text-left">{fmtMinutes(row.minutes)}</span>
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
        <Modal
          open
          width="max-w-lg"
          title={`صرف مرتّب ${payStaff.name}`}
          subtitle={`${salary?.salary.label || 'المرتب لسه متحددش في حسابه'}${payStaff.staffCode ? ` • ${payStaff.staffCode}` : ''}`}
          onClose={closePay}
          footer={
            <>
              <Btn variant="ghost" onClick={closePay}>
                <span>إلغاء</span>
              </Btn>
              <Btn type="submit" form="staff-pay-form" variant="primary" disabled={payBusy || salaryLoading}>
                <span>{payBusy ? 'جاري الصرف...' : 'تم الصرف'}</span>
              </Btn>
            </>
          }
        >
          {payError && <NoticeBanner kind="err" text={payError} onDismiss={() => setPayError('')} />}

          <form id="staff-pay-form" onSubmit={submitPay} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="من يوم">
                <input
                  type="date"
                  value={payStart}
                  max={payEnd}
                  onChange={e => changePayPeriod(e.target.value, payEnd)}
                  className={FIELD}
                />
              </Field>
              <Field label="إلى يوم">
                <input
                  type="date"
                  value={payEnd}
                  min={payStart}
                  onChange={e => changePayPeriod(payStart, e.target.value)}
                  className={FIELD}
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-dark border border-dark-border p-2.5">
                <p className="text-[11px] text-gray-500">ساعات الشغل</p>
                <p className="text-sm font-semibold text-primary mt-0.5">
                  {salaryLoading ? '...' : (salary?.workedLabel || '0س 00د')}
                </p>
              </div>
              <div className="rounded-xl bg-dark border border-dark-border p-2.5">
                <p className="text-[11px] text-gray-500">أيام حضر</p>
                <p className="text-sm font-semibold text-white mt-0.5">{salaryLoading ? '...' : (salary?.workedDays ?? 0)}</p>
              </div>
              <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15 p-2.5">
                <p className="text-[11px] text-emerald-500/70">المقترح</p>
                <p className="text-sm font-semibold text-emerald-400 mt-0.5">
                  {salaryLoading ? '...' : money(salary?.suggestedPiasters ?? 0)}
                </p>
              </div>
            </div>

            {!!salary?.openShifts && (
              <p className="text-[11px] text-primary">
                {payStaff.name} لسه مختمش انصراف في {salary.openShifts} وردية — الساعات ممكن تتغير.
              </p>
            )}

            <div>
              <label className={LABEL}>مبلغ السداد (ج.م)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                required
                value={payEgp}
                onChange={e => setPayEgp(e.target.value)}
                placeholder={salary?.remainingPiasters ? String(salary.remainingPiasters / 100) : '0'}
                className="w-full bg-dark border border-dark-border text-white font-mono rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-primary/60 transition-colors min-h-[44px]"
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
              <Field label="طريقة الصرف">
                <Picker
                  value={payMethod}
                  onChange={setPayMethod}
                  ariaLabel="طريقة الصرف"
                  className="w-full min-w-0"
                  options={paymentMethods}
                />
              </Field>
              <Field label="ملاحظات">
                <input
                  type="text"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  placeholder="اختياري"
                  className={FIELD}
                />
              </Field>
            </div>

            {salary?.branchId && (
              <p className="text-[11px] text-gray-500">
                بيتسجل في مصروفات «رواتب» بتاعة {salary.branches.find(b => b.id === salary.branchId)?.name || 'الفرع'} — {salary.period.label}
              </p>
            )}
          </form>

          {salary && salary.payments.length > 0 && (
            <div>
              <SectionTitle>اللي اتصرف في الفترة دي</SectionTitle>
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                {salary.payments.map(p => (
                  <div key={p.id} className="flex items-center gap-2 rounded-xl bg-dark border border-dark-border p-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-semibold">{money(p.amountPiasters)} <span className="text-gray-500 font-normal">• {p.paymentMethodLabel} • {p.branchName}</span></p>
                      <p className="text-gray-500 mt-0.5 truncate">
                        {arDate(p.periodStart)} ← {arDate(p.periodEnd)}
                        {p.workedMinutes ? ` • ${fmtMinutes(p.workedMinutes)}` : ''}
                        {p.notes ? ` • ${p.notes}` : ''}
                      </p>
                    </div>
                    {hasPermission('MANAGE_SALARIES') && hasPermission('DELETE_EXPENSES') && (
                      <Btn
                        variant="danger"
                        onClick={() => cancelPayment(p.id)}
                        disabled={payBusy}
                        className="shrink-0"
                      >
                        <span>إلغاء</span>
                      </Btn>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Staff card modal */}
      {cardStaff && (
        <Modal
          open
          title={`كارت ${cardStaff.name}`}
          subtitle={`الكود ${cardStaff.staffCode} — يُختم بيها الدخول والخروج`}
          onClose={() => setCardStaff(null)}
          footer={
            <>
              <Btn
                variant="primary"
                icon="download"
                onClick={() => downloadCard('png')}
                disabled={!cardImage || !!downloading}
                className="flex-1 sm:flex-none"
              >
                <span>{downloading === 'png' ? 'جاري التحميل...' : 'تحميل كصورة'}</span>
              </Btn>
              <Btn
                variant="ghost"
                icon="print"
                onClick={() => downloadCard('pdf')}
                disabled={!cardImage || !!downloading}
                className="flex-1 sm:flex-none"
              >
                <span>{downloading === 'pdf' ? 'جاري التحميل...' : 'تحميل كـ PDF للطباعة'}</span>
              </Btn>
            </>
          }
        >
          {cardError && <NoticeBanner kind="err" text={cardError} onDismiss={() => setCardError('')} />}

          <div className="rounded-xl overflow-hidden bg-dark border border-dark-border">
            {cardImage ? (
              <canvas ref={cardCanvasRef} className="w-full h-auto block" />
            ) : (
              <div className="flex items-center justify-center py-20 text-gray-500 text-sm">جاري إنشاء الكارت...</div>
            )}
          </div>

          <p className="text-[11px] text-gray-500">اطبع الكارت وعلّقه للموظف، أو ابعتلهوله على الواتساب. نفس الكارت اللي بيمسحه العضو.</p>
        </Modal>
      )}
    </Stagger>
  );
}
