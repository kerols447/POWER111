import { useEffect, useRef } from 'react';

/**
 * One design language for every admin screen, lifted from the dashboard:
 * the same card, the same icon weight, the same type scale, the same gold.
 */

export const GOLD = '#F59E0B';

export const TONE = {
  gold: GOLD,
  revenue: '#34D399',
  expenses: '#FB7185',
  profit: GOLD,
  outstanding: '#FBBF24',
  members: GOLD,
  attendance: '#38BDF8',
  staff: '#818CF8',
  products: '#22D3EE',
  sales: '#34D399',
  reports: '#A78BFA',
  expiring: '#FBBF24',
  danger: '#FB7185',
  neutral: '#9CA3AF'
};

export const CARD = 'bg-dark-card border border-dark-border rounded-2xl';

export const FIELD =
  'w-full bg-dark border border-dark-border rounded-xl px-4 py-3 sm:py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/60 transition-colors min-h-[44px]';

export const LABEL = 'block text-[11px] sm:text-xs text-gray-500 font-semibold mb-1.5';

type IconName = keyof typeof UI_ICONS;

// Line icons drawn on the same 24x24 grid as the sidebar so nothing looks heavier or lighter.
const UI_ICONS = {
  search: ['M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z', 'm15.25 15.25 4 4'],
  plus: ['M12 5.5v13M5.5 12h13'],
  close: ['m6.5 6.5 11 11M17.5 6.5l-11 11'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  chevronDown: ['m6.5 9.5 5.5 5.5 5.5-5.5'],
  chevronLeft: ['m14.5 5.5-7 6.5 7 6.5'],
  filter: ['M4 6.5h16', 'M7 12h10', 'M10 17.5h4'],
  calendar: ['M4.5 7.5h15v11a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-11Z', 'M4.5 11h15', 'M8.5 4.5v4M15.5 4.5v4'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7.5V12l3 2'],
  barcode: ['M4 6.5v11M6.5 6.5v11M9 6.5v11M11.5 6.5v7M14 6.5v11M16.5 6.5v7M19 6.5v11'],
  trash: ['M5 7h14', 'M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7', 'M6.5 7l1 12a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-12', 'M10 11v5M14 11v5'],
  edit: ['M4.5 19.5h5L20 9a2.1 2.1 0 0 0-3-3L6.5 16.5v3Z', 'M14.5 6.5l3 3'],
  download: ['M12 4v10', 'm8 10.5 4 4 4-4', 'M4.5 19.5h15'],
  print: ['M7 9.5V5h10v4.5', 'M4.5 9.5h15v7a1 1 0 0 1-1 1H17v-3H7v3H5.5a1 1 0 0 1-1-1v-7Z', 'M7 16.5h10v3.5H7Z'],
  warning: ['M12 4.5 3.5 19h17L12 4.5Z', 'M12 10v4', 'M12 16.5h.01'],
  empty: ['M4 9.5h16', 'M5 9.5 6.5 5h11L19 9.5', 'M5 9.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.5', 'M9.5 13h5'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  wallet: ['M4 7.5h13a3 3 0 0 1 3 3v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9Z', 'M4 7.5V6a1.5 1.5 0 0 1 1.5-1.5h9', 'M16.5 13.5h.01'],
  bolt: ['M13 3.5 5.5 13.5H11l-1 7 8.5-10.5H13l1-6.5Z'],
  refresh: ['M20 11.5a8 8 0 1 0-2.3 5.8', 'M20 6.5v5h-5'],
  phone: ['M6.5 4h3l1.5 3.5-2 1.5a11 11 0 0 0 5 5l1.5-2 3.5 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 6a2 2 0 0 1 2-2Z'],
  member: ['M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M3.5 20a5.5 5.5 0 0 1 11 0', 'M17.5 8.5a2.5 2.5 0 1 0 0-5', 'M16.5 14.5a4 4 0 0 1 4 4v1'],
  attendance: ['M4.5 6.5A1.5 1.5 0 0 1 6 5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5Z', 'M4.5 9.5h15', 'M8 3.5v3M16 3.5v3', 'M9 14l2 2 4-4'],
  subscriptions: ['M8.5 4.5h7a1 1 0 0 1 1 1v1H8.5v-1a1 1 0 0 1 1-1Z', 'M6 6.5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19V8A1.5 1.5 0 0 1 6 6.5Z', 'M8.5 12h7M8.5 15.5h4.5'],
  products: ['M12 3.5 20 7.5v9L12 20.5 4 16.5v-9Z', 'M4 7.5 12 11.5l8-4', 'M12 11.5v9'],
  sales: ['M4 7h16v10.5H4Z', 'M4 7l2.5-3h11L21 7', 'M12 10.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Z'],
  expenses: ['M4.5 8h15a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5v-7A1.5 1.5 0 0 1 4.5 8Z', 'M3 10.5h18', 'M16.5 14.5h2'],
  staff: ['M4.5 8.5A1.5 1.5 0 0 1 6 7h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5Z', 'M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7', 'M4.5 12.5h15', 'M10.5 15.5h3'],
  branches: ['M4.5 20.5h15', 'M6.5 20.5V4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5v16', 'M10 20.5V16h4v4.5'],
  reports: ['M4 20h16', 'M6.5 20V11M11.5 20V6M16.5 20v-7'],
  whatsapp: ['M4 5.5h16v10.5H9.75L5.5 19.5V16H4Z', 'M8.25 10.75h.01M11.75 10.75h.01M15.25 10.75h.01'],
  users: ['M15.75 20v-1.8a3.4 3.4 0 0 0-3.4-3.4H6.9a3.4 3.4 0 0 0-3.4 3.4V20', 'M9.5 11.25a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z'],
  settings: ['M4 8.25h8M16.5 8.25h3.5', 'M4 15.75h3.5M12 15.75h8', 'M14 8.25a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0Z', 'M6 15.75a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0Z'],
  offers: ['M4 10.5h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z', 'M3 7h18v3.5H3Z', 'M12 7v13.5'],
  home: ['M3 10.75 12 3.25l9 7.5', 'M5.5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h10A1.5 1.5 0 0 0 18.5 19V9.5'],
  wifiOff: ['M8.3 15a5.25 5.25 0 0 1 7.4 0', 'M5.1 11.86a9.72 9.72 0 0 1 13.8 0', 'M1.92 8.67a14.2 14.2 0 0 1 20.16 0', 'm12 18.25.53.53-.53.53-.53-.53Z', 'm4 4 16 16']
} as const;

export function UiIcon({ name, className = 'w-4 h-4' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {UI_ICONS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** Page title with the gold chip, a plain caption and the page's own actions on the left. */
export function PageHeader({
  icon,
  title,
  caption,
  tone = GOLD,
  actions
}: {
  icon: IconName;
  title: string;
  caption?: React.ReactNode;
  tone?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${tone}14`, color: tone }}
          >
            <UiIcon name={icon} className="w-4 h-4" />
          </span>
          <h1 className="text-2xl sm:text-[26px] font-extrabold text-white tracking-tight leading-none">{title}</h1>
        </div>
        {caption && <p className="text-[13px] text-gray-500 mt-2 leading-relaxed">{caption}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}

/** Section heading used inside a card — the same gold tick the dashboard uses. */
export function SectionTitle({
  children,
  tone = GOLD,
  right
}: {
  children: React.ReactNode;
  tone?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: tone }} />
        <h3 className="text-[15px] sm:text-base font-extrabold text-white">{children}</h3>
      </div>
      {right}
    </div>
  );
}

/** Summary tile. `value` must always be a real dataset total, never a page slice. */
export function StatTile({
  icon,
  tone = GOLD,
  label,
  value,
  caption,
  onClick,
  badge
}: {
  icon: IconName;
  tone?: string;
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  onClick?: () => void;
  badge?: React.ReactNode;
}) {
  const shell = `${CARD} group relative overflow-hidden p-3.5 sm:p-5 text-right`;
  const inner = (
    <>
      {badge && <div className="absolute top-3.5 left-3.5">{badge}</div>}
      <span
        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-[1.03] transition-transform"
        style={{ backgroundColor: `${tone}14`, color: tone }}
      >
        <UiIcon name={icon} className="w-5 h-5 sm:w-6 sm:h-6" />
      </span>
      <p className="mt-3 sm:mt-2 text-[11px] sm:text-xs text-gray-500 font-semibold">{label}</p>
      <p className="mt-1.5 sm:mt-1 text-[22px] sm:text-[30px] leading-none font-extrabold text-white tracking-tight">{value}</p>
      {caption && <p className="text-[10px] sm:text-[11px] text-gray-600 mt-1.5 sm:mt-2 leading-snug">{caption}</p>}
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className={`${shell} hover:border-primary/40 transition-colors`}>
        {inner}
      </button>
    );
  }
  return <div className={shell}>{inner}</div>;
}

export function Badge({
  children,
  tone = 'gray',
  className = ''
}: {
  children: React.ReactNode;
  tone?: 'gold' | 'green' | 'red' | 'amber' | 'blue' | 'gray';
  className?: string;
}) {
  const tones: Record<string, string> = {
    gold: 'bg-primary/10 text-primary',
    green: 'bg-emerald-500/10 text-emerald-400',
    red: 'bg-rose-500/10 text-rose-400',
    amber: 'bg-amber-500/10 text-amber-400',
    blue: 'bg-sky-500/10 text-sky-400',
    gray: 'bg-white/5 text-gray-400'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'quiet';

const BTN_VARIANTS: Record<BtnVariant, string> = {
  primary: 'text-black bg-gradient-to-br from-primary-light to-primary hover:from-primary hover:to-primary-dark shadow-lg shadow-primary/10',
  ghost: 'text-gray-200 bg-dark-card border border-dark-border hover:border-primary/50 hover:text-white',
  danger: 'text-rose-300 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20',
  quiet: 'text-gray-400 hover:text-white hover:bg-white/5'
};

export function Btn({
  children,
  icon,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: React.ReactNode;
  icon?: IconName;
  variant?: BtnVariant;
  size?: 'sm' | 'md';
}) {
  const sizing = size === 'sm'
    ? 'min-h-[44px] sm:min-h-[36px] px-3 py-2 text-[12px] rounded-lg'
    : 'min-h-[44px] sm:min-h-[42px] px-4 py-2.5 text-[13px] rounded-xl';
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 font-bold transition-colors disabled:opacity-40 disabled:pointer-events-none ${sizing} ${BTN_VARIANTS[variant]} ${className}`}
    >
      {icon && <UiIcon name={icon} className="w-4 h-4" />}
      {children}
    </button>
  );
}

/** Compact segmented control, the same one the dashboard uses for its period switch. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel
}: {
  value: T;
  onChange: (next: T) => void;
  options: { key: T; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex items-center gap-1 bg-dark-card border border-dark-border rounded-xl p-1">
      {options.map(option => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            aria-pressed={active}
            className={`px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors min-h-[44px] sm:min-h-[36px] min-w-[44px] whitespace-nowrap ${
              active ? 'text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
            style={active ? { background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' } : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Select with the chevron drawn in, so every picker in the admin looks the same. */
export function Picker({
  value,
  onChange,
  options,
  ariaLabel,
  className = 'min-w-[160px]'
}: {
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="w-full appearance-none bg-dark-card border border-dark-border rounded-xl pr-4 pl-10 py-2.5 text-[13px] text-white focus:outline-none focus:border-primary/60 transition-colors min-h-[44px] cursor-pointer"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg
        className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className = ''
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <UiIcon name="search" className="w-4 h-4 text-gray-600 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${FIELD} pr-10`}
      />
    </div>
  );
}

export function Field({
  label,
  hint,
  required,
  children
}: {
  label: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={LABEL}>
        {label}
        {required && <span className="text-primary mr-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-gray-600 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

/** Desktop table wrapper: keeps the header legible and the row separators quiet. */
export function TableShell({
  head,
  children,
  minWidth = 'min-w-[640px]'
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto px-5 sm:px-6 pb-5 sm:pb-6">
      <table className={`w-full ${minWidth}`}>
        <thead>
          <tr className="border-b border-dark-border text-right">{head}</tr>
        </thead>
        <tbody className="divide-y divide-dark-border/40">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-right text-xs text-gray-500 font-semibold pb-3 px-3 whitespace-nowrap ${className}`}>{children}</th>;
}

export function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`py-3.5 px-3 text-sm text-gray-300 ${className}`}>{children}</td>;
}

export function Row({
  children,
  onClick,
  className = ''
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const shell = `transition-colors ${onClick ? 'cursor-pointer hover:bg-white/[0.03]' : ''} ${className}`;
  if (onClick) return <tr onClick={onClick} className={shell}>{children}</tr>;
  return <tr className={shell}>{children}</tr>;
}

/** A phone-sized list card: same information as a table row, stacked instead of sideways. */
export function ListCard({
  children,
  onClick,
  className = ''
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const shell = `${CARD} p-4 text-right transition-colors ${onClick ? 'active:bg-white/[0.03] hover:border-primary/40 cursor-pointer' : ''} ${className}`;
  if (onClick) return <button onClick={onClick} className={`${shell} w-full`}>{children}</button>;
  return <div className={shell}>{children}</div>;
}

export function EmptyState({
  icon = 'empty',
  title,
  hint,
  action
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <span className="w-14 h-14 rounded-2xl flex items-center justify-center bg-dark border border-dark-border text-gray-600">
        <UiIcon name={icon} className="w-6 h-6" />
      </span>
      <p className="mt-4 text-sm font-semibold text-gray-300">{title}</p>
      {hint && <p className="mt-1.5 text-[12px] text-gray-600 max-w-[280px] leading-relaxed">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Loading({ label = 'جاري التحميل...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <div className="text-gray-400 text-sm">{label}</div>
    </div>
  );
}

/**
 * Modal shell every form in the admin shares: fixed and centred, the body scrolls
 * inside it, Escape and the backdrop close it, and the first field takes focus.
 */
// Only the newest open modal reacts to Escape, so a payment dialog over a detail
// dialog closes one layer at a time instead of both at once.
const modalStack: symbol[] = [];

export function Modal({
  open,
  title,
  subtitle,
  children,
  footer,
  onClose,
  width = 'max-w-2xl'
}: {
  open: boolean;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const stackIdRef = useRef<symbol | null>(null);
  if (!stackIdRef.current) stackIdRef.current = Symbol('modal');

  useEffect(() => {
    if (!open) return;
    const id = stackIdRef.current!;
    modalStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modalStack[modalStack.length - 1] !== id) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    const first = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type=hidden]), select, textarea, button[type=submit]'
    );
    const focusId = window.setTimeout(() => first?.focus(), 60);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(focusId);
      const index = modalStack.indexOf(id);
      if (index >= 0) modalStack.splice(index, 1);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${CARD} w-full ${width} my-auto shadow-2xl shadow-black/60 overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-3 p-5 sm:p-6 border-b border-dark-border">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-extrabold text-white leading-tight">{title}</h3>
            {subtitle && <p className="mt-1.5 text-[12px] text-gray-500 leading-relaxed">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-11 h-11 sm:w-9 sm:h-9 shrink-0 rounded-xl flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <UiIcon name="close" className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 px-5 sm:px-6 py-4 border-t border-dark-border bg-dark/40">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        {hint && <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="shrink-0 -m-2 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <span
          className={`relative block w-12 h-7 rounded-full transition-colors ${
            checked ? 'bg-primary' : 'bg-dark-border'
          }`}
        >
          <span
            className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
              checked ? 'right-6' : 'right-1'
            }`}
          />
        </span>
      </button>
    </div>
  );
}

/** Every page shows the same offline notice — flat, gold, and honest about the queue. */
export function OfflineBanner({
  hint = 'جميع العمليات تُحفظ محلياً وتُزامَن تلقائياً عند عودة الاتصال'
}: {
  hint?: string;
}) {
  return (
    <div className={`${CARD} p-4 sm:p-5 border-primary/30 bg-primary/[0.06]`}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${GOLD}14`, color: GOLD }}>
          <UiIcon name="wifiOff" className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">غير متصل بالإنترنت</p>
          <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">{hint}</p>
        </div>
      </div>
    </div>
  );
}
