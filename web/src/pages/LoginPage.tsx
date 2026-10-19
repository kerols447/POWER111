import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const REMEMBERED_EMAIL_KEY = 'power111:rememberedEmail';
const GOLD = '#FFC928';

/** Three brand symbols echoed from the club logo: fitness, health, nutrition. */
function BrandMarks() {
  return (
    <div className="flex items-center justify-center gap-7" aria-hidden="true">
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.7" strokeLinecap="round">
        <path d="M3 9v6M6 7v10M6 12h12M18 7v10M21 9v6" />
      </svg>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 3c0 5-7.5 9.6-7.5 9.6Z" />
      </svg>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 4c-8 0-14 3.5-14 9.5 0 2 .7 3.7 1.8 5C10 15 13.6 11.6 19 10.4c-4.6 2.1-8.2 5.6-10.2 10" />
      </svg>
    </div>
  );
}

function LoginPage() {
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => !!localStorage.getItem(REMEMBERED_EMAIL_KEY));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    if (!email.trim() || !password) {
      setError('اكتب البريد الإلكتروني وكلمة المرور');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('البريد الإلكتروني مش مكتوب صح');
      return;
    }
    if (password.length < 6) {
      setError('كلمة المرور لازم تكون ٦ حروف على الأقل');
      return;
    }

    setLoading(true);

    try {
      const mail = email.trim();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: mail, password })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'بيانات غير صحيحة، جرّب تاني');
        setPassword('');
        return;
      }

      if (remember) localStorage.setItem(REMEMBERED_EMAIL_KEY, mail);
      else localStorage.removeItem(REMEMBERED_EMAIL_KEY);

      login(data.user);
      navigate('/admin');
    } catch {
      setError('حصلت مشكلة في الاتصال بالسيرفر');
    } finally {
      setLoading(false);
    }
  };

  const field =
    'w-full h-[52px] bg-black/45 border border-white/10 rounded-xl text-white text-sm placeholder:text-gray-500 backdrop-blur-sm transition-colors focus:outline-none focus:border-[#FFC928]/70 focus:bg-black/60';

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#080808] px-4 py-9">
      <img
        src="/images/login-bg.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.55 }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(8,8,8,0.62) 0%, rgba(8,8,8,0.82) 45%, rgba(8,8,8,0.95) 100%)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(85% 70% at 50% 42%, rgba(8,8,8,0) 35%, rgba(8,8,8,0.88) 100%)' }}
      />

      {/* Gold accent stripes, top-left and bottom-right */}
      <div className="absolute -top-16 -left-24 w-[340px] h-[340px] rotate-[-38deg] pointer-events-none hidden sm:block" aria-hidden="true">
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}B3, transparent)` }} />
        <div className="absolute top-5 left-10 right-10 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}59, transparent)` }} />
      </div>
      <div className="absolute -bottom-16 -right-24 w-[340px] h-[340px] rotate-[-38deg] pointer-events-none hidden sm:block" aria-hidden="true">
        <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}B3, transparent)` }} />
        <div className="absolute bottom-5 left-10 right-10 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}59, transparent)` }} />
      </div>

      <div className="relative w-full max-w-[430px]">
        <div className="flex flex-col items-center mb-6">
          <div className="relative">
            <div
              className="absolute -inset-4 rounded-[30px] pointer-events-none"
              style={{ background: `radial-gradient(50% 50% at 50% 50%, ${GOLD}4D 0%, rgba(8,8,8,0) 72%)` }}
            />
            <img
              src="/power-logo.jpg"
              alt="POWER 111"
              className="relative w-[86px] h-[86px] rounded-[24px] object-cover"
              style={{ border: `1.5px solid ${GOLD}`, boxShadow: `0 0 0 4px rgba(8,8,8,0.9), 0 18px 46px -14px ${GOLD}99` }}
            />
          </div>
          <p className="mt-4 text-[30px] font-extrabold leading-none tracking-tight text-white">
            POWER <span style={{ color: GOLD }}>111</span>
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="relative bg-[#151515]/75 backdrop-blur-2xl border border-white/10 rounded-[26px] p-6 sm:p-7"
          style={{ boxShadow: '0 50px 110px -40px rgba(0,0,0,1)' }}
        >
          <div
            className="absolute inset-x-12 top-0 h-px pointer-events-none"
            style={{ background: `linear-gradient(90deg, transparent, ${GOLD}99, transparent)` }}
          />

          <h1 className="text-center text-[21px] font-extrabold text-white leading-tight">
            مرحباً بك في <span style={{ color: GOLD }}>POWER 111</span>
          </h1>
          <div className="flex items-center justify-center gap-3 mt-2 mb-6">
            <span className="h-px w-9 bg-white/15" aria-hidden="true" />
            <p className="text-[13px] text-gray-400">سجّل دخولك للمتابعة</p>
            <span className="h-px w-9 bg-white/15" aria-hidden="true" />
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 bg-[#F28C00]/10 border border-[#F28C00]/45 rounded-xl px-3.5 py-3 text-[#F28C00] text-sm text-center"
            >
              {error}
            </div>
          )}

          <label htmlFor="login-email" className="block text-[13px] font-bold text-gray-300 mb-2">
            البريد الإلكتروني
          </label>
          <div className="relative">
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              inputMode="email"
              dir="ltr"
              className={`${field} pr-12 pl-4`}
              placeholder="name@power111.com"
            />
            <svg
              className="absolute top-1/2 -translate-y-1/2 right-4 text-gray-500 pointer-events-none"
              width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
            >
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="m4 7 8 6 8-6" />
            </svg>
          </div>

          <label htmlFor="login-password" className="block text-[13px] font-bold text-gray-300 mt-5 mb-2">
            كلمة المرور
          </label>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              dir="ltr"
              className={`${field} pr-12 pl-12`}
              placeholder="••••••••"
            />
            <svg
              className="absolute top-1/2 -translate-y-1/2 right-4 text-gray-500 pointer-events-none"
              width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
            >
              <rect x="4" y="10" width="16" height="10" rx="2.5" />
              <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
            </svg>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              className="absolute top-1/2 -translate-y-1/2 left-1 w-11 h-11 flex items-center justify-center text-gray-400 hover:text-[#FFC928] focus:outline-none focus-visible:text-[#FFC928]"
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="2.6" />
                  <path d="M4 20 20 4" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="2.6" />
                </svg>
              )}
            </button>
          </div>

          <label className="mt-4 flex items-center gap-2.5 w-fit cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-[17px] h-[17px] rounded accent-[#FFC928]"
            />
            <span className="text-[13px] text-gray-300">تذكرني</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full h-[52px] rounded-xl text-black text-[15px] font-extrabold transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2.5"
            style={{
              background: `linear-gradient(135deg, ${GOLD} 0%, #F28C00 100%)`,
              boxShadow: '0 18px 40px -18px rgba(255,201,40,0.85)'
            }}
          >
            {loading ? (
              'جاري الدخول…'
            ) : (
              <>
                تسجيل الدخول
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M11 6l-6 6 6 6" />
                </svg>
              </>
            )}
          </button>
        </form>

        <div className="mt-6">
          <BrandMarks />
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
