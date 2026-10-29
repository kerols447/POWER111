import { useState, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { whatsappLink } from '../utils/whatsapp';
import { safeWebUrl } from '../utils/links';
import { CountUp, DrawIcon, Reveal, RevealWords, ScrollProgress, useInView } from '../components/Motion';
import { InstallButton } from '../components/InstallPrompt';

interface BranchPlan {
  id: string;
  nameAr: string;
  durationDays: number;
  pricePiasters: number;
  descriptionAr?: string | null;
}

interface PublicBranch {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  locationUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  plans: BranchPlan[];
}

interface PublicOffer {
  id: string;
  branchId: string | null;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  imagePath?: string | null;
  discountPercent?: number | null;
  startDate: string;
  endDate: string;
}

const SUPPORT_PHONE = '01280368119';

const SOCIAL_LINKS = [
  {
    label: 'فيسبوك',
    href: 'https://www.facebook.com/Power111Gym',
    icon: 'M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.25-1.5 1.55-1.5h1.65V4.4c-.3 0-1.3-.1-2.45-.1-2.4 0-4.05 1.45-4.05 4.15V10.5H7.5v3h2.25V21h3.75z'
  },
  {
    label: 'تيك توك',
    href: 'https://www.tiktok.com/@power.11121',
    icon: 'M16.6 5.8a4.8 4.8 0 0 0 3.4 1.4v3a7.7 7.7 0 0 1-3.4-.8v6.1a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6 0 .9.1v3.1a2.9 2.9 0 1 0 2 2.7V5.8h3.5z'
  }
];

/**
 * Fades content in as it scrolls into view.
 */
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/5 ${className}`} aria-hidden="true" />;
}

const card = 'rounded-2xl border border-white/10 bg-[#141414]';
const hoverCard = `${card} transition-all duration-300 motion-reduce:transition-none sm:hover:border-amber-500/30 sm:hover:-translate-y-1`;
const chip = 'inline-block px-3 py-1 rounded-full text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20';
const goldBtn = 'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-black font-bold text-sm transition-all duration-200 active:scale-[0.97] sm:hover:bg-amber-400 sm:hover:-translate-y-0.5';
const ghostBtn = 'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-white/15 text-white font-bold text-sm transition-all duration-200 active:scale-[0.97] sm:hover:bg-white/5 sm:hover:-translate-y-0.5';
const navLink = 'relative py-1 transition-colors duration-200 after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-right after:scale-x-0 after:bg-amber-500 after:transition-transform after:duration-300 hover:text-amber-400 hover:after:scale-x-100';

/** Anchor jumps glide instead of snapping — unless the visitor asked for less motion. */
function jumpToSection(event: MouseEvent<HTMLAnchorElement>, href: string, after?: () => void) {
  const target = document.querySelector(href);
  if (!target) return;
  event.preventDefault();
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  after?.();
}

function formatEGP(piasters: number) {
  return `${(piasters / 100).toLocaleString('en-US')} ج.م`;
}

const DURATIONS: Record<number, string> = {
  30: 'شهر',
  60: 'شهرين',
  90: '3 شهور',
  180: '6 شهور',
  270: '9 شهور',
  365: 'سنة'
};

function durationLabel(days: number) {
  return DURATIONS[days] || `${days} يوم`;
}

function daysLeft(endDate: string) {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
}

function shortBranchName(name: string) {
  return name.replace(/^POWER\s*111\s*[—–-]\s*/i, '');
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);

  return (
    <div ref={ref} className="text-center">
      <span
        className={chip}
        style={{
          opacity: inView ? 1 : 0,
          transform: inView ? 'scale(1)' : 'scale(0.9)',
          transition: 'opacity 400ms ease-out, transform 400ms cubic-bezier(.16,.84,.44,1)'
        }}
      >
        {eyebrow}
      </span>
      <h2 className="mt-4 text-2xl sm:text-4xl font-black text-white leading-tight">
        <RevealWords text={title} delay={80} step={110} />
      </h2>
      {subtitle && (
        <Reveal delay={260} y={14}>
          <p className="mt-3 text-sm sm:text-base text-gray-400 max-w-xl mx-auto">{subtitle}</p>
        </Reveal>
      )}
    </div>
  );
}

/**
 * The club clip plays inside the page — the file is served from our own
 * server, so nothing here can hand the visitor over to another site.
 */
function ClubClip({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  if (unavailable) return null;

  const start = () => {
    setPlaying(true);
    videoRef.current?.play().catch(() => setUnavailable(true));
  };

  return (
    <div className="mx-auto w-full max-w-[280px] sm:max-w-[330px]">
      <div className={`${card} overflow-hidden`}>
        <div className="relative bg-black">
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            className="w-full aspect-[9/16] object-cover"
            playsInline
            preload="metadata"
            controls={playing}
            controlsList="nodownload"
            onError={() => setUnavailable(true)}
            onEnded={() => setPlaying(false)}
          />
          {!playing && (
            <button
              type="button"
              onClick={start}
              aria-label="تشغيل فيديو النادى"
              className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/50 via-transparent to-black/20"
            >
              <span className="w-16 h-16 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg transition-transform duration-200 active:scale-90">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 ms-1" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-gray-500">من جوه POWER 111</p>
    </div>
  );
}

export default function LandingPage() {
  const [branches, setBranches] = useState<PublicBranch[]>([]);
  const [offers, setOffers] = useState<PublicOffer[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    fetch('/api/public/landing')
      .then(res => res.json())
      .then(res => {
        if (!res.success) return;
        const list: PublicBranch[] = res.data.branches || [];
        setBranches(list);
        setOffers(res.data.offers || []);
        const withPlans = list.find(b => b.plans.length > 0);
        setSelectedBranchId((withPlans || list[0])?.id || '');
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const selectedBranch = branches.find(b => b.id === selectedBranchId);
  const totalPlans = branches.reduce((sum, b) => sum + b.plans.length, 0);
  const hasPlans = totalPlans > 0;
  const maxDiscount = offers.reduce((max, o) => Math.max(max, o.discountPercent || 0), 0);
  const supportWa = whatsappLink(SUPPORT_PHONE, 'أريد الاستفسار عن الاشتراكات في POWER 111') || `tel:${SUPPORT_PHONE}`;

  const plansLabel = hasPlans ? 'الخطط والأسعار' : 'الاشتراكات';

  const navLinks = [
    { href: '#services', label: 'خدماتنا' },
    { href: '#branches', label: 'الفروع' },
    { href: '#plans', label: plansLabel },
    ...(offers.length > 0 ? [{ href: '#offers', label: 'العروض' }] : []),
    { href: '#contact', label: 'تواصل معنا' }
  ];

  const services = [
    {
      title: 'جيم وكمال أجسام',
      desc: 'أحدث الأجهزة وأفضل المدربين لبناء عضلاتك وتحقيق لياقة أحلامك',
      icon: 'M6.5 6.5v11M3.5 8.5v7M17.5 6.5v11M20.5 8.5v7M6.5 12h11'
    },
    {
      title: 'صحة وعلاج طبيعي',
      desc: 'برامج استشفاء وتأهيل بإشراف مختصين للعناية بصحتك وحركتك',
      icon: 'M12 21c-5.5-3.5-9-7-9-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 4-3.5 7.5-9 11z'
    },
    {
      title: 'تغذية صحية',
      desc: 'خطط غذائية مخصصة تناسب هدفك — خسارة وزن، ضخامة، أو صحة عامة',
      icon: 'M5 19c0-8 4-14 14-14 0 10-5 14-11 14M5 19c2-5 5-8 10-10'
    }
  ];

  const features = [
    { title: 'أجهزة عالمية', desc: 'أحدث أجهزة اللياقة من أفضل الماركات' },
    { title: 'مدربين محترفين', desc: 'فريق معتمد يساعدك تصل لهدفك' },
    { title: 'مواعيد مرنة', desc: 'مفتوح من الصبح لبالليل كل أيام الأسبوع' },
    { title: 'تطبيق ذكي', desc: 'سجل حضورك وتابع اشتراكك من موبايلك' },
    { title: 'تكييف مركزي', desc: 'أجواء مريحة ومكيفة في كل الفروع' },
    { title: 'مواقف مجانية', desc: 'مواقف واسعة أمام كل فرع' }
  ];

  // A "0 plans / 0 offers" counter advertises the gap, so only real numbers are shown.
  const allStats: { value: number | null; label: string; suffix?: string }[] = [
    { value: loaded ? branches.length : null, label: 'فروع' },
    ...(hasPlans ? [{ value: totalPlans, label: 'خطط وأسعار' }] : []),
    ...(offers.length > 0 ? [{ value: offers.length, label: 'عروض حالية' }] : []),
    ...(maxDiscount > 0 ? [{ value: maxDiscount, label: 'أقصى خصم', suffix: '%' }] : []),
    ...(hasPlans || offers.length > 0 ? [] : [{ value: services.length, label: 'خدمات' }])
  ];
  const stats = allStats.slice(0, 3);
  const statLayout: Record<number, string> = {
    1: 'grid-cols-1 max-w-xs',
    2: 'grid-cols-2 max-w-md',
    3: 'grid-cols-2 sm:grid-cols-3 max-w-2xl'
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* ===== Nav ===== */}
      <nav className={`sticky top-0 z-50 backdrop-blur transition-all duration-300 motion-reduce:transition-none ${
        scrolled ? 'bg-black/95 border-b border-white/10 shadow-lg shadow-black/50' : 'bg-black/80 border-b border-transparent'
      }`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2.5 min-h-10 transition-transform duration-200 active:scale-95 sm:hover:scale-[1.03]">
            <img src="/power-logo.jpg" alt="POWER 111" className="w-9 h-9 rounded-lg ring-1 ring-amber-500/30" />
            <span className="text-lg font-black tracking-tight">POWER 111</span>
          </a>

          <div className="hidden md:flex items-center gap-7 text-sm text-gray-300">
            {navLinks.map(link => (
              <a key={link.href} href={link.href} onClick={e => jumpToSection(e, link.href)} className={navLink}>{link.label}</a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <InstallButton className="hidden sm:inline-flex px-4 py-2 rounded-lg border border-white/15 text-white text-sm font-bold transition-all duration-200 active:scale-95 sm:hover:bg-white/5" />
            <Link to="/portal" className="hidden sm:inline-flex px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition-colors">
              بوابة الأعضاء
            </Link>
            <button onClick={() => setMenuOpen(!menuOpen)} aria-label="القائمة" aria-expanded={menuOpen} className="md:hidden p-2.5 text-gray-300 transition-all duration-200 active:scale-90 sm:hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        <div
          aria-hidden={!menuOpen}
          className={`md:hidden overflow-hidden bg-black/95 transition-all duration-300 motion-reduce:transition-none ${
            menuOpen ? 'max-h-[26rem] opacity-100 border-t border-white/10' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="px-4 py-3">
            {navLinks.map(link => (
              <a
                key={link.href}
                href={link.href}
                onClick={e => jumpToSection(e, link.href, () => setMenuOpen(false))}
                tabIndex={menuOpen ? undefined : -1}
                className={`block py-2.5 text-sm text-gray-300 transition-colors duration-200 active:text-amber-400 sm:hover:text-amber-400 ${menuOpen ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0'}`}
              >
                {link.label}
              </a>
            ))}
            <Link to="/portal" onClick={() => setMenuOpen(false)} tabIndex={menuOpen ? undefined : -1} className="block py-2.5 text-sm font-bold text-amber-400">
              بوابة الأعضاء
            </Link>
          </div>
        </div>
        <ScrollProgress />
      </nav>

      {/* ===== Hero ===== */}
      <header id="top" className="px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24 text-center">
        <Reveal y={0} scale={0.88} duration={760}>
          <img src="/power-logo.jpg" alt="POWER 111" className="mx-auto w-28 h-28 sm:w-36 sm:h-36 rounded-2xl border border-amber-500/25" />
        </Reveal>

        <h1 className="mt-8 text-3xl sm:text-5xl font-black leading-tight">
          <RevealWords text="لياقتك تبدأ" delay={180} step={120} />{' '}
          <span className="text-amber-400"><RevealWords text="من هنا" delay={420} step={120} /></span>
        </h1>

        <Reveal delay={620} y={14}>
          <p className="mt-4 text-base sm:text-lg text-gray-400 max-w-xl mx-auto leading-relaxed">
            جيم، صحة، وتغذية — منظومة متكاملة لرعاية جسمك في مكان واحد.
          </p>
        </Reveal>

        <Reveal delay={700}>
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-md mx-auto sm:max-w-none">
            <a href="#plans" onClick={e => jumpToSection(e, '#plans')} className={goldBtn}>{hasPlans ? 'شوف الأسعار' : 'اسأل عن الأسعار'}</a>
            <a href={supportWa} target="_blank" rel="noreferrer" className={ghostBtn}>كلمنا واتساب</a>
          </div>
        </Reveal>

        <div className={`mt-12 sm:mt-16 grid gap-3 sm:gap-4 mx-auto ${statLayout[stats.length] || 'grid-cols-1 max-w-xs'}`}>
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={880 + i * 120} y={18}>
              <div className={`${card} px-2 py-5 transition-colors duration-300 sm:hover:border-amber-500/25`}>
                <div className="text-2xl sm:text-3xl font-black text-amber-400">
                  {stat.value === null ? '—' : <CountUp value={stat.value} suffix={stat.suffix} />}
                </div>
                <div className="mt-1 text-xs sm:text-sm text-gray-400">{stat.label}</div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={1200} y={10}>
          <a href="#services" onClick={e => jumpToSection(e, '#services')} className="mt-12 inline-flex flex-col items-center gap-1 text-gray-500 transition-colors duration-200 sm:hover:text-amber-400">
            <span className="text-[11px] tracking-[0.2em]">اكتشف</span>
            <svg className="w-5 h-5 animate-bounce motion-reduce:animate-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </a>
        </Reveal>
      </header>

      {/* ===== Services ===== */}
      <section id="services" className="px-4 sm:px-6 py-14 sm:py-20 border-t border-white/5 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <SectionHeading eyebrow="خدماتنا" title="ثلاث ركائز… هدف واحد" subtitle="تجربة متكاملة تجمع بين القوة والصحة والتغذية" />
          </Reveal>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {services.map((service, i) => (
              <Reveal key={service.title} delay={i * 120} className="h-full">
                <div className={`${hoverCard} p-6 h-full`}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-amber-400 bg-amber-500/10 border border-amber-500/20">
                    <DrawIcon d={service.icon} className="w-6 h-6" delay={150 + i * 120} />
                  </div>
                  <h3 className="mt-5 text-lg font-bold">{service.title}</h3>
                  <p className="mt-2 text-sm text-gray-400 leading-relaxed">{service.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Offers ===== */}
      {offers.length > 0 && (
        <section id="offers" className="px-4 sm:px-6 py-14 sm:py-20 border-t border-white/5 bg-[#0E0E0E] scroll-mt-16">
          <div className="max-w-6xl mx-auto">
            <Reveal><SectionHeading eyebrow="عروض حالية" title="عروض لا تفوت" /></Reveal>
            <div className={`mt-10 grid grid-cols-1 gap-4 ${offers.length === 1 ? 'sm:mx-auto sm:max-w-md' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {offers.map((offer, i) => {
                const remaining = daysLeft(offer.endDate);
                const urgent = remaining > 0 && remaining <= 3;
                return (
                  <Reveal key={offer.id} delay={i * 100} className="h-full">
                  <div className={`${hoverCard} overflow-hidden flex flex-col h-full`}>
                    <div className="relative h-40 flex items-center justify-center bg-gradient-to-br from-amber-500/15 to-transparent">
                      {offer.imagePath ? (
                        <img src={offer.imagePath} alt={offer.titleAr || offer.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-5xl font-black text-amber-500/25">
                          {offer.discountPercent ? `${offer.discountPercent}%` : 'POWER 111'}
                        </span>
                      )}
                      {offer.discountPercent ? (
                        <span className={`absolute top-3 right-3 px-3 py-1 rounded-full bg-red-500 text-white text-xs font-black ${urgent ? 'animate-pulse motion-reduce:animate-none' : ''}`}>
                          خصم {offer.discountPercent}%
                        </span>
                      ) : null}
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <h3 className="text-base font-bold">{offer.titleAr || offer.title}</h3>
                      {(offer.descriptionAr || offer.description) && (
                        <p className="mt-2 text-sm text-gray-400 leading-relaxed flex-1">
                          {offer.descriptionAr || offer.description}
                        </p>
                      )}
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span dir="rtl" className={`text-xs font-medium ${remaining <= 0 ? 'text-red-400' : urgent ? 'text-red-400' : 'text-gray-400'}`}>
                          {remaining <= 0 ? 'انتهى العرض' : remaining === 1 ? 'يتبقي يوم واحد' : `متبقي ${remaining} يوم`}
                        </span>
                        <a
                          href={whatsappLink(SUPPORT_PHONE, `أريد الاستفسار عن عرض: ${offer.titleAr || offer.title}`) || supportWa}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 rounded-lg text-xs font-bold text-amber-400 border border-amber-500/25 transition-all duration-200 active:scale-95 sm:hover:bg-amber-500 sm:hover:text-black"
                        >
                          استفد الآن
                        </a>
                      </div>
                    </div>
                  </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ===== Branches ===== */}
      <section id="branches" className="px-4 sm:px-6 py-14 sm:py-20 border-t border-white/5 scroll-mt-16">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <SectionHeading eyebrow="فروعنا" title="على بعد خطوات منك" subtitle="فروع مجهزة بأحدث الأجهزة لتصلك في أي مكان" />
          </Reveal>

          {!loaded && (
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[0, 1].map(i => (
                <div key={i} className={`${card} p-5 sm:p-6`}>
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-11 h-11 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="mt-5 h-9 w-full" />
                </div>
              ))}
            </div>
          )}
          {loaded && branches.length === 0 && (
            <p className="mt-10 text-center text-sm text-gray-500">لا توجد فروع مضافة حالياً</p>
          )}

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {branches.map((branch, i) => {
              const wa = whatsappLink(branch.whatsapp || branch.phone || '');
              const mapUrl = safeWebUrl(branch.locationUrl);
              return (
                <Reveal key={branch.id} delay={i * 120} className="h-full">
                <div className={`${hoverCard} p-5 sm:p-6 h-full`}>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-amber-400 font-bold text-xs bg-amber-500/10 border border-amber-500/20 shrink-0">
                      {branch.code}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold truncate">{branch.name}</h3>
                      {branch.address && <p className="text-sm text-gray-400 mt-0.5">{branch.address}</p>}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {branch.phone && (
                      <a
                        href={`tel:${branch.phone}`}
                        dir="ltr"
                        className="inline-flex items-center gap-2 min-h-10 px-3 py-2 rounded-lg text-sm text-gray-300 border border-white/10 transition-all duration-200 active:scale-95 sm:hover:text-amber-400 sm:hover:border-amber-500/25"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span>{branch.phone}</span>
                      </a>
                    )}
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 min-h-10 px-3 py-2 rounded-lg text-sm text-emerald-400 border border-emerald-500/20 transition-all duration-200 active:scale-95 sm:hover:bg-emerald-500/10"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12.04 2a9.9 9.9 0 0 0-8.51 14.94L2 22l5.2-1.49A9.9 9.9 0 1 0 12.04 2z" />
                        </svg>
                        <span>واتساب</span>
                      </a>
                    )}
                    {mapUrl && (
                      <a
                        href={mapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 min-h-10 px-3 py-2 rounded-lg text-sm text-amber-400 border border-amber-500/20 transition-all duration-200 active:scale-95 sm:hover:bg-amber-500/10"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>الموقع على الخريطة</span>
                      </a>
                    )}
                  </div>

                  <a
                    href="#plans"
                    onClick={e => jumpToSection(e, '#plans', () => setSelectedBranchId(branch.id))}
                    className="mt-2 inline-flex items-center gap-1.5 min-h-10 px-1 py-2 text-sm font-bold text-amber-400 transition-all duration-200 active:scale-95"
                  >
                    {branch.plans.length > 0 ? 'شوف خطط الفرع' : 'اسأل عن أسعار الفرع'}
                    <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Plans ===== */}
      <section id="plans" className="px-4 sm:px-6 py-14 sm:py-20 border-t border-white/5 bg-[#0E0E0E] scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <SectionHeading
              eyebrow={plansLabel}
              title={hasPlans ? 'اختر خطتك المناسبة' : 'اشتراكات POWER 111'}
            />
          </Reveal>

          {branches.length > 1 && (
            <div className="mt-8 flex gap-2 overflow-x-auto pb-1 sm:justify-center">
              {branches.map(branch => (
                <button
                  key={branch.id}
                  onClick={() => setSelectedBranchId(branch.id)}
                  aria-pressed={selectedBranchId === branch.id}
                  className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold border transition-all duration-200 active:scale-95 motion-reduce:transition-none ${
                    selectedBranchId === branch.id
                      ? 'bg-amber-500 text-black border-amber-500'
                      : 'text-gray-300 bg-[#141414] border-white/10 sm:hover:border-amber-500/30'
                  }`}
                >
                  {shortBranchName(branch.name)}
                </button>
              ))}
            </div>
          )}

          {!loaded && (
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2].map(i => (
                <div key={i} className={`${card} p-6`}>
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="mt-4 h-3 w-full" />
                  <Skeleton className="mt-2 h-3 w-3/4" />
                  <Skeleton className="mt-6 h-8 w-2/5" />
                  <Skeleton className="mt-5 h-11 w-full" />
                </div>
              ))}
            </div>
          )}

          {loaded && selectedBranch && selectedBranch.plans.length === 0 && (
            <div className={`mt-10 ${card} p-8 sm:p-10 text-center max-w-xl mx-auto`}>
              <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-amber-400 bg-amber-500/10 border border-amber-500/20">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20l1.1-4.4A8.4 8.4 0 0 1 3 11.5a9 9 0 1 1 18 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
                </svg>
              </div>
              <h3 className="mt-5 text-lg font-bold">أسعار {shortBranchName(selectedBranch.name)}</h3>
              <p className="mt-2 text-sm text-gray-400 leading-relaxed">
                لم ننشر أسعار الاشتراكات لهذا الفرع على الموقع بعد.
                راسلنا على واتساب ونوضح لك الأسعار المتاحة حاليًا ومميزات كل خطة.
              </p>
              <a
                href={
                  whatsappLink(
                    selectedBranch.whatsapp || selectedBranch.phone || SUPPORT_PHONE,
                    `أريد الاستفسار عن أسعار اشتراكات ${selectedBranch.name}`
                  ) || supportWa
                }
                target="_blank"
                rel="noreferrer"
                className={`mt-6 ${goldBtn}`}
              >
                اسأل عن الأسعار
              </a>
            </div>
          )}

          {selectedBranch && selectedBranch.plans.length > 0 && (
            <div key={selectedBranch.id} className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedBranch.plans.map((plan, i) => {
                const wa = whatsappLink(
                  selectedBranch.whatsapp || selectedBranch.phone || SUPPORT_PHONE,
                  `أريد الاشتراك في خطة ${plan.nameAr} — ${selectedBranch.name}`
                );
                const duration = durationLabel(plan.durationDays);
                const monthly = Math.round(plan.pricePiasters / (plan.durationDays / 30) / 100) * 100;
                return (
                  <Reveal key={plan.id} delay={i * 100} className="h-full">
                  <div className={`${hoverCard} p-6 flex flex-col h-full`}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-bold">{plan.nameAr}</h3>
                      {!plan.nameAr.includes(duration) && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 shrink-0">
                          {duration}
                        </span>
                      )}
                    </div>
                    {plan.descriptionAr && (
                      <p className="mt-3 text-sm text-gray-400 leading-relaxed flex-1">{plan.descriptionAr}</p>
                    )}
                    <div className="mt-5">
                      <div className="text-2xl font-black text-amber-400">{formatEGP(plan.pricePiasters)}</div>
                      {plan.durationDays > 30 && (
                        <div className="mt-1 text-xs text-gray-500">≈ {formatEGP(monthly)} شهرياً</div>
                      )}
                    </div>
                    <a href={wa || supportWa} target="_blank" rel="noreferrer" className={`mt-5 w-full ${goldBtn}`}>
                      اشترك الآن
                    </a>
                  </div>
                  </Reveal>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ===== Why us ===== */}
      <section className="px-4 sm:px-6 py-14 sm:py-20 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <Reveal><SectionHeading eyebrow="ليه POWER 111؟" title="مش مجرد جيم" /></Reveal>
          <Reveal delay={180} className="mt-8">
            <ClubClip src="/videos/power111-reel.mp4" poster="/videos/power111-reel-poster.jpg" />
          </Reveal>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, i) => (
              <Reveal key={feature.title} delay={i * 80} className="h-full">
              <div className={`${hoverCard} p-5 flex items-start gap-3 h-full`}>
                <DrawIcon d="M5 13l4 4L19 7" strokeWidth={2} className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" delay={i * 90 + 120} />
                <div>
                  <h3 className="text-sm font-bold">{feature.title}</h3>
                  <p className="mt-1 text-sm text-gray-400">{feature.desc}</p>
                </div>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Contact CTA ===== */}
      <section id="contact" className="px-4 sm:px-6 py-14 sm:py-20 border-t border-white/5 bg-[#0E0E0E] scroll-mt-16">
        <Reveal className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-4xl font-black">جاهز تبدأ رحلتك؟</h2>
          <p className="mt-4 text-sm sm:text-base text-gray-400">
            كلمنا على واتساب وفريقنا هيساعدك تختار الخطة المناسبة ليك وتبدأ النهاردة.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-md mx-auto sm:max-w-none">
            <a href={supportWa} target="_blank" rel="noreferrer" className={goldBtn}>تواصل واتساب</a>
            <a href={`tel:${SUPPORT_PHONE}`} dir="ltr" className={ghostBtn}>{SUPPORT_PHONE}</a>
          </div>
          <div className="mt-8 flex items-center justify-center gap-3">
            {SOCIAL_LINKS.map(social => (
              <a
                key={social.href}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={social.label}
                className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-300 border border-white/10 transition-all duration-200 active:scale-95 sm:hover:text-amber-400 sm:hover:border-amber-500/30"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d={social.icon} />
                </svg>
              </a>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ===== Footer ===== */}
      <footer className="px-4 sm:px-6 pt-10 pb-24 sm:pb-10 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-right">
            <div className="flex items-center justify-center sm:justify-start gap-2.5">
              <img src="/power-logo.jpg" alt="POWER 111" className="w-8 h-8 rounded-lg" />
              <span className="font-black">POWER 111</span>
            </div>
            <p className="mt-2 text-xs text-gray-500">لياقة • صحة • تغذية</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 text-sm text-gray-400">
            <a href="#branches" onClick={e => jumpToSection(e, '#branches')} className="py-2.5 transition-colors sm:hover:text-amber-400">الفروع</a>
            <a href="#plans" onClick={e => jumpToSection(e, '#plans')} className="py-2.5 transition-colors sm:hover:text-amber-400">{plansLabel}</a>
            <Link to="/portal" className="py-2.5 transition-colors sm:hover:text-amber-400">بوابة الأعضاء</Link>
            <Link to="/login" className="py-2.5 transition-colors sm:hover:text-amber-400">دخول الموظفين</Link>
          </div>

          <div className="flex items-center justify-center gap-x-5 flex-wrap text-sm text-gray-400">
            {SOCIAL_LINKS.map(social => (
              <a
                key={social.href}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 py-2.5 transition-all duration-200 active:scale-95 sm:hover:text-amber-400"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d={social.icon} />
                </svg>
                <span>{social.label}</span>
              </a>
            ))}
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-gray-600">© {new Date().getFullYear()} POWER 111 — جميع الحقوق محفوظة</p>
      </footer>

      {/* ===== Floating WhatsApp (phones only) ===== */}
      <a
        href={supportWa}
        target="_blank"
        rel="noreferrer"
        aria-label="واتساب"
        className={`sm:hidden fixed bottom-5 left-5 z-40 w-14 h-14 rounded-full flex items-center justify-center bg-emerald-500 text-white shadow-lg transition-all duration-300 motion-reduce:transition-none active:scale-90 ${
          scrolled ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'
        }`}
      >
        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12.04 2a9.9 9.9 0 0 0-8.51 14.94L2 22l5.2-1.49A9.9 9.9 0 1 0 12.04 2zm5.77 14.06c-.24.68-1.4 1.3-1.93 1.35-.52.05-1.01.24-3.4-.71-2.87-1.13-4.68-4.06-4.82-4.25-.14-.19-1.15-1.53-1.15-2.92 0-1.39.73-2.07.99-2.35.26-.28.57-.35.76-.35h.55c.18 0 .41-.07.64.49.24.57.81 1.97.88 2.11.07.14.12.31.02.5-.1.19-.14.3-.29.47-.14.16-.3.36-.43.49-.14.14-.29.3-.12.58.16.28.73 1.2 1.57 1.95 1.08.96 1.99 1.26 2.27 1.4.28.14.45.12.61-.07.17-.19.7-.81.89-1.09.19-.28.38-.23.63-.14.26.09 1.63.77 1.91.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z" />
        </svg>
      </a>
    </div>
  );
}
