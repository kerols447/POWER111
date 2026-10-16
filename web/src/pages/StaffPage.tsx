import { useState, useEffect, useRef, useCallback } from 'react';
import NoticeBanner from '../components/NoticeBanner';
import {
  drawMembershipCard,
  downloadCardAsPng,
  downloadCardAsPdf
} from '../utils/membershipCard';
import { localDate, startOfMonth } from '../utils/dates';

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

export default function StaffPage() {
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

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => punch(person)}
                    disabled={!person.staffCode || busyId === person.id || !person.isActive}
                    className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] ${
                      person.present
                        ? 'bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/15'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/15'
                    }`}
                  >
                    {person.present ? <LogoutIcon /> : <LoginIcon />}
                    <span>{busyId === person.id ? 'جاري...' : person.present ? 'ختم انصراف' : 'ختم دخول'}</span>
                  </button>
                  <button
                    onClick={() => openCard(person)}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors active:scale-[0.98]"
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
