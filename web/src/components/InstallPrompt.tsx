import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Every install button does something the moment it is tapped: browsers that allow a
 * scripted install get the system prompt straight away, and the ones that forbid it
 * (iOS Safari, the in-app browsers of Facebook and WhatsApp) get their own exact route
 * in a dialog instead of a caption to read.
 */

const DISMISS_KEY = 'power111InstallDismissed';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type BrowserKind = 'ios' | 'inApp' | 'other';

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
let bound = false;
let guideOpen = false;
const listeners = new Set<() => void>();

function runningStandalone() {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.matchMedia?.('(display-mode: window-controls-overlay)').matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function browserKind(): BrowserKind {
  const ua = navigator.userAgent;
  if (/instagram|fbav|fb_iab|fb4a|fblite|messenger|whatsapp|snapchat|musical_ly|tiktok/i.test(ua)) return 'inApp';
  const iOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return iOS && !/crios|fxios|edgios|optouch|firefox/i.test(ua) ? 'ios' : 'other';
}

function snapshot() {
  return {
    installed,
    canInstall: !!deferredPrompt && !installed,
    dismissed: localStorage.getItem(DISMISS_KEY) === '1',
    kind: browserKind(),
    guideOpen
  };
}

function emit() {
  listeners.forEach(listener => listener());
}

function bindEvents() {
  if (bound) return;
  bound = true;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    guideOpen = false;
    localStorage.removeItem(DISMISS_KEY);
    emit();
  });

  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => {
    installed = runningStandalone();
    emit();
  });

  installed = runningStandalone();
}

function setGuideOpen(open: boolean) {
  guideOpen = open;
  emit();
}

async function install() {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  if (outcome === 'dismissed') localStorage.setItem(DISMISS_KEY, '1');
  emit();
  return outcome === 'accepted';
}

/** The one action behind every install button. */
function requestInstall() {
  if (deferredPrompt) {
    install();
    return;
  }
  setGuideOpen(true);
}

function dismiss() {
  localStorage.setItem(DISMISS_KEY, '1');
  emit();
}

export function useInstallPrompt() {
  const [state, setState] = useState(snapshot);

  useEffect(() => {
    bindEvents();
    const onChange = () => setState(snapshot());
    listeners.add(onChange);
    onChange();
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return { ...state, requestInstall, dismiss, closeGuide: () => setGuideOpen(false) };
}

/** Header action. */
export function InstallButton({ className }: { className?: string }) {
  const { installed: onDevice, requestInstall: run } = useInstallPrompt();
  if (onDevice) return null;

  return (
    <button type="button" onClick={() => run()} className={className}>
      ثبّت التطبيق
    </button>
  );
}

/** Bottom card that appears as soon as the page opens, on the public site and the portal. */
export function InstallBanner() {
  const { canInstall, installed: onDevice, dismissed, requestInstall: run, dismiss: hide } = useInstallPrompt();
  const { pathname } = useLocation();
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setOpened(true), 800);
    return () => clearTimeout(timer);
  }, []);

  if (!opened || onDevice || dismissed) return null;
  if (pathname !== '/' && pathname !== '/portal') return null;

  // The portal carries a bottom tab bar; the banner has to sit on top of it, never over it.
  const onPortal = pathname === '/portal';

  return (
    <div
      className={`fixed right-3 left-[5.5rem] sm:left-auto sm:w-[380px] sm:right-5 z-40 rounded-2xl border border-white/10 bg-[#141414] p-3 shadow-2xl ${onPortal ? '' : 'bottom-3 sm:bottom-5'}`}
      style={onPortal ? { bottom: 'calc(70px + env(safe-area-inset-bottom))' } : undefined}
    >
      <div className="flex items-center gap-3">
        <img src="/power-logo.jpg" alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">
            <span className="sm:hidden">ثبّت التطبيق</span>
            <span className="hidden sm:inline">ثبّت تطبيق POWER 111</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-400">افتح الجيم من غير متصفح</p>
        </div>

        <button
          type="button"
          onClick={() => run()}
          className="hidden sm:inline-flex shrink-0 px-4 py-2 rounded-xl bg-amber-500 text-black text-sm font-bold transition-colors duration-200 sm:hover:bg-amber-400"
        >
          {canInstall ? 'تثبيت' : 'ثبّته الآن'}
        </button>

        <button
          type="button"
          onClick={hide}
          aria-label="إخفاء"
          className="shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-gray-500 transition-colors duration-200 active:scale-90 sm:hover:text-white"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        onClick={() => run()}
        className="mt-2.5 w-full sm:hidden min-h-11 px-4 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-bold transition-transform duration-200 active:scale-95"
      >
        {canInstall ? 'تثبيت التطبيق' : 'ثبّت التطبيق الآن'}
      </button>
    </div>
  );
}

const GUIDES: Record<BrowserKind, { title: string; steps: string[] }> = {
  ios: {
    title: 'التثبيت من سفاري',
    steps: [
      'دوس زر المشاركة اللي فوق',
      'نزّل لآخر القائمة ودوس «إضافة إلى الشاشة الرئيسية»',
      'دوس «إضافة» — التطبيق هيظهر على شاشتك'
    ]
  },
  inApp: {
    title: 'الموقع مفتوح جوه تطبيق',
    steps: [
      'فيسبوك وإنستجرام وواتساب بيمنعوا تثبيت التطبيقات',
      'انسخ الرابط وافتحه في متصفح كروم',
      'من قائمة كروم ⋮ دوس «تثبيت التطبيق»'
    ]
  },
  other: {
    title: 'التثبيت من المتصفح ده',
    steps: [
      'دوس قائمة المتصفح ⋮ اللي فوق',
      'اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»',
      'دوس موافق — هيظهر مع برامجك'
    ]
  }
};

export function InstallGuide() {
  const { kind, guideOpen, closeGuide } = useInstallPrompt();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!guideOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeGuide();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [guideOpen, closeGuide]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!guideOpen) return null;

  const link = `${window.location.origin}/`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const field = document.createElement('textarea');
      field.value = link;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.top = '-1000px';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopied(true);
  };

  const guide = GUIDES[kind];

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={closeGuide}
      role="dialog"
      aria-modal="true"
      aria-label={guide.title}
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#141414] w-full max-w-sm shadow-2xl shadow-black/50"
        onClick={event => event.stopPropagation()}
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <img src="/power-logo.jpg" alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white leading-snug">{guide.title}</h2>
              <p className="mt-0.5 text-xs text-gray-400">ثلاث خطوات وخلاص</p>
            </div>
          </div>

          <ol className="mt-5 space-y-3">
            {guide.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span className="w-7 h-7 shrink-0 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-sm font-bold flex items-center justify-center">
                  {index + 1}
                </span>
                <span className="pt-1 text-sm text-gray-300 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-5 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-center text-xs text-gray-400">
            {link.replace(/^https?:\/\//, '')}
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              type="button"
              onClick={copyLink}
              className="px-4 py-3 rounded-xl border border-white/15 text-gray-200 text-sm font-semibold transition-colors duration-200 sm:hover:border-white/40"
            >
              {copied ? 'اتنسخ ✓' : 'نسخ الرابط'}
            </button>
            <button
              type="button"
              onClick={closeGuide}
              className="px-4 py-3 rounded-xl bg-amber-500 text-black text-sm font-bold transition-colors duration-200 sm:hover:bg-amber-400"
            >
              تمام
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
