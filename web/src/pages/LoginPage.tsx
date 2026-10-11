import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'حدث خطأ في تسجيل الدخول');
        return;
      }

      login(data.user);
      navigate('/admin');
    } catch (err) {
      setError('حدث خطأ في الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'rgba(245,158,11,0.06)' }} />

      <div className="w-full max-w-md relative">
        <div className="bg-dark-card border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <img src="/power-logo.jpg" alt="POWER 111" className="w-24 h-24 mx-auto rounded-2xl object-cover mb-4 shadow-lg" style={{ border: '2px solid rgba(245,158,11,0.2)' }} />
            <h1 className="text-3xl font-black text-white mb-1">POWER <span style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>111</span></h1>
            <p className="text-gray-400 text-sm">لوحة تحكم الموظفين</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/40 rounded-xl p-3 text-rose-400 text-sm text-center">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                placeholder="owner@power111.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                كلمة المرور
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-dark border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-black font-bold transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)', boxShadow: '0 4px 20px rgba(245,158,11,0.25)' }}
            >
              {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-dark border border-white/5 rounded-xl">
            <p className="text-xs text-gray-500 mb-2">بيانات الدخول الافتراضية:</p>
            <p className="text-xs text-gray-400 font-mono" dir="ltr">Email: admin@power111.com</p>
            <p className="text-xs text-gray-400 font-mono" dir="ltr">Password: admin123</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
