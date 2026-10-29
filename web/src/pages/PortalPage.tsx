import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  drawMembershipCard,
  downloadCardAsPng,
  downloadCardAsPdf
} from '../utils/membershipCard';
import { CountUp, Reveal, RevealWords, useInView } from '../components/Motion';
import { whatsappLink } from '../utils/whatsapp';
import { wipeLocalBusinessData } from '../utils/offlineDb';
import { enablePush, disablePush, isPushOn, permissionState } from '../utils/notifications';
import { bmiBand, bmiOf } from '../utils/bodyMetrics';
import BmiIndicator from '../components/BmiIndicator';
import {
  Badge,
  Btn,
  EmptyState,
  LABEL,
  Modal,
  SectionTitle,
  UiIcon,
  btnClass,
  type BadgeTone,
  type IconName
} from '../components/ui';

// The portal's own night look: a near-black page with two far-off lights (gold for the
// brand, electric blue for depth), navy panels on top, and gold as the only loud colour.
const PAGE_BG = {
  background:
    'radial-gradient(900px 420px at 88% -80px, rgba(255,201,40,0.10), transparent 62%), radial-gradient(760px 460px at 6% 108%, rgba(56,116,255,0.10), transparent 60%), #05070E'
};
const PANEL = 'rounded-2xl border border-white/[0.07] bg-[#0B1122] shadow-[0_14px_40px_rgba(2,4,12,0.45)]';
const PANEL_INNER = 'rounded-xl border border-white/[0.06] bg-[#0A0F1F]';
// The admin's FIELD is neutral black; every surface here is navy, so inputs need their own.
const NIGHT_FIELD =
  'w-full min-h-[44px] rounded-xl border border-white/[0.08] bg-[#0A0F1F] px-4 py-3 text-sm text-white placeholder:text-gray-600 transition-colors focus:outline-none focus:border-[#FFC928]/60 focus:ring-1 focus:ring-[#FFC928]/25';
const GLASS_BAR = 'backdrop-blur-xl bg-[#070B16]/85';
// The four neon accents the reference allows beside the gold: one per shortcut and tile.
const NEON = { gold: '#FFC928', violet: '#A78BFA', green: '#34D399', blue: '#5B8CFF' };

interface PortalMember {
  id: string;
  memberCode: string;
  status: string;
  name: string;
  phone: string;
  gender?: string | null;
  photoPath?: string | null;
  weightKg?: number | null;
  heightCm?: number | null;
  branch: { id: string; name: string; code: string; address?: string | null; phone?: string | null };
}

interface PortalSubscription {
  id: string;
  startDate: string;
  endDate: string;
  pricePiasters: number;
  paidPiasters: number;
  status: string;
  isFrozen: boolean;
  plan: { name: string; nameAr: string };
}

interface PortalPayment {
  id: string;
  amountPiasters: number;
  method: string;
  createdAt: string;
  subscription: { plan: { nameAr: string } };
}

interface PortalAttendance {
  id: string;
  checkInTime: string;
  branch: { name: string };
}

interface PortalData {
  member: PortalMember;
  currentSubscription: PortalSubscription | null;
  pastSubscriptions: PortalSubscription[];
  payments: PortalPayment[];
  attendances: PortalAttendance[];
  totalVisits: number;
  currentlyInBranch: number;
  trainersOnDuty: string[];
}

interface StaffShift {
  id: string;
  checkInTime: string;
  checkOutTime: string | null;
  branchName: string;
  method: string;
  minutes: number;
}

interface PortalPhysioBooking {
  id: string;
  requestedDate: string;
  note: string | null;
  status: string;
  pricePiasters: number | null;
  declineReason: string | null;
  createdAt: string;
}

interface PortalPhysioData {
  bookings: PortalPhysioBooking[];
  pendingCount: number;
  aheadOfMe: number;
}

interface PortalNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

// Staff sessions carry shifts and hours only — never member or financial data.
interface PortalStaffData {
  kind: 'staff';
  staff: {
    id: string;
    name: string;
    staffCode: string | null;
    role: string;
    phone: string | null;
    branches: { id: string; name: string; code: string }[];
  };
  present: boolean;
  hoursToday: number;
  hoursTodayLabel: string;
  hoursMonth: number;
  hoursMonthLabel: string;
  daysWorkedMonth: number;
  shifts: StaffShift[];
}

const STAFF_ROLE_TEXT: Record<string, string> = {
  OWNER: 'مالك',
  BRANCH_MANAGER: 'مدير فرع',
  RECEPTIONIST: 'موظف استقبال',
  ACCOUNTANT: 'محاسب',
  TRAINER: 'مدرب',
  CONTENT_MANAGER: 'مدير محتوى'
};

const SUPPORT_PHONE = '01280368119';

function fmtClock(iso: string | null) {
  if (!iso) return 'شغال';
  return new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
}

function fmtShiftMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}س ${String(m).padStart(2, '0')}د`;
}

const STATUS_TEXT: Record<string, string> = {
  ACTIVE: 'نشط',
  EXPIRED: 'منتهي',
  SUSPENDED: 'موقوف',
  FROZEN: 'مجمّد',
  INACTIVE: 'غير نشط',
  CANCELLED: 'ملغي',
  PENDING_REVIEW: 'بانتظار المراجعة'
};

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'green',
  EXPIRED: 'red',
  SUSPENDED: 'red',
  FROZEN: 'amber',
  INACTIVE: 'gray',
  CANCELLED: 'gray',
  PENDING_REVIEW: 'amber'
};

const METHOD_TEXT: Record<string, string> = {
  CASH: 'نقدي',
  BANK_TRANSFER: 'تحويل بنكي',
  CARD: 'بطاقة',
  OTHER: 'أخرى'
};

const PHYSIO_STATUS_TEXT: Record<string, string> = {
  PENDING: 'قيد المراجعة',
  APPROVED: 'تمت الموافقة',
  DECLINED: 'مرفوضة'
};

const PHYSIO_STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: 'amber',
  APPROVED: 'green',
  DECLINED: 'red'
};

function isoDay(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Cairo'
  });
}

/** Day and month only — the year is noise on a tile. */
function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', {
    day: 'numeric', month: 'long', timeZone: 'Africa/Cairo'
  });
}

function formatEGP(piasters: number) {  return `${(piasters / 100).toLocaleString('ar-EG-u-nu-latn')} ج.م`;
}

function daysRemaining(endDate: string): number {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (24 * 60 * 60 * 1000)));
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'دلوقتي';
  if (mins < 60) return `من ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `من ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'من امبارح';
  return `من ${days} يوم`;
}

function buildCardData(data: PortalData) {
  const sub = data.currentSubscription;
  return {
    memberName: data.member.name,
    memberCode: data.member.memberCode,
    branchName: data.member.branch.name,
    branchAddress: data.member.branch.address || '',
    branchPhone: data.member.branch.phone || '',
    planName: sub ? (sub.plan.nameAr || sub.plan.name) : 'عضوية',
    validUntil: sub ? formatDate(sub.endDate) : 'بدون اشتراك',
    isActive: !!sub && daysRemaining(sub.endDate) > 0 && sub.status !== 'CANCELLED'
  };
}

/** The kit's gold tick plus the one-line explainer every portal panel carries. */
function PanelHead({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div>
      <SectionTitle right={right}>{title}</SectionTitle>
      {hint && <p className="mt-2 text-[12px] text-gray-500 leading-relaxed">{hint}</p>}
    </div>
  );
}

/** Small reading inside an identity or subscription panel — label + icon chip above, value below. */
function DataCell({
  label,
  value,
  tone = 'text-white',
  dir = 'ltr',
  icon,
  iconTone = NEON.blue
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  // Money reads right-to-left; flipping it would put the pounds sign after the number.
  dir?: 'ltr' | 'rtl';
  icon: IconName;
  iconTone?: string;
}) {
  return (
    <div className={`${PANEL_INNER} px-2 py-2.5 min-w-0`}>
      <div className="flex items-center justify-center gap-1.5">
        <p className="text-[10px] sm:text-[11px] text-gray-500 font-semibold leading-snug">{label}</p>
        <span
          className="w-7 h-7 rounded-lg grid place-items-center shrink-0"
          style={{ backgroundColor: `${iconTone}1a`, color: iconTone, boxShadow: `0 0 14px ${iconTone}26` }}
        >
          <UiIcon name={icon} className="w-3.5 h-3.5" />
        </span>
      </div>
      <p className={`mt-1.5 text-[13px] sm:text-sm font-bold leading-tight text-center ${tone}`} dir={dir}>{value}</p>
    </div>
  );
}

/** The portal's own tile: the kit's card and icon chip, sized for three across a phone. */
function PortalStat({
  icon,
  tone,
  label,
  caption,
  children
}: {
  icon: IconName;
  tone: string;
  label: string;
  caption?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`${PANEL} p-3 sm:p-3.5`}>
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${tone}1f`, color: tone, boxShadow: `0 0 18px ${tone}26` }}
      >
        <UiIcon name={icon} className="w-4 h-4" />
      </span>
      <p className="mt-2.5 text-[11px] text-gray-500 font-semibold leading-snug">{label}</p>
      <div className="mt-1.5 text-lg sm:text-xl font-extrabold text-white leading-none tracking-tight">
        {children}
      </div>
      {caption && <p className="mt-1.5 text-[10px] text-gray-600 leading-snug">{caption}</p>}
    </div>
  );
}

/** One tap to the four things a member actually opens the app for. `active` = the gold-ringed tile. */
function QuickAction({
  icon,
  label,
  tone,
  active = false,
  onClick
}: {
  icon: IconName;
  label: string;
  tone: string;
  active?: boolean;
  onClick: () => void;
}) {
  const chip = active ? NEON.gold : tone;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 rounded-2xl border px-1.5 py-3 min-h-[78px] transition-[border-color,transform,background-color,box-shadow] duration-200 active:scale-[.96] sm:hover:bg-[#0D1428] ${
        active ? 'border-[#FFC928]/60 bg-[#FFC928]/[0.07]' : 'border-white/[0.07] bg-[#0A0F1F]'
      }`}
      style={{
        boxShadow: active
          ? '0 0 0 1px rgba(255,201,40,0.30), 0 0 26px rgba(255,201,40,0.25), inset 0 1px 0 rgba(255,255,255,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)'
      }}
    >
      <span
        className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
        style={{ backgroundColor: `${chip}1f`, color: chip, boxShadow: `0 0 20px ${chip}30` }}
      >
        <UiIcon name={icon} className="w-5 h-5" />
      </span>
      <span className={`text-[11px] font-bold leading-tight ${active ? 'text-[#FFD95C]' : 'text-gray-300'}`}>{label}</span>
    </button>
  );
}

/** The little crown that sits over the member's initial when they have no photo yet. */
function CrownMark({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3.5 8.5 8 12l4-6.5L16 12l4.5-3.5L19 17H5Z" />
    </svg>
  );
}

function PortalHeader({
  unread,
  onNotifications,
  onLogout
}: {
  unread: number;
  onNotifications?: () => void;
  onLogout: () => void;
}) {
  return (
    <header className={`sticky top-0 z-40 ${GLASS_BAR} border-b border-white/[0.06]`}>
      <div className="max-w-2xl mx-auto px-3.5 sm:px-4 h-14 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2.5 min-h-11 min-w-0 transition-transform duration-200 active:scale-95">
          <img src="/power-logo.jpg" alt="POWER 111" className="w-8 h-8 rounded-lg ring-1 ring-primary/50 shadow-[0_0_16px_rgba(255,201,40,0.25)] shrink-0" />
          <span className="text-sm font-extrabold text-white truncate">POWER <span className="text-primary">111</span></span>
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          {onNotifications && (
            <button
              type="button"
              onClick={onNotifications}
              aria-label="الإشعارات"
              className="relative w-11 h-11 grid place-items-center rounded-xl text-gray-400 border border-white/[0.08] bg-white/[0.03] transition-colors duration-200 active:scale-95 sm:hover:text-white sm:hover:bg-white/[0.07]"
            >
              <UiIcon name="bell" className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute top-1 left-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-primary text-black text-[10px] font-extrabold leading-none shadow-[0_0_10px_rgba(255,201,40,0.6)]">
                  {unread > 9 ? '+9' : unread}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="h-11 px-3.5 rounded-xl text-[13px] font-bold text-gray-300 border border-white/[0.08] bg-white/[0.03] transition-colors duration-200 active:scale-95 sm:hover:bg-white/[0.07] sm:hover:text-white"
          >
            خروج
          </button>
        </div>
      </div>
    </header>
  );
}

type PortalTab = 'home' | 'card' | 'physio' | 'records';

const TABS: { id: PortalTab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'الرئيسية', icon: 'home' },
  { id: 'card', label: 'بطاقتي', icon: 'barcode' },
  { id: 'physio', label: 'العلاج', icon: 'physio' },
  { id: 'records', label: 'سجلي', icon: 'clock' }
];

function PortalTabs({ tab, onChange }: { tab: PortalTab; onChange: (next: PortalTab) => void }) {
  return (
    <nav
      aria-label="أقسام البوابة"
      className={`fixed bottom-0 inset-x-0 z-40 ${GLASS_BAR} border-t border-white/[0.06]`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-2xl mx-auto grid grid-cols-4">
        {TABS.map(t => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative min-h-[58px] px-1 flex flex-col items-center justify-center gap-1 transition-colors duration-200 ${
                active ? 'text-primary' : 'text-gray-500 active:text-gray-300 sm:hover:text-gray-300'
              }`}
            >
              <span
                aria-hidden
                className="absolute top-0 h-0.5 w-10 rounded-full bg-primary shadow-[0_0_12px_rgba(255,201,40,0.7)]"
                style={{
                  transform: active ? 'scaleX(1)' : 'scaleX(0)',
                  transition: 'transform 240ms cubic-bezier(.16,.84,.44,1)'
                }}
              />
              <UiIcon name={t.icon} className="w-5 h-5" />
              <span className="text-[11px] font-bold leading-none">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// The phone gives a 12-megapixel square; the avatar needs 512px. Cropping here keeps the
// upload small enough for a phone connection and the picture centred on the face.
function prepareAvatar(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      if (!side) {
        reject(new Error('الصورة فاضية'));
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('المتصفح مش بيقدر يعالج الصورة'));
        return;
      }
      ctx.fillStyle = '#090909';
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 512, 512);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('تعذر تحويل الصورة'))),
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('الملف ده مش صورة صحيحة'));
    };
    img.src = url;
  });
}

/** The member's own data: picture, weight and height — all editable from the phone. */
function ProfileModal({
  open,
  member,
  onClose,
  onSaved
}: {
  open: boolean;
  member: PortalMember;
  onClose: () => void;
  onSaved: (patch: Partial<PortalMember>) => void;
}) {
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [picked, setPicked] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setWeight(member.weightKg ? String(member.weightKg) : '');
    setHeight(member.heightCm ? String(member.heightCm) : '');
    setPicked(null);
    setPreview('');
    setRemovePhoto(false);
    setBusy(false);
    setError('');
  }, [open, member]);

  if (!open) return null;

  const shownPhoto = preview || (removePhoto ? '' : member.photoPath || '');
  const liveBmi = bmiOf(Number(weight) || null, Number(height) ? Math.round(Number(height)) : null);

  const pickFile = (file: File | null) => {
    if (!file) return;
    setPicked(file);
    setRemovePhoto(false);
    setPreview(URL.createObjectURL(file));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');

    const weightKg = weight.trim() === '' ? null : Number(weight);
    const heightCm = height.trim() === '' ? null : Math.round(Number(height));
    if (weightKg !== null && !Number.isFinite(weightKg)) {
      setError('اكتب الوزن بالأرقام، مثال ٧٥.٥');
      return;
    }
    if (heightCm !== null && !Number.isFinite(heightCm)) {
      setError('اكتب الطول بالسنتيمتر بالأرقام، مثال ١٧٥');
      return;
    }

    setBusy(true);
    let photoPath = removePhoto ? null : member.photoPath || null;

    try {
      if (picked) {
        const blob = await prepareAvatar(picked);
        const form = new FormData();
        form.append('photo', blob, 'avatar.jpg');
        const res = await fetch('/api/portal/photo', { method: 'POST', credentials: 'include', body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.message || 'تعذر رفع الصورة');
          setBusy(false);
          return;
        }
        photoPath = body.data.photoPath;
      } else if (removePhoto) {
        const res = await fetch('/api/portal/photo', { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.message || 'تعذر حذف الصورة');
          setBusy(false);
          return;
        }
      }

      const res = await fetch('/api/portal/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ weightKg, heightCm })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || 'حدث خطأ في حفظ بياناتك');
        setBusy(false);
        return;
      }

      onSaved({ photoPath, weightKg: body.data.weightKg, heightCm: body.data.heightCm });
      onClose();
    } catch {
      setError('حصلت مشكلة في الاتصال، حاول تاني');
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`بروفايل ${member.name.split(' ')[0]}`}
      subtitle="صورتك ووزنك وطولك — بتظهر للاستقبال وللمدرب"
      onClose={onClose}
      width="max-w-md"
    >
      <form onSubmit={save} className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0F1F] grid place-items-center">
            {shownPhoto ? (
              <img src={shownPhoto} alt="صورتك" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-extrabold text-primary">{member.name.trim().charAt(0)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 flex flex-col items-start gap-2">
            <label className={`${btnClass('ghost')} cursor-pointer`}>
              <UiIcon name="edit" className="w-4 h-4" />
              {picked || shownPhoto ? 'تغيير الصورة' : 'اختيار صورة'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => pickFile(e.target.files?.[0] || null)}
              />
            </label>
            {shownPhoto && !removePhoto && (
              <button
                type="button"
                onClick={() => { setPicked(null); setPreview(''); setRemovePhoto(true); }}
                className="min-h-11 px-1 text-xs text-gray-400 transition-colors sm:hover:text-rose-400"
              >
                إزالة الصورة
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="profile-weight" className={LABEL}>الوزن (كجم)</label>
            <input
              id="profile-weight"
              type="number"
              inputMode="decimal"
              dir="ltr"
              step="0.1"
              min="20"
              max="400"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="75.5"
              className={NIGHT_FIELD}
            />
          </div>
          <div>
            <label htmlFor="profile-height" className={LABEL}>الطول (سم)</label>
            <input
              id="profile-height"
              type="number"
              inputMode="numeric"
              dir="ltr"
              step="1"
              min="90"
              max="250"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="175"
              className={NIGHT_FIELD}
            />
          </div>
        </div>

        <p className="text-sm text-gray-400 leading-relaxed">
          {liveBmi
            ? <>كتلة جسمك <span className="font-bold text-white" dir="ltr">{liveBmi}</span> — <span className={`font-bold ${bmiBand(liveBmi).tone}`}>{bmiBand(liveBmi).label}</span></>
            : 'سجل الوزن والطول عشان نشوف كتلة جسمك ونتابعت تقدمك.'}
        </p>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/40 rounded-lg text-rose-400 text-sm text-center">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Btn type="submit" variant="primary" disabled={busy}>
            {busy ? 'جاري الحفظ…' : 'حفظ'}
          </Btn>
          <Btn type="button" variant="ghost" onClick={onClose} disabled={busy}>
            إلغاء
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

/** Full-bleed code viewer — reception scans the phone screen straight off this. */
function CodeViewer({ open, code, image, label, onClose }: { open: boolean; code: string; image: string; label: string; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previousFilter = root.style.filter;
    const previousOverflow = document.body.style.overflow;
    root.style.filter = 'brightness(1.5) contrast(1.06)';
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.filter = previousFilter;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={label}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center px-6 text-center"
    >
      <p className="text-sm text-gray-400">{label}</p>
      {image ? (
        <img
          src={image}
          alt={label}
          className="mt-5 w-[min(78vw,420px)] h-[min(78vw,420px)] bg-white rounded-2xl p-4"
        />
      ) : (
        <div className="mt-5 w-[min(78vw,420px)] h-[min(78vw,420px)] rounded-2xl bg-white/10 flex items-center justify-center text-gray-400 text-sm">
          جاري التحميل…
        </div>
      )}
      <p className="mt-6 font-mono text-2xl tracking-[0.3em] text-white" dir="ltr">{code}</p>
      <button onClick={onClose} className="mt-8 px-6 py-3 min-h-12 rounded-xl border border-white/20 text-gray-200 text-sm font-bold active:scale-95">
        إغلاق
      </button>
    </div>
  );
}

/** Days-left ring that draws itself once on arrival. */
function ProgressRing({ percent, tone }: { percent: number; tone: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, percent / 100)));

  return (
    <div ref={ref} className="relative w-[112px] h-[112px] sm:w-[132px] sm:h-[132px] shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          className={tone}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={inView ? offset : circumference}
          style={{ transition: 'stroke-dashoffset 1100ms cubic-bezier(.16,.84,.44,1) 150ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl sm:text-2xl font-black text-white">{Math.round(percent)}%</span>
        <span className="text-[11px] text-gray-500">من المدة</span>
      </div>
    </div>
  );
}

type RecordTab = 'visits' | 'payments' | 'history';

const RECORD_TABS: { id: RecordTab; label: string }[] = [
  { id: 'visits', label: 'الزيارات' },
  { id: 'payments', label: 'المدفوعات' },
  { id: 'history', label: 'اشتراكات سابقة' }
];

export default function PortalPage() {
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<PortalData | null>(null);
  const [staffData, setStaffData] = useState<PortalStaffData | null>(null);
  const [qrImage, setQrImage] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cardError, setCardError] = useState('');
  const [downloading, setDownloading] = useState<'' | 'png' | 'pdf'>('');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [tab, setTab] = useState<PortalTab>('home');
  const [recordTab, setRecordTab] = useState<RecordTab>('visits');
  const [physio, setPhysio] = useState<PortalPhysioData | null>(null);
  const [physioDate, setPhysioDate] = useState('');
  const [physioNote, setPhysioNote] = useState('');
  const [physioError, setPhysioError] = useState('');
  const [physioBusy, setPhysioBusy] = useState(false);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pushOn, setPushOn] = useState(isPushOn());
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);

  const loadDashboard = async () => {
    try {
      const res = await fetch('/api/portal/me', { credentials: 'include' });
      if (!res.ok) return false;
      const body = await res.json();
      if (body.data?.kind === 'staff') {
        setStaffData(body.data);
        setData(null);
      } else {
        setData(body.data);
        setStaffData(null);
        fetchPhysio();
        fetchNotifications();
      }
      fetchQR();
      return true;
    } catch {
      return false;
    }
  };

  const fetchQR = async () => {
    try {
      const res = await fetch('/api/portal/qr', { credentials: 'include' });
      if (res.ok) {
        const body = await res.json();
        setQrImage(body.data.qrImage);
      }
    } catch (err) {
      console.error('Error fetching QR:', err);
    }
  };

  const fetchPhysio = async () => {
    try {
      const res = await fetch('/api/portal/physio', { credentials: 'include' });
      if (!res.ok) return;
      const body = await res.json();
      if (body.data) setPhysio(body.data);
    } catch {
      // The section just stays hidden until the next load.
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/portal/notifications', { credentials: 'include' });
      if (!res.ok) return;
      const body = await res.json();
      if (body.data) {
        setNotifications(body.data.notifications || []);
        setUnreadCount(body.data.unreadCount || 0);
      }
    } catch {
      // Inbox stays empty until the next load.
    }
  };

  const handlePushToggle = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushMessage('');
    if (pushOn) {
      await disablePush();
      setPushOn(false);
      setPushMessage('تم إيقاف الإشعارات على الجهاز ده');
    } else {
      const result = await enablePush();
      setPushOn(result.ok);
      setPushMessage(result.message);
      if (result.ok) fetchNotifications();
    }
    setPushBusy(false);
  };

  const markNotificationsRead = async () => {
    try {
      await fetch('/api/portal/notifications/read', { method: 'POST', credentials: 'include' });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    } catch {
      // The count stays; nothing is lost.
    }
  };

  const applyProfile = (patch: Partial<PortalMember>) => {
    setData(prev => (prev ? { ...prev, member: { ...prev.member, ...patch } } : prev));
  };

  const scrollToTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  const changeTab = (next: PortalTab) => {
    if (next === tab) return;
    setTab(next);
    scrollToTop();
  };

  // The booking form has its own section now; the profile icon walks the member to it.
  const goToPhysio = () => changeTab('physio');

  useEffect(() => {
    loadDashboard().then(ok => {
      setChecking(false);
      if (!ok) setData(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const canvas = cardCanvasRef.current;
    if (!canvas) return;
    setCardError('');

    if (staffData) {
      drawMembershipCard(canvas, {
        memberName: staffData.staff.name,
        memberCode: staffData.staff.staffCode || '',
        branchName: staffData.staff.branches.map(b => b.name).join('، ') || '—',
        planName: '',
        validUntil: '',
        subtitle: `الوظيفة: ${STAFF_ROLE_TEXT[staffData.staff.role] || staffData.staff.role}   •   ختم دخول وخروج`,
        kind: 'staff',
        isActive: true
      }).catch(() => setCardError('تعذر رسم البطاقة، حاول مرة أخرى'));
      return;
    }

    if (data) {
      drawMembershipCard(canvas, buildCardData(data)).catch(() =>
        setCardError('تعذر رسم البطاقة، حاول مرة أخرى')
      );
    }
  }, [data, staffData, tab]);

  const handleDownload = async (kind: 'png' | 'pdf') => {
    const canvas = cardCanvasRef.current;
    if (!canvas || (!data && !staffData) || downloading) return;
    setDownloading(kind);
    setCardError('');
    try {
      const code = staffData ? staffData.staff.staffCode : data!.member.memberCode;
      const name = `بطاقة-POWER111-${code}.${kind === 'png' ? 'png' : 'pdf'}`;
      if (kind === 'png') await downloadCardAsPng(canvas, name);
      else await downloadCardAsPdf(canvas, name);
    } catch {
      setCardError('تعذر تحميل البطاقة، حاول مرة أخرى');
    } finally {
      setDownloading('');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone })
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message || 'حدث خطأ في تسجيل الدخول');
        return;
      }
      await loadDashboard();
      scrollToTop();
    } catch {
      setError('حدث خطأ في الاتصال. حاول مرة أخرى');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhysioBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!physioDate) return;
    setPhysioError('');
    setPhysioBusy(true);
    try {
      const res = await fetch('/api/portal/physio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestedDate: physioDate, note: physioNote.trim() || undefined })
      });
      const body = await res.json();
      if (!res.ok) {
        setPhysioError(body.message || 'حدث خطأ في حجز الجلسة');
        return;
      }
      setPhysioDate('');
      setPhysioNote('');
      fetchPhysio();
    } catch {
      setPhysioError('حدث خطأ في الاتصال. حاول مرة أخرى');
    } finally {
      setPhysioBusy(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/portal/logout', { method: 'POST', credentials: 'include' });
    // This phone is often the club's own: the cached copies of the last member go with them.
    void wipeLocalBusinessData();
    setData(null);
    setStaffData(null);
    setQrImage('');
    setPhone('');
    setViewerOpen(false);
    setTab('home');
    setRecordTab('visits');
    setPhysio(null);
    setPhysioDate('');
    setPhysioNote('');
    setPhysioError('');
    setNotifications([]);
    setUnreadCount(0);
    setNotifOpen(false);
    setPushMessage('');
    scrollToTop();
  };

  const activeCode = staffData ? staffData.staff.staffCode || '' : data?.member.memberCode || '';

  // ===== Loading =====
  if (checking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={PAGE_BG}>
        <img src="/power-logo.jpg" alt="POWER 111" className="w-16 h-16 rounded-xl animate-pulse motion-reduce:animate-none" />
        <div className="text-gray-500 text-sm">جاري التحميل…</div>
      </div>
    );
  }

  // ===== Login =====
  if (!data && !staffData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10" style={PAGE_BG}>
        <Reveal y={0} scale={0.9} duration={700}>
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute -inset-6 rounded-full"
              style={{ background: 'radial-gradient(closest-side, rgba(255,201,40,0.30), transparent 72%)' }}
            />
            <Link to="/" className="relative block w-24 h-24 rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 2px #FFC928, 0 0 34px rgba(255,201,40,0.40)' }}>
              <img src="/power-logo.jpg" alt="POWER 111" className="w-full h-full object-cover" />
            </Link>
          </div>
        </Reveal>
        <h1 className="mt-8 text-[26px] sm:text-3xl font-extrabold text-white tracking-tight">
          <RevealWords text="بوابة الأعضاء" delay={150} step={140} />
        </h1>
        <Reveal delay={340} y={8}>
          <div className="mt-3.5 h-px w-20" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,201,40,0.75), transparent)' }} />
        </Reveal>

        <Reveal delay={440} className="w-full">
          <form onSubmit={handleLogin} className={`mt-8 w-full max-w-sm mx-auto ${PANEL} p-5 sm:p-6 space-y-4`}>
            {error && (
              <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-sm font-semibold">
                <UiIcon name="warning" className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            <div>
              <label htmlFor="portal-phone" className={`${LABEL} mb-2`}>رقم الموبايل</label>
              <div className="relative">
                <input
                  id="portal-phone"
                  type="tel"
                  required
                  autoFocus
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className={`${NIGHT_FIELD} min-h-[56px] py-4 px-12 text-center text-lg font-bold tracking-wider placeholder:font-normal`}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg grid place-items-center"
                  style={{ backgroundColor: `${NEON.gold}1a`, color: NEON.gold, boxShadow: `0 0 14px ${NEON.gold}26` }}
                >
                  <UiIcon name="phone" className="w-4 h-4" />
                </span>
              </div>
            </div>
            <Btn
              type="submit"
              variant="primary"
              disabled={submitting || phone.replace(/\D/g, '').length < 10}
              className="w-full min-h-[52px] py-4 text-[15px]"
              style={submitting || phone.replace(/\D/g, '').length >= 10
                ? undefined
                : { backgroundColor: 'rgba(255,198,41,0.10)', color: '#FFC928', border: '1px solid rgba(255,198,41,0.30)', boxShadow: 'none', opacity: 1 }}
            >
              {submitting ? 'جاري الدخول…' : 'دخول'}
            </Btn>
          </form>
        </Reveal>

        <Reveal delay={580}>
          <div className="mt-7 flex items-center gap-3 text-sm">
            <Link to="/" className="inline-flex items-center min-h-11 px-2 text-gray-400 transition-colors sm:hover:text-primary">
              ← العودة للصفحة الرئيسية
            </Link>
            <span aria-hidden="true" className="w-1 h-1 rounded-full bg-white/25" />
            <a
              href={whatsappLink(SUPPORT_PHONE, 'مش قادر أدخل بوابة الأعضاء') || `tel:${SUPPORT_PHONE}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center min-h-11 px-2 text-emerald-400 transition-colors sm:hover:text-emerald-300"
            >
              مساعده واتساب
            </a>
          </div>
        </Reveal>
      </div>
    );
  }

  // ===== Shared chrome =====
  const header = (
    <PortalHeader
      unread={staffData ? 0 : unreadCount}
      onNotifications={staffData ? undefined : () => setNotifOpen(true)}
      onLogout={handleLogout}
    />
  );

  const codeSection = (
    <section className={`${PANEL} p-4 sm:p-6`}>
      <PanelHead
        title={staffData ? 'كود ختم الوردية' : 'كود الحضور الخاص بك'}
        hint="اعرض الكود ده على الماسح عند الاستقبال"
      />
      <div className="mt-4 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label="تكبير الكود"
          className="bg-white p-3.5 rounded-2xl ring-1 ring-primary/50 shadow-[0_0_36px_rgba(255,201,40,0.28)] transition-transform duration-200 active:scale-95 sm:hover:scale-[1.02]"
        >
          {qrImage ? (
            <img src={qrImage} alt="كود الحضور" className="w-48 h-48 sm:w-56 sm:h-56" />
          ) : (
            <div className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center text-gray-500 text-sm">جاري التحميل…</div>
          )}
        </button>
        <p className="mt-3 text-[11px] text-gray-600">اضغط على الكود لعرضه fullscreen وإضاءة أعلى</p>
        <p className="mt-1.5 font-mono text-base sm:text-lg tracking-[0.25em] text-primary" dir="ltr">{activeCode}</p>
      </div>
    </section>
  );

  const cardSection = (
    <section className={`${PANEL} p-4 sm:p-6`}>
      <PanelHead
        title={staffData ? 'كارت الموظف' : 'بطاقة العضوية'}
        hint={staffData ? 'نفس كارت العضو — بيختم بيه الدخول والخروج' : 'كرت باسمك وكودك — حمّله كصورة أو PDF واطبعه، الاستقبال بيمسح الباركود'}
      />

      <canvas ref={cardCanvasRef} className="mt-4 block w-full h-auto rounded-xl border border-white/[0.08] bg-[#0A0F1F]" />

      {cardError && <p className="mt-3 text-sm text-rose-400 text-center">{cardError}</p>}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Btn variant="primary" icon="download" onClick={() => handleDownload('png')} disabled={!!downloading}>
          {downloading === 'png' ? 'جاري التحضير…' : 'تحميل صورة'}
        </Btn>
        <Btn variant="ghost" icon="print" onClick={() => handleDownload('pdf')} disabled={!!downloading}>
          {downloading === 'pdf' ? 'جاري التحضير…' : 'PDF للطباعة'}
        </Btn>
      </div>
    </section>
  );

  const viewer = (
    <CodeViewer
      open={viewerOpen}
      code={activeCode}
      image={qrImage}
      label={staffData ? 'كود ختم الوردية' : 'كود الحضور'}
      onClose={() => setViewerOpen(false)}
    />
  );

  // ===== Staff dashboard =====
  if (staffData) {
    return (
      <div className="min-h-screen pb-16" style={PAGE_BG}>
        {header}
        <main className="max-w-2xl mx-auto px-3.5 sm:px-4 mt-4 sm:mt-6 space-y-4 sm:space-y-5">
          <Reveal>
            <section className={`${PANEL} p-4 sm:p-6`}>
              <div className="flex items-start gap-3 sm:gap-4">
                <span className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-2xl grid place-items-center bg-primary/10 border border-primary/40 text-xl sm:text-2xl font-extrabold text-primary shadow-[0_0_24px_rgba(255,201,40,0.25)]">
                  {staffData.staff.name.trim().charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-xs text-gray-500 font-semibold">لوحة الموظفين</p>
                  <h1 className="mt-1 text-lg sm:text-2xl font-extrabold text-white leading-tight break-words">{staffData.staff.name}</h1>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] font-mono text-[11px] tracking-widest text-gray-300" dir="ltr">
                      {staffData.staff.staffCode}
                    </span>
                    <Badge tone="gold">{STAFF_ROLE_TEXT[staffData.staff.role] || staffData.staff.role}</Badge>
                    {staffData.staff.branches.map(b => (
                      <Badge key={b.id} tone="gray">فرع {b.name}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className={`mt-4 flex items-start gap-2.5 rounded-xl px-3.5 py-3 border ${staffData.present ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[#0A0F1F] border-white/[0.06]'}`}>
                <UiIcon
                  name={staffData.present ? 'check' : 'clock'}
                  className={`w-4 h-4 mt-0.5 shrink-0 ${staffData.present ? 'text-emerald-400' : 'text-gray-500'}`}
                />
                <p className={`text-sm font-medium leading-relaxed ${staffData.present ? 'text-emerald-400' : 'text-gray-400'}`}>
                  {staffData.present ? 'انت داخل الوردية دلوقتي — مختمش انصراف لسه' : 'مش في أي وردية دلوقتي'}
                </p>
              </div>
            </section>
          </Reveal>

          <Reveal delay={60}>
            <section className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <PortalStat icon="clock" tone={NEON.gold} label="ساعات اليوم">
                <span className="text-base sm:text-lg">{staffData.hoursTodayLabel}</span>
              </PortalStat>
              <PortalStat icon="reports" tone={NEON.violet} label="ساعات الشهر">
                <span className="text-base sm:text-lg">{staffData.hoursMonthLabel}</span>
              </PortalStat>
              <PortalStat icon="attendance" tone={NEON.blue} label="أيام العمل">
                <CountUp value={staffData.daysWorkedMonth} duration={900} />
              </PortalStat>
            </section>
          </Reveal>

          <Reveal delay={120}>{codeSection}</Reveal>
          <Reveal delay={60}>{cardSection}</Reveal>

          <Reveal delay={60}>
            <section className={`${PANEL} p-4 sm:p-5`}>
              <PanelHead title="آخر ١٤ يوم حضور" />
              {staffData.shifts.length === 0 ? (
                <p className="mt-3 text-sm text-gray-400">لسه مفيش ورديات مسجلة</p>
              ) : (
                <ul className="mt-3 divide-y divide-white/[0.06]">
                  {staffData.shifts.map(s => (
                    <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{formatDate(s.checkInTime)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.branchName}</p>
                      </div>
                      <div className="text-left flex-shrink-0">
                        <p className="text-sm font-mono text-gray-200" dir="ltr">
                          {fmtClock(s.checkInTime)} → {fmtClock(s.checkOutTime)}
                        </p>
                        <p className="text-xs text-primary mt-0.5">{fmtShiftMinutes(s.minutes)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Reveal>

          <p className="text-center text-xs text-gray-600 pt-2">POWER 111 — لياقة • صحة • تغذية</p>
        </main>
        {viewer}
      </div>
    );
  }

  // ===== Member dashboard =====
  if (!data) return null;
  const { member, currentSubscription, totalVisits, currentlyInBranch, trainersOnDuty } = data;
  const remaining = currentSubscription ? daysRemaining(currentSubscription.endDate) : 0;
  const start = currentSubscription ? new Date(currentSubscription.startDate).getTime() : 0;
  const end = currentSubscription ? new Date(currentSubscription.endDate).getTime() : 1;
  const progress = currentSubscription ? Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)) : 0;
  const duePiasters = currentSubscription ? currentSubscription.pricePiasters - currentSubscription.paidPiasters : 0;
  const isActive = !!currentSubscription && remaining > 0 && currentSubscription.status !== 'CANCELLED';
  const profileBmi = bmiOf(member.weightKg, member.heightCm);
  // While the profile is incomplete the البروفايل tile wears the gold ring — the mockup's one loud CTA.
  const profileIncomplete = !member.photoPath || !member.weightKg || !member.heightCm;
  const notifState = permissionState();
  const myPendingBooking = physio?.bookings.find(b => b.status === 'PENDING') || null;

  const heroSection = (
    <section className={`${PANEL} relative overflow-hidden p-4 sm:p-6`}>
      {/* Gold light sweeping in from the avatar corner — the reference's one loud move. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(340px 220px at 12% 18%, rgba(255,201,40,0.20), transparent 62%), linear-gradient(135deg, rgba(255,201,40,0.10), transparent 46%), radial-gradient(420px 240px at 96% 108%, rgba(56,116,255,0.12), transparent 60%)'
        }}
      />

      <div className="relative flex items-center gap-3.5 sm:gap-5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] sm:text-xs text-[#FFD95C] font-bold">أهلاً بيك</p>
          <h1 className="mt-1 text-xl sm:text-[28px] font-extrabold text-white leading-tight break-words tracking-tight">{member.name}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={isActive ? 'green' : 'red'}>{isActive ? 'عضوية نشطة' : 'عضوية غير نشطة'}</Badge>
            <Badge tone="gray">فرع {member.branch.name}</Badge>
          </div>
          <span
            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FFC928]/[0.08] border border-[#FFC928]/35 font-mono text-[11px] tracking-widest text-[#FFD95C]"
            dir="ltr"
          >
            <UiIcon name="medal" className="w-3.5 h-3.5" />
            {member.memberCode}
          </span>
        </div>
        <div className="relative shrink-0">
          <div
            aria-hidden="true"
            className="absolute -inset-4 rounded-full"
            style={{ background: 'radial-gradient(closest-side, rgba(255,201,40,0.32), transparent 72%)' }}
          />
          <div
            className="relative w-20 h-20 sm:w-24 sm:h-24 overflow-hidden rounded-full grid place-items-center"
            style={{
              background: 'radial-gradient(120% 120% at 32% 22%, #1B2440, #070B16 72%)',
              boxShadow: '0 0 0 2px #FFC928, 0 0 34px rgba(255,201,40,0.45)'
            }}
          >
            {member.photoPath ? (
              <img src={member.photoPath} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="flex flex-col items-center text-primary">
                <CrownMark className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="text-3xl sm:text-4xl font-extrabold leading-none mt-0.5">{member.name.trim().charAt(0)}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2 sm:gap-2.5">
        <DataCell label="الوزن" icon="weight" value={member.weightKg ? `${member.weightKg} كجم` : '—'} />
        <DataCell label="الطول" icon="height" value={member.heightCm ? `${member.heightCm} سم` : '—'} />
        <DataCell
          label="كتلة الجسم"
          icon="users"
          iconTone={NEON.violet}
          value={profileBmi !== null ? profileBmi : '—'}
          tone={profileBmi !== null ? bmiBand(profileBmi).tone : 'text-white'}
        />
      </div>

      {!member.weightKg && !member.heightCm && !member.photoPath && (
        <p className="relative mt-3 text-xs text-gray-500 leading-relaxed">سجّل صورتك ووزنك وطولك عشان المدرب يستقبلَك على بروفايلك.</p>
      )}

      <div className="relative mt-3 grid grid-cols-4 gap-2 sm:gap-2.5">
        <QuickAction icon="barcode" label="بطاقتي" tone={NEON.violet} onClick={() => changeTab('card')} />
        <QuickAction icon="physio" label="اطلب جلسة" tone={NEON.green} onClick={goToPhysio} />
        <QuickAction icon="clock" label="سجلي" tone={NEON.blue} onClick={() => changeTab('records')} />
        <QuickAction icon="member" label="البروفايل" tone={NEON.gold} active={profileIncomplete} onClick={() => setProfileOpen(true)} />
      </div>
    </section>
  );

  const subscriptionSection = currentSubscription ? (
    <section className={`${PANEL} relative overflow-hidden p-4 sm:p-6`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(420px 200px at 100% 0%, rgba(56,116,255,0.12), transparent 60%), radial-gradient(300px 180px at 0% 100%, rgba(255,201,40,0.08), transparent 60%)'
        }}
      />
      <PanelHead
        title="اشتراكك الحالي"
        right={
          <Badge tone={currentSubscription.isFrozen ? 'amber' : (STATUS_TONE[currentSubscription.status] || 'gray')}>
            {currentSubscription.isFrozen ? 'مجمّد' : STATUS_TEXT[currentSubscription.status] || currentSubscription.status}
          </Badge>
        }
      />

      <div className="relative mt-4 flex items-center gap-4 sm:gap-5">
        <ProgressRing percent={progress} tone={remaining > 7 ? 'text-primary' : 'text-rose-500'} />
        <div className="min-w-0">
          <div className="text-base sm:text-xl font-extrabold text-primary leading-snug">{currentSubscription.plan.nameAr}</div>
          <div className={`mt-1.5 text-sm font-bold ${remaining > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {remaining > 0 ? `متبقي ${remaining} يوم` : 'انتهى الاشتراك'}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] sm:text-xs text-gray-500 leading-relaxed" dir="rtl">
            <UiIcon name="calendar" className="w-3.5 h-3.5 shrink-0" />
            <span>{formatDate(currentSubscription.startDate)}</span>
            <span className="mx-0.5">←</span>
            <span>{formatDate(currentSubscription.endDate)}</span>
          </div>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-2.5">
        <div className={`${PANEL_INNER} px-3 py-2.5 flex items-center gap-2.5 min-w-0`}>
          <span
            className="w-9 h-9 shrink-0 rounded-lg grid place-items-center"
            style={{ backgroundColor: `${NEON.violet}1f`, color: NEON.violet, boxShadow: `0 0 16px ${NEON.violet}26` }}
          >
            <UiIcon name="wallet" className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] text-gray-500 font-semibold leading-snug">إجمالي الاشتراك</p>
            <p className="mt-0.5 text-[13px] sm:text-sm font-bold text-white leading-tight" dir="rtl">
              {formatEGP(currentSubscription.pricePiasters)}
            </p>
          </div>
        </div>
        <div className={`${PANEL_INNER} px-3 py-2.5 flex flex-row-reverse items-center justify-between gap-2.5 min-w-0`}>
          <span
            className="w-9 h-9 shrink-0 rounded-lg grid place-items-center"
            style={{
              backgroundColor: `${duePiasters > 0 ? '#F26D6D' : NEON.green}1f`,
              color: duePiasters > 0 ? '#F26D6D' : NEON.green,
              boxShadow: `0 0 16px ${duePiasters > 0 ? '#F26D6D' : NEON.green}26`
            }}
          >
            <UiIcon name={duePiasters > 0 ? 'clock' : 'check'} className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] text-gray-500 font-semibold leading-snug">
              {duePiasters > 0 ? 'المتبقي عليك' : 'مدفوع بالكامل'}
            </p>
            <p
              className={`mt-0.5 text-[13px] sm:text-sm font-bold leading-tight ${duePiasters > 0 ? 'text-rose-400' : 'text-emerald-400'}`}
              dir="rtl"
            >
              {duePiasters > 0 ? formatEGP(duePiasters) : '✓'}
            </p>
          </div>
        </div>
      </div>

      {remaining <= 7 && (
        <a
          href={whatsappLink(member.branch.phone || SUPPORT_PHONE, `أريد تجديد اشتراكي — ${member.name} كود ${member.memberCode}`) || `tel:${member.branch.phone || SUPPORT_PHONE}`}
          target="_blank"
          rel="noreferrer"
          className={`${btnClass('primary')} relative mt-4 w-full`}
        >
          جدّد اشتراكك دلوقتي
        </a>
      )}
    </section>
  ) : (
    <section className={`${PANEL} border-rose-500/30 bg-rose-500/[0.04] p-5 sm:p-6 text-center`}>
      <span className="w-11 h-11 mx-auto rounded-2xl grid place-items-center bg-rose-500/10 text-rose-400">
        <UiIcon name="warning" className="w-5 h-5" />
      </span>
      <h2 className="mt-3 text-base sm:text-lg font-extrabold text-rose-400">لا يوجد اشتراك نشط</h2>
      <p className="text-sm text-gray-400 mt-2 leading-relaxed">راجع موظف الاستقبال في فرع {member.branch.name} لتجديد اشتراكك</p>
      {member.branch.phone && (
        <a href={`tel:${member.branch.phone}`} dir="ltr" className={`${btnClass('primary')} mt-4`}>
          <UiIcon name="phone" className="w-4 h-4" />
          اتصل بالفرع
        </a>
      )}
    </section>
  );

  const statsSection = (
    <section className="grid grid-cols-3 gap-2.5 sm:gap-3">
      <PortalStat icon="attendance" tone={NEON.gold} label="إجمالي الزيارات">
        <CountUp value={totalVisits} duration={900} />
      </PortalStat>
      <PortalStat icon="member" tone={NEON.green} label="في الفرع حالياً">
        <CountUp value={currentlyInBranch} duration={900} />
      </PortalStat>
      <PortalStat icon="calendar" tone={NEON.blue} label="آخر زيارة">
        <span className="text-[13px] sm:text-base">
          {data.attendances.length > 0 ? formatShortDate(data.attendances[0].checkInTime) : '—'}
        </span>
      </PortalStat>
    </section>
  );

  const trainersSection = (
    <section className={`${PANEL} p-4 sm:p-6`}>
      <PanelHead title="المدرب الموجود الآن" right={
        trainersOnDuty.length > 0 ? <Badge tone="green">{trainersOnDuty.length}</Badge> : undefined
      } />
      {trainersOnDuty.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 leading-relaxed">لا يوجد مدرب في الفرع حالياً — اسأل موظف الاستقبال عند الوصول</p>
      ) : (
        <ul className="mt-3.5 space-y-3">
          {trainersOnDuty.map((name, i) => (
            <li key={`${name}-${i}`} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-base font-bold text-primary">
                {name.trim().charAt(0)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{name}</span>
              {/* A live dot, breathing — this list is the only thing here that changes by the minute. */}
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const physioSection = (
    <section id="physio" className={`${PANEL} p-4 sm:p-6`}>
      <PanelHead
        title="جلسات العلاج الطبيعي"
        hint="اطلب ميعادك — الجيم بتراجع الطلب وتحدد سعر الجلسة، وهتشوف الرد هنا"
        right={myPendingBooking ? <Badge tone="amber">قيد المراجعة</Badge> : undefined}
      />

      {physio && (
        <p className="mt-3 text-sm leading-relaxed text-gray-400">
          {myPendingBooking
            ? physio.aheadOfMe === 0
              ? 'طلبك قيد المراجعة دلوقتي — انت أول واحد في طابور الفرع'
              : `طلبك قيد المراجعة — قدامك ${physio.aheadOfMe} طلب في طابور الفرع`
            : physio.pendingCount > 0
              ? `في ${physio.pendingCount} طلب قيد المراجعة في فرعك دلوقتي`
              : 'مفيش طلبات مستنية في فرعك دلوقتي'}
        </p>
      )}

      {!myPendingBooking && (
        <form onSubmit={handlePhysioBook} className="mt-4 space-y-4">
          {physioError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/40 rounded-lg text-rose-400 text-sm text-center">{physioError}</div>
          )}
          <div>
            <label htmlFor="physio-date" className={LABEL}>يوم الجلسة</label>
            <input
              id="physio-date"
              type="date"
              required
              value={physioDate}
              min={isoDay(0)}
              max={isoDay(90)}
              onChange={(e) => setPhysioDate(e.target.value)}
              className={NIGHT_FIELD}
            />
          </div>
          <div>
            <label htmlFor="physio-note" className={LABEL}>ملاحظة (اختياري)</label>
            <textarea
              id="physio-note"
              rows={2}
              maxLength={300}
              value={physioNote}
              onChange={(e) => setPhysioNote(e.target.value)}
              placeholder="شكوتك أو الوقت المناسب ليك"
              className={`${NIGHT_FIELD} resize-none py-3`}
            />
          </div>
          <Btn type="submit" variant="primary" className="w-full" disabled={physioBusy || !physioDate}>
            {physioBusy ? 'جاري الإرسال…' : 'اطلب جلسة'}
          </Btn>
        </form>
      )}

      {physio && physio.bookings.length > 0 && (
        <ul className="mt-5 divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {physio.bookings.map(b => (
            <li key={b.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{formatDate(b.requestedDate)}</p>
                  {b.note && <p className="text-xs text-gray-500 mt-0.5 truncate">{b.note}</p>}
                </div>
                <div className="text-left shrink-0">
                  <Badge tone={PHYSIO_STATUS_TONE[b.status] || 'amber'}>
                    {PHYSIO_STATUS_TEXT[b.status] || b.status}
                  </Badge>
                  {b.status === 'APPROVED' && b.pricePiasters != null && (
                    <p className="mt-1.5 text-sm font-bold text-emerald-400">{formatEGP(b.pricePiasters)}</p>
                  )}
                </div>
              </div>
              {b.status === 'DECLINED' && b.declineReason && (
                <p className="mt-2 text-sm text-rose-300/90 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 leading-relaxed">
                  سبب الرفض: {b.declineReason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const recordsSection = (
    <section className={`${PANEL} p-4 sm:p-5`}>
      <div className="flex items-stretch border-b border-white/[0.06] -mx-1">
        {RECORD_TABS.map(t => {
          const active = recordTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setRecordTab(t.id)}
              aria-pressed={active}
              className={`relative flex-1 px-1 py-3 min-h-12 text-[11px] sm:text-sm font-bold transition-colors duration-200 ${
                active ? 'text-primary' : 'text-gray-400 active:text-gray-200 sm:hover:text-gray-200'
              }`}
            >
              {t.label}
              <span
                aria-hidden
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
                style={{
                  transform: active ? 'scaleX(1)' : 'scaleX(0)',
                  transition: 'transform 260ms cubic-bezier(.16,.84,.44,1)'
                }}
              />
            </button>
          );
        })}
      </div>

      <div key={recordTab}>
        {recordTab === 'visits' && (
          data.attendances.length === 0 ? (
            <EmptyState icon="clock" title="لم يتم تسجيل أي زيارة بعد" />
          ) : (
            <ul className="mt-1 divide-y divide-white/[0.06]">
              {data.attendances.map((att, i) => (
                <Reveal key={att.id} delay={Math.min(i, 6) * 50} y={10} duration={380}>
                  <li className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">{formatDate(att.checkInTime)}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{att.branch.name}</div>
                    </div>
                    <div className="text-xs text-gray-400 shrink-0 font-mono" dir="ltr">
                      {new Date(att.checkInTime).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}
                    </div>
                  </li>
                </Reveal>
              ))}
            </ul>
          )
        )}

        {recordTab === 'payments' && (
          data.payments.length === 0 ? (
            <EmptyState icon="wallet" title="لا توجد مدفوعات مسجلة" />
          ) : (
            <ul className="mt-1 divide-y divide-white/[0.06]">
              {data.payments.map((pay, i) => (
                <Reveal key={pay.id} delay={Math.min(i, 6) * 50} y={10} duration={380}>
                  <li className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">{pay.subscription.plan.nameAr}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{formatDate(pay.createdAt)} • {METHOD_TEXT[pay.method] || pay.method}</div>
                    </div>
                    <div className="text-sm font-bold text-emerald-400 shrink-0">{formatEGP(pay.amountPiasters)}</div>
                  </li>
                </Reveal>
              ))}
            </ul>
          )
        )}

        {recordTab === 'history' && (
          data.pastSubscriptions.length === 0 ? (
            <EmptyState icon="subscriptions" title="لا توجد اشتراكات سابقة" />
          ) : (
            <ul className="mt-1 divide-y divide-white/[0.06]">
              {data.pastSubscriptions.map((sub, i) => (
                <Reveal key={sub.id} delay={Math.min(i, 6) * 50} y={10} duration={380}>
                  <li className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">{sub.plan.nameAr}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatDate(sub.startDate)} — {formatDate(sub.endDate)}
                      </div>
                    </div>
                    <Badge tone={STATUS_TONE[sub.status] || 'gray'} className="shrink-0">
                      {STATUS_TEXT[sub.status] || sub.status}
                    </Badge>
                  </li>
                </Reveal>
              ))}
            </ul>
          )
        )}
      </div>
    </section>
  );

  const notificationsModal = (
    <Modal
      open={notifOpen}
      title="إشعاراتك"
      subtitle={
        pushOn
          ? 'الإشعارات شغالة على الجهاز ده — أي رد على جلسة أو عرض جديد يوصلك بره التطبيق.'
          : 'شغّل الإشعارات عشان يوصلك رد الجيم على جلسات العلاج الطبيعي والعروض الجديدة، والتطبيق مقفول.'
      }
      onClose={() => setNotifOpen(false)}
      width="max-w-md"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <Btn
          variant={pushOn ? 'ghost' : 'primary'}
          icon="bell"
          onClick={handlePushToggle}
          disabled={pushBusy}
        >
          {pushBusy ? 'جاري التشغيل…' : pushOn ? 'إيقاف الإشعارات' : 'تفعيل الإشعارات'}
        </Btn>
        {unreadCount > 0 && (
          <>
            <Badge tone="gold">{unreadCount} جديد</Badge>
            <Btn variant="quiet" onClick={markNotificationsRead}>تعليم الكل كمقروء</Btn>
          </>
        )}
      </div>

      {notifState === 'unsupported' && !pushOn && (
        <p className="text-xs text-gray-500 leading-relaxed">
          الإشعارات شغالة لما تفتح البوابة من التطبيق المثبت على الموبايل.
        </p>
      )}

      {pushMessage && <p className="text-sm text-gray-400">{pushMessage}</p>}

      {notifications.length > 0 ? (
        <ul className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {notifications.slice(0, 8).map(n => (
            <li key={n.id} className="py-3 flex items-start gap-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.readAt ? 'bg-white/15' : 'bg-primary'}`} />
              <div className="min-w-0">
                <p className={`text-sm leading-snug ${n.readAt ? 'text-gray-300' : 'text-white font-semibold'}`}>{n.title}</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{n.body}</p>
                <p className="text-[11px] text-gray-600 mt-1">{timeAgo(n.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="bell" title="مفيش إشعارات لحد دلوقتي." />
      )}
    </Modal>
  );

  return (
    <div className="min-h-screen" style={PAGE_BG}>
      {header}

      <main className="max-w-2xl mx-auto px-3.5 sm:px-4 mt-4 sm:mt-6 pb-28 space-y-4 sm:space-y-5">
        {tab === 'home' && (
          <>
            <Reveal>{heroSection}</Reveal>
            <Reveal delay={60}>{subscriptionSection}</Reveal>
            <Reveal delay={60}>{statsSection}</Reveal>
            <Reveal delay={60}>{trainersSection}</Reveal>
            {profileBmi !== null && (
              <Reveal delay={60}>
                <BmiIndicator weightKg={member.weightKg} heightCm={member.heightCm} />
              </Reveal>
            )}
          </>
        )}

        {tab === 'card' && (
          <>
            {/* The code is the daily action, so it leads; the printable card is the backup. */}
            <Reveal>{codeSection}</Reveal>
            <Reveal delay={60}>{cardSection}</Reveal>
          </>
        )}

        {tab === 'physio' && <Reveal>{physioSection}</Reveal>}

        {tab === 'records' && <Reveal>{recordsSection}</Reveal>}

        <p className="text-center text-xs text-gray-600 pt-2">POWER 111 — لياقة • صحة • تغذية</p>
      </main>

      <PortalTabs tab={tab} onChange={changeTab} />
      {viewer}
      {notificationsModal}
      <ProfileModal
        open={profileOpen}
        member={member}
        onClose={() => setProfileOpen(false)}
        onSaved={applyProfile}
      />
    </div>
  );
}
