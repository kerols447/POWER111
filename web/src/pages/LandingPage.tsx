import { useState, useEffect, useRef, type RefObject } from 'react';
import { Link } from 'react-router-dom';

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

const SUPPORT_WHATSAPP = '201055002069';

const goldGradient: React.CSSProperties = {
  background: 'linear-gradient(135deg, #FCD34D, #F59E0B, #D97706)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

function formatEGP(piasters: number) {
  return `${(piasters / 100).toLocaleString('ar-EG')} ج.م`;
}

function DaysLeft({ endDate }: { endDate: string }) {
  const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return null;
  return <span className="text-xs text-gray-400">{days} يوم متبقي</span>;
}

function useScrollReveal(): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible');
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function CountUp({ end, suffix }: { end: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const duration = 1600;
          const start = performance.now();
          const tick = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(end * eased));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          observer.unobserve(el);
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end]);

  return (
    <span ref={ref} dir="ltr">
      {value.toLocaleString('ar-EG')}
      {suffix}
    </span>
  );
}

export default function LandingPage() {
  const [data, setData] = useState<PublicBranch[]>([]);
  const [offers, setOffers] = useState<PublicOffer[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const statsRef = useScrollReveal();
  const servicesRef = useScrollReveal();
  const servicesGridRef = useScrollReveal();
  const offersRef = useScrollReveal();
  const offersGridRef = useScrollReveal();
  const branchesRef = useScrollReveal();
  const branchesGridRef = useScrollReveal();
  const plansRef = useScrollReveal();
  const plansGridRef = useScrollReveal();
  const whyRef = useScrollReveal();
  const whyGridRef = useScrollReveal();
  const contactRef = useScrollReveal();

  useEffect(() => {
    fetch('/api/public/landing')
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setData(res.data.branches);
          setOffers(res.data.offers || []);
          const withPlans = res.data.branches.find((b: PublicBranch) => b.plans.length > 0);
          if (withPlans) setSelectedBranch(withPlans.id);
          else if (res.data.branches.length > 0) setSelectedBranch(res.data.branches[0].id);
        }
      })
      .catch(err => console.error('Error fetching landing data:', err));
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const branch = data.find(b => b.id === selectedBranch);

  return (
    <div className="min-h-screen text-white overflow-x-hidden" style={{ backgroundColor: '#0A0A0A' }}>
      {/* ===== Nav ===== */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled ? 'border-b border-white/10' : ''
        }`}
        style={{
          backgroundColor: scrolled ? 'rgba(10,10,10,0.95)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between py-4">
          {/* Logo - right side (RTL) */}
          <a href="#top" className="flex items-center gap-3">
            <img src="/power-logo.jpg" alt="POWER 111" className="w-10 h-10 rounded-lg" />
            <span className="font-extrabold text-xl">
              POWER <span style={goldGradient}>111</span>
            </span>
          </a>

          {/* Nav links - center */}
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-300">
            <a href="#services" className="hover:text-yellow-500 transition-colors">خدماتنا</a>
            <a href="#branches" className="hover:text-yellow-500 transition-colors">الفروع</a>
            <a href="#plans" className="hover:text-yellow-500 transition-colors">الخطط</a>
            <a href="#contact" className="hover:text-yellow-500 transition-colors">تواصل معنا</a>
          </div>

          {/* CTA button - left side */}
          <Link
            to="/portal"
            className="hidden sm:inline-flex px-6 py-2.5 rounded-full text-sm font-bold text-black transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' }}
          >
            بوابة الأعضاء
          </Link>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 px-4 py-4 space-y-3" style={{ backgroundColor: 'rgba(10,10,10,0.98)' }}>
            <a href="#services" onClick={() => setMobileMenuOpen(false)} className="block text-gray-300 hover:text-yellow-500 py-2">خدماتنا</a>
            {offers.length > 0 && <a href="#offers" onClick={() => setMobileMenuOpen(false)} className="block text-gray-300 hover:text-yellow-500 py-2">العروض</a>}
            <a href="#branches" onClick={() => setMobileMenuOpen(false)} className="block text-gray-300 hover:text-yellow-500 py-2">الفروع</a>
            <a href="#plans" onClick={() => setMobileMenuOpen(false)} className="block text-gray-300 hover:text-yellow-500 py-2">الخطط</a>
            <a href="#contact" onClick={() => setMobileMenuOpen(false)} className="block text-gray-300 hover:text-yellow-500 py-2">تواصل معنا</a>
            <Link to="/portal" onClick={() => setMobileMenuOpen(false)} className="block text-yellow-500 font-bold py-2">بوابة الأعضاء</Link>
          </div>
        )}
      </nav>

      {/* ===== Hero ===== */}
      <section id="top" className="relative min-h-screen flex flex-col items-center justify-center px-5 sm:px-6 text-center">
        {/* Gold glow behind logo */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] md:w-[500px] md:h-[500px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)' }} />

        <div className="relative">
          {/* Large centered logo */}
          <div className="mb-10 hero-anim d1">
            <img
              src="/power-logo.jpg"
              alt="POWER 111"
              className="w-36 h-36 sm:w-48 sm:h-48 md:w-64 md:h-64 mx-auto rounded-3xl shadow-2xl float-logo"
              style={{ border: '2px solid rgba(245,158,11,0.2)' }}
            />
          </div>

          {/* Heading */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-black leading-tight hero-anim d2">
            لياقتك تبدأ{' '}
            <span className="gold-shimmer">من هنا</span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed hero-anim d3">
            جيم، صحة، وتغذية — منظومة متكاملة لرعاية جسمك في مكان واحد.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 hero-anim d4">
            <a
              href="#plans"
              className="w-full sm:w-auto px-10 py-4 rounded-full text-black font-bold text-lg transition-all duration-300 hover:scale-105 cta-pulse"
              style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' }}
            >
              انضم الآن
            </a>
            <a
              href="#services"
              className="w-full sm:w-auto px-10 py-4 rounded-full border border-white/20 text-white font-bold text-lg hover:bg-white/5 transition-all duration-300"
            >
              اكتشف المزيد
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 scroll-bounce">
          <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* ===== Stats ===== */}
      <section className="py-14 sm:py-16 px-5 sm:px-6 border-y border-white/5" style={{ backgroundColor: 'rgba(20,20,20,0.4)' }}>
        <div ref={statsRef as React.RefObject<HTMLDivElement>} className="stagger max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-4xl sm:text-5xl font-black gold-shimmer"><CountUp end={500} suffix="+" /></div>
            <div className="mt-2 text-sm text-gray-400">عضو نشط</div>
          </div>
          <div>
            <div className="text-4xl sm:text-5xl font-black gold-shimmer"><CountUp end={2} /></div>
            <div className="mt-2 text-sm text-gray-400">فروع مجهزة</div>
          </div>
          <div>
            <div className="text-4xl sm:text-5xl font-black gold-shimmer"><CountUp end={15} suffix="+" /></div>
            <div className="mt-2 text-sm text-gray-400">مدرب محترف</div>
          </div>
          <div>
            <div className="text-4xl sm:text-5xl font-black gold-shimmer"><CountUp end={12} /></div>
            <div className="mt-2 text-sm text-gray-400">ساعة يومياً</div>
          </div>
        </div>
      </section>

      {/* ===== Services ===== */}
      <section id="services" className="py-20 sm:py-24 px-5 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div ref={servicesRef as React.RefObject<HTMLDivElement>} className="reveal text-center">
            <span className="inline-block px-4 py-1.5 rounded-full text-yellow-500 text-sm font-bold" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
              خدماتنا
            </span>
            <h2 className="mt-4 text-3xl sm:text-5xl font-black">
              ثلاث ركائز… <span className="gold-shimmer">هدف واحد</span>
            </h2>
            <p className="mt-4 text-gray-400 max-w-xl mx-auto">
              نقدم لك تجربة متكاملة تجمع بين القوة والصحة والتغذية
            </p>
          </div>

          <div ref={servicesGridRef as React.RefObject<HTMLDivElement>} className="stagger mt-12 sm:mt-14 grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
            {[
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 6.5v11M3.5 8.5v7M17.5 6.5v11M20.5 8.5v7M6.5 12h11" />
                  </svg>
                ),
                title: 'جيم وكمال أجسام',
                desc: 'أحدث الأجهزة وأفضل المدربين لبناء عضلاتك وتحقيق لياقة أحلامك'
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21c-5.5-3.5-9-7-9-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 4-3.5 7.5-9 11z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h3l1.5-3 3 6 1.5-3h5" />
                  </svg>
                ),
                title: 'صحة وعلاج طبيعي',
                desc: 'برامج استشفاء وتأهيل بإشراف مختصين للعناية بصحتك وحركتك'
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 19c0-8 4-14 14-14 0 10-5 14-11 14M5 19c2-5 5-8 10-10" />
                  </svg>
                ),
                title: 'تغذية صحية',
                desc: 'خطط غذائية مخصصة تناسب هدفك — خسارة وزن، ضخامة، أو صحة عامة'
              }
            ].map((service) => (
              <div
                key={service.title}
                className="glow-card rounded-2xl border border-white/10 p-6 sm:p-8"
                style={{ backgroundColor: '#141414' }}
              >
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-yellow-500" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  {service.icon}
                </div>
                <h3 className="mt-6 text-xl font-bold">{service.title}</h3>
                <p className="mt-3 text-gray-400 leading-relaxed">{service.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Offers ===== */}
      {offers.length > 0 && (
        <section id="offers" className="py-20 sm:py-24 px-5 sm:px-6" style={{ backgroundColor: 'rgba(20,20,20,0.5)' }}>
          <div className="max-w-6xl mx-auto">
            <div ref={offersRef as React.RefObject<HTMLDivElement>} className="reveal text-center">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-red-400 text-sm font-bold" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                عروض حصرية
              </span>
              <h2 className="mt-4 text-3xl sm:text-5xl font-black">
                عروض <span className="gold-shimmer">لا تفوت</span>
              </h2>
            </div>

            <div ref={offersGridRef as React.RefObject<HTMLDivElement>} className="stagger mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className="group rounded-2xl border border-white/10 overflow-hidden hover:border-yellow-500/30 hover:-translate-y-1 transition-all duration-300"
                  style={{ backgroundColor: '#141414' }}
                >
                  <div className="relative h-48 overflow-hidden">
                    {offer.imagePath ? (
                      <img
                        src={offer.imagePath}
                        alt={offer.titleAr || offer.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), #141414)' }}>
                        <span className="text-6xl font-black" style={{ color: 'rgba(245,158,11,0.2)' }}>
                          {offer.discountPercent ? `${offer.discountPercent}%` : '🎁'}
                        </span>
                      </div>
                    )}
                    {offer.discountPercent && (
                      <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-red-500 text-white text-sm font-black shadow-lg">
                        خصم {offer.discountPercent}%
                      </div>
                    )}
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #141414, transparent, transparent)' }} />
                  </div>

                  <div className="p-6">
                    <h3 className="text-lg font-bold">{offer.titleAr || offer.title}</h3>
                    {(offer.descriptionAr || offer.description) && (
                      <p className="mt-2 text-sm text-gray-400 leading-relaxed line-clamp-2">
                        {offer.descriptionAr || offer.description}
                      </p>
                    )}
                    <div className="mt-4 flex items-center justify-between">
                      <DaysLeft endDate={offer.endDate} />
                      <a
                        href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(`أريد الاستفسار عن عرض: ${offer.titleAr || offer.title}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-full text-yellow-500 text-sm font-bold border border-yellow-500/20 hover:bg-yellow-500 hover:text-black transition-all duration-200"
                        style={{ backgroundColor: 'rgba(245,158,11,0.1)' }}
                      >
                        استفد الآن
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== Branches ===== */}
      <section id="branches" className="py-20 sm:py-24 px-5 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div ref={branchesRef as React.RefObject<HTMLDivElement>} className="reveal text-center">
            <span className="inline-block px-4 py-1.5 rounded-full text-yellow-500 text-sm font-bold" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
              فروعنا
            </span>
            <h2 className="mt-4 text-3xl sm:text-5xl font-black">
              على بعد <span className="gold-shimmer">خطوات</span> منك
            </h2>
            <p className="mt-4 text-gray-400 max-w-xl mx-auto">
              فرعين مجهزة بأحدث الأجهزة لتصلك في أي مكان
            </p>
          </div>

          {data.length === 0 ? (
            <p className="mt-12 text-center text-gray-500">جاري التحميل…</p>
          ) : (
            <div ref={branchesGridRef as React.RefObject<HTMLDivElement>} className="stagger mt-14 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {data.map((b) => (
                <div
                  key={b.id}
                  className="glow-card rounded-2xl border border-white/10 p-6"
                  style={{ backgroundColor: '#141414' }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-yellow-500 font-black text-sm"
                    style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.08))', border: '1px solid rgba(245,158,11,0.2)' }}
                  >
                    {b.code}
                  </div>
                  <h3 className="mt-5 text-lg font-bold">{b.name}</h3>
                  {b.address && (
                    <p className="mt-2 text-sm text-gray-400 leading-relaxed">{b.address}</p>
                  )}
                  <div className="mt-4 flex flex-col gap-2">
                    {b.phone && (
                      <a
                        href={`tel:${b.phone}`}
                        dir="ltr"
                        className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-yellow-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {b.phone}
                      </a>
                    )}
                    {b.locationUrl && (
                      <a
                        href={b.locationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-yellow-500 hover:text-yellow-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        الموقع على الخريطة
                      </a>
                    )}
                    {b.whatsapp && (
                      <a
                        href={`https://wa.me/${b.whatsapp.replace(/^0/, '20')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-green-400 hover:text-green-300 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12.04 2a9.9 9.9 0 0 0-8.51 14.94L2 22l5.2-1.49A9.9 9.9 0 1 0 12.04 2z" />
                        </svg>
                        واتساب
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== Plans ===== */}
      <section id="plans" className="py-20 sm:py-24 px-5 sm:px-6" style={{ backgroundColor: 'rgba(20,20,20,0.5)' }}>
        <div className="max-w-6xl mx-auto">
          <div ref={plansRef as React.RefObject<HTMLDivElement>} className="reveal text-center">
            <span className="inline-block px-4 py-1.5 rounded-full text-yellow-500 text-sm font-bold" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
              الخطط والأسعار
            </span>
            <h2 className="mt-4 text-3xl sm:text-5xl font-black">
              اختر <span className="gold-shimmer">خطتك</span> المناسبة
            </h2>
          </div>

          {data.length > 0 && (
            <div className="mt-10 flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-center">
              {data.map(b => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBranch(b.id)}
                  className={`shrink-0 px-7 py-3 rounded-full text-sm font-bold border transition-all duration-300 ${
                    selectedBranch === b.id
                      ? 'text-black shadow-lg scale-105'
                      : 'text-gray-300 hover:border-yellow-500/30 hover:text-white'
                  }`}
                  style={
                    selectedBranch === b.id
                      ? { background: 'linear-gradient(135deg, #FCD34D, #F59E0B)', border: '1px solid #F59E0B', boxShadow: '0 8px 25px rgba(245,158,11,0.25)' }
                      : { backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)' }
                  }
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}

          {branch && branch.plans.length === 0 && (
            <p className="mt-12 text-center text-gray-500">
              لا توجد خطط متاحة حالياً لهذا الفرع — تواصل معنا لمعرفة التفاصيل
            </p>
          )}

          {branch && branch.plans.length > 0 && (
            <div ref={plansGridRef as React.RefObject<HTMLDivElement>} className="stagger mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {branch.plans.map((plan, i) => (
                <div
                  key={plan.id}
                  className="group glow-card relative rounded-2xl border border-white/10 p-8 flex flex-col"
                  style={{ backgroundColor: '#141414' }}
                >
                  {i === 1 && branch.plans.length > 2 && (
                    <div
                      className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-black text-xs font-black"
                      style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' }}
                    >
                      الأكثر طلباً
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">{plan.nameAr}</h3>
                    <span className="px-3 py-1.5 rounded-full text-xs font-bold text-yellow-500" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      {plan.durationDays} يوم
                    </span>
                  </div>
                  {plan.descriptionAr && (
                    <p className="mt-3 text-sm text-gray-400 leading-relaxed flex-1">{plan.descriptionAr}</p>
                  )}
                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <div className="text-3xl font-black" style={goldGradient}>{formatEGP(plan.pricePiasters)}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        لمدة {plan.durationDays} يوم
                      </div>
                    </div>
                    <a
                      href={`https://wa.me/${branch.whatsapp?.replace(/^0/, '20') || SUPPORT_WHATSAPP}?text=${encodeURIComponent(`أريد الاشتراك في خطة ${plan.nameAr} - فرع ${branch.name}`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-6 py-3 rounded-full text-black text-sm font-black hover:scale-105 transition-all duration-200"
                      style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)', boxShadow: '0 4px 15px rgba(245,158,11,0.2)' }}
                    >
                      اشترك الآن
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== Why Us ===== */}
      <section className="py-20 sm:py-24 px-5 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div ref={whyRef as React.RefObject<HTMLDivElement>} className="reveal text-center">
            <span className="inline-block px-4 py-1.5 rounded-full text-yellow-500 text-sm font-bold" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
              ليه POWER 111؟
            </span>
            <h2 className="mt-4 text-3xl sm:text-5xl font-black">
              مش مجرد <span className="gold-shimmer">جيم</span>
            </h2>
          </div>

          <div ref={whyGridRef as React.RefObject<HTMLDivElement>} className="stagger mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0116.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.003 6.003 0 01-5.54 0" />
                  </svg>
                ),
                title: 'أجهزة عالمية',
                desc: 'أحدث أجهزة اللياقة من أفضل الماركات العالمية'
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                  </svg>
                ),
                title: 'مدربين محترفين',
                desc: 'فريق من أفضل المدربين المعتمدين لمساعدتك'
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                title: 'مواعيد مرنة',
                desc: 'نفتح من الصبح لبالليل عشان تناسب جدولك'
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                  </svg>
                ),
                title: 'تطبيق ذكي',
                desc: 'تابع تقدمك وتسجل حضورك من الموبايل'
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                ),
                title: 'تكييف مركزي',
                desc: 'أجواء مريحة ومكيفة في كل الفروع'
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>
                ),
                title: 'مواقف مجانية',
                desc: 'مواقف واسعة ومجانية لكل الأعضاء'
              }
            ].map((feature) => (
              <div
                key={feature.title}
                className="flex gap-4 p-5 rounded-xl border border-white/5 hover:border-yellow-500/20 transition-colors duration-300"
                style={{ backgroundColor: 'rgba(20,20,20,0.5)' }}
              >
                <div className="text-yellow-500 shrink-0">{feature.icon}</div>
                <div>
                  <h3 className="font-bold text-white">{feature.title}</h3>
                  <p className="mt-1 text-sm text-gray-400">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Contact CTA ===== */}
      <section id="contact" className="py-20 sm:py-24 px-5 sm:px-6">
        <div ref={contactRef as React.RefObject<HTMLDivElement>} className="reveal-scale max-w-4xl mx-auto">
          <div
            className="relative rounded-3xl border border-yellow-500/20 p-8 sm:p-12 lg:p-16 text-center overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.06), #141414, rgba(245,158,11,0.04))' }}
          >
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-60 h-60 sm:w-80 sm:h-80 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'rgba(245,158,11,0.08)' }} />

            <div className="relative">
              <img src="/power-logo.jpg" alt="POWER 111" className="w-20 h-20 rounded-2xl mx-auto mb-6" style={{ border: '1px solid rgba(245,158,11,0.2)' }} />

              <h2 className="text-3xl sm:text-4xl font-black">
                جاهز تبدأ <span className="gold-shimmer">رحلتك؟</span>
              </h2>
              <p className="mt-4 text-gray-400 max-w-lg mx-auto">
                كلمنا على واتساب وفريقنا هيساعدك تختار الخطة المناسبة ليك وتبدأ حياتك الصحية النهاردة
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href={`https://wa.me/${SUPPORT_WHATSAPP}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-full text-black font-bold text-lg shadow-xl hover:scale-105 transition-all duration-300"
                  style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)', boxShadow: '0 8px 30px rgba(245,158,11,0.3)' }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path d="M12.04 2a9.9 9.9 0 0 0-8.51 14.94L2 22l5.2-1.49A9.9 9.9 0 1 0 12.04 2zm5.77 14.06c-.24.68-1.4 1.3-1.93 1.35-.52.05-1.01.24-3.4-.71-2.87-1.13-4.68-4.06-4.82-4.25-.14-.19-1.15-1.53-1.15-2.92 0-1.39.73-2.07.99-2.35.26-.28.57-.35.76-.35h.55c.18 0 .41-.07.64.49.24.57.81 1.97.88 2.11.07.14.12.31.02.5-.1.19-.14.3-.29.47-.14.16-.3.36-.43.49-.14.14-.29.3-.12.58.16.28.73 1.2 1.57 1.95 1.08.96 1.99 1.26 2.27 1.4.28.14.45.12.61-.07.17-.19.7-.81.89-1.09.19-.28.38-.23.63-.14.26.09 1.63.77 1.91.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z" />
                  </svg>
                  تواصل واتساب
                </a>
                <a
                  href="tel:+201055002069"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-white/15 text-white font-bold text-lg hover:bg-white/5 transition-all duration-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  اتصل بينا
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-white/10 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src="/power-logo.jpg" alt="POWER 111" className="w-10 h-10 rounded-lg" />
                <div>
                  <div className="font-extrabold text-lg">POWER <span style={goldGradient}>111</span></div>
                  <div className="text-xs text-gray-500">لياقة • صحة • تغذية</div>
                </div>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                منظومة متكاملة لرعاية جسمك وصحتك في فرعين على مستوى الجمهورية
              </p>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4">روابط سريعة</h4>
              <div className="space-y-2">
                <a href="#services" className="block text-sm text-gray-400 hover:text-yellow-500 transition-colors">خدماتنا</a>
                <a href="#branches" className="block text-sm text-gray-400 hover:text-yellow-500 transition-colors">الفروع</a>
                <a href="#plans" className="block text-sm text-gray-400 hover:text-yellow-500 transition-colors">الخطط والأسعار</a>
                {offers.length > 0 && <a href="#offers" className="block text-sm text-gray-400 hover:text-yellow-500 transition-colors">العروض</a>}
              </div>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4">حسابك</h4>
              <div className="space-y-2">
                <Link to="/portal" className="block text-sm text-gray-400 hover:text-yellow-500 transition-colors">بوابة الأعضاء</Link>
                <Link to="/login" className="block text-sm text-gray-400 hover:text-yellow-500 transition-colors">دخول الموظفين</Link>
                <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} className="block text-sm text-gray-400 hover:text-yellow-500 transition-colors">تواصل معنا</a>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-600">© {new Date().getFullYear()} POWER 111 — جميع الحقوق محفوظة</p>
            <div className="flex items-center gap-4">
              <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-green-400 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.04 2a9.9 9.9 0 0 0-8.51 14.94L2 22l5.2-1.49A9.9 9.9 0 1 0 12.04 2z" />
                </svg>
              </a>
              <a href="tel:+201055002069" className="text-gray-500 hover:text-yellow-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
