import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { whatsappLink } from '../utils/whatsapp';

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

const SUPPORT_PHONE = '01055002069';

const card = 'rounded-2xl border border-white/10 bg-[#141414]';
const chip = 'inline-block px-3 py-1 rounded-full text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20';
const goldBtn = 'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-black font-bold text-sm transition-colors hover:bg-amber-400';
const ghostBtn = 'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-white/15 text-white font-bold text-sm transition-colors hover:bg-white/5';

function formatEGP(piasters: number) {
  return `${(piasters / 100).toLocaleString('en-US')} ج.م`;
}

function daysLeft(endDate: string) {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
}

function shortBranchName(name: string) {
  return name.replace(/^POWER\s*111\s*[—–-]\s*/i, '');
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="text-center">
      <span className={chip}>{eyebrow}</span>
      <h2 className="mt-4 text-2xl sm:text-4xl font-black text-white">{title}</h2>
      {subtitle && <p className="mt-3 text-sm sm:text-base text-gray-400 max-w-xl mx-auto">{subtitle}</p>}
    </div>
  );
}

export default function LandingPage() {
  const [branches, setBranches] = useState<PublicBranch[]>([]);
  const [offers, setOffers] = useState<PublicOffer[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
  const supportWa = whatsappLink(SUPPORT_PHONE, 'أريد الاستفسار عن الاشتراكات في POWER 111') || `tel:${SUPPORT_PHONE}`;

  const navLinks = [
    { href: '#services', label: 'خدماتنا' },
    { href: '#branches', label: 'الفروع' },
    { href: '#plans', label: 'الخطط والأسعار' },
    ...(offers.length > 0 ? [{ href: '#offers', label: 'العروض' }] : []),
    { href: '#contact', label: 'تواصل معنا' }
  ];

  const stats = [
    { value: loaded ? branches.length : '—', label: 'فروع' },
    { value: loaded ? totalPlans : '—', label: 'خطط وأسعار' },
    { value: loaded ? offers.length : '—', label: 'عروض حالية' }
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

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* ===== Nav ===== */}
      <nav className="sticky top-0 z-50 bg-black/85 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2.5">
            <img src="/power-logo.jpg" alt="POWER 111" className="w-9 h-9 rounded-lg" />
            <span className="text-lg font-black tracking-tight">POWER 111</span>
          </a>

          <div className="hidden md:flex items-center gap-7 text-sm text-gray-300">
            {navLinks.map(link => (
              <a key={link.href} href={link.href} className="hover:text-amber-400 transition-colors">{link.label}</a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link to="/portal" className="hidden sm:inline-flex px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition-colors">
              بوابة الأعضاء
            </Link>
            <button onClick={() => setMenuOpen(!menuOpen)} aria-label="القائمة" className="md:hidden p-2 text-gray-300 hover:text-white">
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

        {menuOpen && (
          <div className="md:hidden border-t border-white/10 bg-black/95 px-4 py-3">
            {navLinks.map(link => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block py-2.5 text-sm text-gray-300 hover:text-amber-400"
              >
                {link.label}
              </a>
            ))}
            <Link to="/portal" onClick={() => setMenuOpen(false)} className="block py-2.5 text-sm font-bold text-amber-400">
              بوابة الأعضاء
            </Link>
          </div>
        )}
      </nav>

      {/* ===== Hero ===== */}
      <header id="top" className="px-4 sm:px-6 py-16 sm:py-24 text-center">
        <img src="/power-logo.jpg" alt="POWER 111" className="w-28 h-28 sm:w-36 sm:h-36 mx-auto rounded-2xl border border-amber-500/25" />
        <h1 className="mt-8 text-3xl sm:text-5xl font-black leading-tight">
          لياقتك تبدأ <span className="text-amber-400">من هنا</span>
        </h1>
        <p className="mt-4 text-base sm:text-lg text-gray-400 max-w-xl mx-auto leading-relaxed">
          جيم، صحة، وتغذية — منظومة متكاملة لرعاية جسمك في مكان واحد.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-md mx-auto sm:max-w-none">
          <a href="#plans" className={goldBtn}>شوف الأسعار</a>
          <a href={supportWa} target="_blank" rel="noreferrer" className={ghostBtn}>كلمنا واتساب</a>
        </div>

        <div className="mt-12 sm:mt-16 grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl mx-auto">
          {stats.map(stat => (
            <div key={stat.label} className={`${card} px-2 py-5`}>
              <div className="text-2xl sm:text-3xl font-black text-amber-400">{stat.value}</div>
              <div className="mt-1 text-xs sm:text-sm text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>
      </header>

      {/* ===== Services ===== */}
      <section id="services" className="px-4 sm:px-6 py-14 sm:py-20 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <SectionHeading eyebrow="خدماتنا" title="ثلاث ركائز… هدف واحد" subtitle="تجربة متكاملة تجمع بين القوة والصحة والتغذية" />
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {services.map(service => (
              <div key={service.title} className={`${card} p-6`}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-amber-400 bg-amber-500/10 border border-amber-500/20">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d={service.icon} />
                  </svg>
                </div>
                <h3 className="mt-5 text-lg font-bold">{service.title}</h3>
                <p className="mt-2 text-sm text-gray-400 leading-relaxed">{service.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Offers ===== */}
      {offers.length > 0 && (
        <section id="offers" className="px-4 sm:px-6 py-14 sm:py-20 border-t border-white/5 bg-[#0E0E0E]">
          <div className="max-w-6xl mx-auto">
            <SectionHeading eyebrow="عروض حالية" title="عروض لا تفوت" />
            <div className={`mt-10 grid grid-cols-1 gap-4 ${offers.length === 1 ? 'sm:mx-auto sm:max-w-md' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {offers.map(offer => {
                const remaining = daysLeft(offer.endDate);
                return (
                  <div key={offer.id} className={`${card} overflow-hidden flex flex-col`}>
                    <div className="relative h-40 flex items-center justify-center bg-gradient-to-br from-amber-500/15 to-transparent">
                      {offer.imagePath ? (
                        <img src={offer.imagePath} alt={offer.titleAr || offer.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-5xl font-black text-amber-500/25">
                          {offer.discountPercent ? `${offer.discountPercent}%` : 'POWER 111'}
                        </span>
                      )}
                      {offer.discountPercent ? (
                        <span className="absolute top-3 right-3 px-3 py-1 rounded-full bg-red-500 text-white text-xs font-black">
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
                        <span className={`text-xs font-medium ${remaining > 0 ? 'text-gray-400' : 'text-red-400'}`}>
                          {remaining > 0 ? `متبقي ${remaining} يوم` : 'انتهى العرض'}
                        </span>
                        <a
                          href={whatsappLink(SUPPORT_PHONE, `أريد الاستفسار عن عرض: ${offer.titleAr || offer.title}`) || supportWa}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 rounded-lg text-xs font-bold text-amber-400 border border-amber-500/25 hover:bg-amber-500 hover:text-black transition-colors"
                        >
                          استفد الآن
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ===== Branches ===== */}
      <section id="branches" className="px-4 sm:px-6 py-14 sm:py-20 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <SectionHeading eyebrow="فروعنا" title="على بعد خطوات منك" subtitle="فروع مجهزة بأحدث الأجهزة لتصلك في أي مكان" />

          {!loaded && <p className="mt-10 text-center text-sm text-gray-500">جاري التحميل…</p>}
          {loaded && branches.length === 0 && (
            <p className="mt-10 text-center text-sm text-gray-500">لا توجد فروع مضافة حالياً</p>
          )}

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {branches.map(branch => {
              const wa = whatsappLink(branch.whatsapp || branch.phone || '');
              return (
                <div key={branch.id} className={`${card} p-5 sm:p-6`}>
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
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 border border-white/10 hover:text-amber-400 hover:border-amber-500/25 transition-colors"
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
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12.04 2a9.9 9.9 0 0 0-8.51 14.94L2 22l5.2-1.49A9.9 9.9 0 1 0 12.04 2z" />
                        </svg>
                        <span>واتساب</span>
                      </a>
                    )}
                    {branch.locationUrl && (
                      <a
                        href={branch.locationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>الموقع على الخريطة</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Plans ===== */}
      <section id="plans" className="px-4 sm:px-6 py-14 sm:py-20 border-t border-white/5 bg-[#0E0E0E]">
        <div className="max-w-6xl mx-auto">
          <SectionHeading eyebrow="الخطط والأسعار" title="اختر خطتك المناسبة" />

          {branches.length > 1 && (
            <div className="mt-8 flex gap-2 overflow-x-auto pb-1 sm:justify-center">
              {branches.map(branch => (
                <button
                  key={branch.id}
                  onClick={() => setSelectedBranchId(branch.id)}
                  className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                    selectedBranchId === branch.id
                      ? 'bg-amber-500 text-black border-amber-500'
                      : 'text-gray-300 bg-[#141414] border-white/10 hover:border-amber-500/30'
                  }`}
                >
                  {shortBranchName(branch.name)}
                </button>
              ))}
            </div>
          )}

          {selectedBranch && selectedBranch.plans.length === 0 && (
            <div className="mt-10 text-center">
              <p className="text-sm text-gray-400">لا توجد خطط معلنة لهذا الفرع بعد.</p>
              <a
                href={
                  whatsappLink(
                    selectedBranch.whatsapp || selectedBranch.phone || SUPPORT_PHONE,
                    `أريد الاستفسار عن أسعار اشتراكات ${selectedBranch.name}`
                  ) || supportWa
                }
                target="_blank"
                rel="noreferrer"
                className={`mt-5 ${goldBtn}`}
              >
                اسأل عن الأسعار
              </a>
            </div>
          )}

          {selectedBranch && selectedBranch.plans.length > 0 && (
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedBranch.plans.map(plan => {
                const wa = whatsappLink(
                  selectedBranch.whatsapp || selectedBranch.phone || SUPPORT_PHONE,
                  `أريد الاشتراك في خطة ${plan.nameAr} — ${selectedBranch.name}`
                );
                return (
                  <div key={plan.id} className={`${card} p-6 flex flex-col`}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-bold">{plan.nameAr}</h3>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 shrink-0">
                        {plan.durationDays} يوم
                      </span>
                    </div>
                    {plan.descriptionAr && (
                      <p className="mt-3 text-sm text-gray-400 leading-relaxed flex-1">{plan.descriptionAr}</p>
                    )}
                    <div className="mt-5">
                      <div className="text-2xl font-black text-amber-400">{formatEGP(plan.pricePiasters)}</div>
                    </div>
                    <a href={wa || supportWa} target="_blank" rel="noreferrer" className={`mt-5 w-full ${goldBtn}`}>
                      اشترك الآن
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ===== Why us ===== */}
      <section className="px-4 sm:px-6 py-14 sm:py-20 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow="ليه POWER 111؟" title="مش مجرد جيم" />
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(feature => (
              <div key={feature.title} className={`${card} p-5 flex items-start gap-3`}>
                <svg className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <h3 className="text-sm font-bold">{feature.title}</h3>
                  <p className="mt-1 text-sm text-gray-400">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Contact CTA ===== */}
      <section id="contact" className="px-4 sm:px-6 py-14 sm:py-20 border-t border-white/5 bg-[#0E0E0E]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-4xl font-black">جاهز تبدأ رحلتك؟</h2>
          <p className="mt-4 text-sm sm:text-base text-gray-400">
            كلمنا على واتساب وفريقنا هيساعدك تختار الخطة المناسبة ليك وتبدأ النهاردة.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-md mx-auto sm:max-w-none">
            <a href={supportWa} target="_blank" rel="noreferrer" className={goldBtn}>تواصل واتساب</a>
            <a href={`tel:${SUPPORT_PHONE}`} dir="ltr" className={ghostBtn}>{SUPPORT_PHONE}</a>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="px-4 sm:px-6 py-10 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-right">
            <div className="flex items-center justify-center sm:justify-start gap-2.5">
              <img src="/power-logo.jpg" alt="POWER 111" className="w-8 h-8 rounded-lg" />
              <span className="font-black">POWER 111</span>
            </div>
            <p className="mt-2 text-xs text-gray-500">لياقة • صحة • تغذية</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
            <a href="#branches" className="hover:text-amber-400">الفروع</a>
            <a href="#plans" className="hover:text-amber-400">الخطط والأسعار</a>
            <Link to="/portal" className="hover:text-amber-400">بوابة الأعضاء</Link>
            <Link to="/login" className="hover:text-amber-400">دخول الموظفين</Link>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-gray-600">© {new Date().getFullYear()} POWER 111 — جميع الحقوق محفوظة</p>
      </footer>
    </div>
  );
}
