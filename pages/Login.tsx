import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Lock, 
  Mail, 
  ShieldCheck, 
  Loader2, 
  Circle,
  AlertCircle
} from 'lucide-react';
import { auth } from '../api';
import { useTranslation } from '../contexts/LanguageContext';

const Login: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password;

    if (!normalizedEmail || !normalizedPassword) {
      setError('Email and password are required.');
      setIsLoading(false);
      return;
    }

    try {
      // Login using MySQL backend API
      const result = await auth.signInWithEmailAndPassword(normalizedEmail, normalizedPassword);
      if (result.success) {
        console.log("Login successful!");
        const role = String(result.user?.role || '').toLowerCase();
        const canSell = Boolean((result.user as any)?.canSell);
        const isMarketplace = role === 'customer' || canSell;
        const nextPath = role === 'admin'
          ? '/users'
          : role === 'supervisor'
            ? '/supervisor-dashboard'
            : isMarketplace
              ? '/customer-dashboard'
              : '/farmer-dashboard';
        navigate(nextPath);
      } else {
        setError(result.message || t('error'));
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err.code === 'api/403' || String(err.message || '').toLowerCase().includes('inactive')) {
        setError(err.message || 'Your account is inactive. Contact admin for support.');
      } else if (err.code === 'api/401') {
        setError(err.message || 'Invalid email or password.');
      } else if (err.message?.includes('fetch') || err.message?.includes('network')) {
        setError('Cannot reach the server. Please check that the backend is running.');
      } else {
        setError(err.message || t('error'));
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f3f4f6] dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden font-['Poppins',_sans-serif]">
      <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 rounded-full blur-3xl bg-emerald-100/30 dark:bg-emerald-500/10"></div>
      <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-96 h-96 rounded-full blur-3xl bg-slate-200/30 dark:bg-slate-500/10"></div>

      <div className="max-w-md w-full relative z-10">
        <div className="bg-white dark:bg-slate-900 p-10 md:p-14 rounded-[2.5rem] shadow-2xl border border-white/80 dark:border-white/5 space-y-8 animate-fade-in">
          
          <div className="text-center">
            <div className="mx-auto h-28 w-28 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-4 shadow-sm border-4 border-white dark:border-slate-800 overflow-hidden">
              {/* Try to load poultry avatar from assets; fall back to Circle icon if missing */}
              <img
                src="/assets/chicken-avatar.svg"
                alt="Chicken avatar"
                className="w-full h-full object-cover"
                onLoad={() => { /* no-op; successful load will show image */ }}
                onError={(e: any) => { e.currentTarget.style.display = 'none'; }}
              />
              {/* Fallback icon -- shown only if image not available. Using CSS to place behind if image exists */}
              <div className="absolute">
                <Circle size={40} strokeWidth={1.5} />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Eco-SPC & Farm management system</h2>
            <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm">{t('login_with_account')}</p>

            {/* Small badge under avatar (like image2) */}
            <div className="mt-3 flex items-center justify-center">
              <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">ADVANCED AI</span>
            </div>
          </div>

          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">{t('your_email')}</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-slate-100/50 dark:bg-white/5 rounded-lg text-slate-400">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#f0f4ff] dark:bg-slate-950 border border-slate-100 dark:border-white/5 rounded-2xl pl-16 pr-4 py-4 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium text-slate-700 dark:text-slate-200"
                  placeholder="urugero: kareb@gmail.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">{t('password')}</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-slate-100/50 dark:bg-white/5 rounded-lg text-slate-400">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#f0f4ff] dark:bg-slate-950 border border-slate-100 dark:border-white/5 rounded-2xl pl-16 pr-4 py-4 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium text-slate-700 dark:text-slate-200"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-4 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl text-sm font-bold">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full flex items-center justify-center py-5 px-4 rounded-2xl text-white font-black uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-xl ${
                isLoading ? 'bg-slate-400' : 'bg-[#10b981] hover:bg-emerald-600 shadow-emerald-500/20'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={18} />
                  {t('loading_wait')}
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2" size={18} />
                  {t('login_button')}
                </>
              )}
            </button>
          </form>

          <div className="pt-6 border-t border-slate-100 dark:border-white/5 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-500 font-medium">
              {t('login_help')} <a href="#/contact" className="text-emerald-600 font-bold hover:underline">{t('contact_admin')}</a>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 font-medium mt-2">
              Accounts are created by admin only. Contact admin support to get access.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 font-medium mt-2">
              Want to sell products?{' '}
              <a href="#/seller-application" className="text-emerald-600 font-bold hover:underline">
                Apply to be a seller
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;