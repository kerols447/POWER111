import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Btn, Badge, UiIcon, CARD_ELEVATED, TONE } from './ui';
import { usePrefersReducedMotion } from './Motion';
import MemberAvatar from './MemberAvatar';
import { displayPhone } from '../utils/whatsapp';

// The profile the API attaches to a check-in that has no live subscription.
export interface ExpiredSubscriptionProfile {
  hasAnySubscription: boolean;
  lastPlanName: string | null;
  lastDurationDays: number | null;
  lastEndDate: string | null;
  daysOverdue: number | null;
  pricePiasters: number | null;
  paidPiasters: number | null;
  remainingPiasters: number;
  visitsThisMonth: number;
  lastVisit: string | null;
}

export interface ExpiredArrival {
  key: string;
  memberId: string;
  name: string;
  code: string;
  phone?: string | null;
  photoPath?: string | null;
  branchName?: string | null;
  checkInTime: string;
  // Set when the scan happened without network, so the subscription facts arrive on sync.
  fromCache?: boolean;
  profile?: ExpiredSubscriptionProfile | null;
}

const dateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });

const timeOnly = (iso: string) =>
  new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });

const egp = (piasters: number) =>
  `${(piasters / 100).toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: 2 })} ج`;

function Fact({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-dark/60 border border-dark-border rounded-xl px-3 py-2 min-w-0">
      <p className="text-[11px] text-gray-500 leading-none">{label}</p>
      <p className={`mt-1.5 text-[13px] font-bold truncate ${tone}`} title={value}>{value}</p>
    </div>
  );
}

// Nothing inside this window may take keyboard focus: a handheld gun types into the
// document, and a focused button would eat the Enter that closes a scan.
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/**
 * Non-blocking profile of a member who just walked in with no live subscription.
 * It floats over the scanner without a backdrop, so the camera keeps running and the
 * next card can be scanned while this one is still open.
 */
export default function ExpiredCheckinCard({
  arrivals,
  canRenew,
  onDismiss,
  onRenew
}: {
  arrivals: ExpiredArrival[];
  canRenew: boolean;
  onDismiss: (key: string) => void;
  onRenew: (arrival: ExpiredArrival) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [selectedKey, setSelectedKey] = useState(arrivals[0]?.key ?? '');

  // The member standing at the desk always takes the window over the one from a minute ago.
  useEffect(() => {
    if (arrivals.length) setSelectedKey(arrivals[0].key);
  }, [arrivals]);

  const current = arrivals.find(a => a.key === selectedKey) || arrivals[0];
  if (!current) return null;

  const profile = current.profile;
  const overdue = profile?.daysOverdue ?? null;
  const remaining = profile?.remainingPiasters ?? 0;

  const headline = current.fromCache
    ? 'الاشتراك خلصان — التفاصيل تكمل لما النت يرجع'
    : !profile || !profile.hasAnySubscription
      ? 'العضو ده ملوش أي اشتراك مسجل'
      : overdue === 0
        ? 'الاشتراك خلص النهارده'
        : `الاشتراك خلصان من ${overdue} يوم`;

  return createPortal(
    <div className="fixed z-40 bottom-[84px] inset-x-3 sm:inset-x-auto sm:bottom-[80px] sm:left-5 sm:w-[358px] pointer-events-none">
      {arrivals.length > 1 && (
        <div className="pointer-events-auto mb-2 flex items-center gap-1.5 overflow-x-auto">
          <span className="shrink-0 text-[11px] font-bold text-gray-500 px-1">
            {arrivals.length} أعضاء
          </span>
          {arrivals.map(arrival => {
            const active = arrival.key === current.key;
            return (
              <button
                key={arrival.key}
                type="button"
                onMouseDown={keepFocus}
                onClick={() => setSelectedKey(arrival.key)}
                aria-label={`بروفايل ${arrival.name}`}
                className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-xl transition-[opacity,box-shadow] duration-200 ${
                  active ? 'ring-2 ring-primary opacity-100' : 'opacity-55 hover:opacity-90'
                }`}
              >
                <MemberAvatar
                  name={arrival.name}
                  photoPath={arrival.photoPath}
                  tone={active ? TONE.gold : TONE.expenses}
                  className="w-9 h-9 rounded-xl"
                  letterClassName="text-xs font-bold"
                />
              </button>
            );
          })}
        </div>
      )}

      <div
        role="status"
        onMouseDown={keepFocus}
        className={`${CARD_ELEVATED} border-rose-500/25 overflow-hidden shadow-2xl shadow-black/60 ${
          reduced ? '' : 'animate-modal-in'
        }`}
      >
        <div className="flex items-start gap-3 p-4">
          <MemberAvatar
            name={current.name}
            photoPath={current.photoPath}
            tone={TONE.expenses}
            className="w-14 h-14 rounded-2xl"
            letterClassName="text-xl font-bold"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge tone="red">
                <UiIcon name="warning" className="w-3 h-3" />
                اشتراك منتهي
              </Badge>
              <span className="text-[11px] text-gray-500">دخل {timeOnly(current.checkInTime)}</span>
            </div>
            <p className="mt-2 text-[15px] font-extrabold text-white leading-tight truncate" title={current.name}>
              {current.name}
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] min-w-0">
              <span className="font-mono text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-lg">
                {current.code}
              </span>
              <span className="text-gray-400 truncate">{displayPhone(current.phone)}</span>
            </div>
          </div>
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => onDismiss(current.key)}
            aria-label="إغلاق"
            className="w-11 h-11 sm:w-8 sm:h-8 -mt-1 -me-1 shrink-0 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <UiIcon name="close" className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-4">
          <p className={`text-[13px] font-bold ${profile?.hasAnySubscription ? 'text-rose-300' : 'text-primary'}`}>
            {headline}
          </p>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <Fact label="آخر باقة" value={profile?.lastPlanName || '—'} />
            <Fact
              label="خلصت في"
              value={profile?.lastEndDate ? dateOnly(profile.lastEndDate) : '—'}
              tone="text-rose-300"
            />
            <Fact
              label="فاضل في الاشتراك"
              value={remaining > 0 ? egp(remaining) : 'لا يوجد'}
              tone={remaining > 0 ? 'text-rose-300' : 'text-emerald-400'}
            />
            <Fact
              label="آخر دخول"
              value={profile?.lastVisit ? `${dateOnly(profile.lastVisit)} · ${timeOnly(profile.lastVisit)}` : 'أول دخول'}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-dark-border bg-dark/40">
          {/* Reception without the subscriptions permission gets the profile, not a dead CTA. */}
          <Btn variant="primary" icon={canRenew ? 'subscriptions' : 'member'} className="flex-1 min-w-0" onClick={() => onRenew(current)}>
            {canRenew ? 'تجديد الاشتراك' : 'بروفايل العضو'}
          </Btn>
          <Btn variant="ghost" onClick={() => onDismiss(current.key)}>
            خدنا بالنا
          </Btn>
        </div>
      </div>
    </div>,
    document.body
  );
}
