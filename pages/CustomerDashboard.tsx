import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Package, Store, RefreshCw } from 'lucide-react';
import Announcements from '../components/Announcements';
import { parseApiResponse } from '../utils/parseApiResponse';
import { useTheme } from '../contexts/ThemeContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const CustomerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [productsCount, setProductsCount] = useState(0);
  const [announcementsCount, setAnnouncementsCount] = useState(0);
  const [profile, setProfile] = useState<{
    sellerOtp?: string | null;
    sellerOtpExpiresAt?: string | null;
    sellerPaidUntil?: string | null;
    createdAt?: string | null;
    canSell?: boolean;
  }>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const userId = useMemo(() => String(localStorage.getItem('userId') || ''), []);
  const userName = useMemo(() => String(localStorage.getItem('userName') || ''), []);
  const userEmail = useMemo(() => String(localStorage.getItem('userEmail') || ''), []);
  const sellerOtp = useMemo(() => String(localStorage.getItem('sellerOtp') || ''), []);
  const sellerOtpExpiresAt = useMemo(() => String(localStorage.getItem('sellerOtpExpiresAt') || ''), []);
  const canSell = useMemo(() => localStorage.getItem('canSell') === 'true', []);
  const authToken = useMemo(() => String(localStorage.getItem('authToken') || ''), []);

  const formatDate = (value?: string | null) => {
    if (!value) return 'n/a';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'n/a';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const fetchProducts = async () => {
    if (!userId && !userName && !userEmail) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/products`);
      const data = await parseApiResponse(response);
      const products = Array.isArray(data?.products) ? data.products : [];

      const owned = products.filter((product: any) => String(product.uploaded_by || '') === userId);
      if (owned.length > 0) {
        setProductsCount(owned.length);
      } else {
        const nameKey = userName.trim().toLowerCase();
        const emailKey = userEmail.trim().toLowerCase();
        const fallback = products.filter((product: any) => {
          const seller = String(product.seller_name || '').trim().toLowerCase();
          const contact = String(product.contact || '').trim().toLowerCase();
          return (nameKey && seller.includes(nameKey)) || (emailKey && (contact.includes(emailKey) || seller.includes(emailKey)));
        });
        setProductsCount(fallback.length);
      }
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load products', error);
      setProductsCount(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnnouncementsCount = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/announcements`);
      const data = await parseApiResponse(response);
      const announcements = Array.isArray(data?.data) ? data.data : [];
      setAnnouncementsCount(announcements.length);
    } catch (error) {
      console.error('Failed to load announcements', error);
      setAnnouncementsCount(0);
    }
  };

  const fetchProfile = async () => {
    if (!userId || !authToken) return;

    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to fetch profile');
      }

      setProfile({
        sellerOtp: data?.sellerOtp ?? null,
        sellerOtpExpiresAt: data?.sellerOtpExpiresAt ?? null,
        sellerPaidUntil: data?.sellerPaidUntil ?? null,
        createdAt: data?.createdAt ?? null,
        canSell: Boolean(data?.canSell)
      });
    } catch (error) {
      console.error('Failed to load profile', error);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchAnnouncementsCount();
    fetchProfile();
  }, []);

  const displayedOtp = profile.sellerOtp || sellerOtp || 'n/a';
  const displayedPaidDate = formatDate(profile.createdAt || null);
  const displayedFromDate = formatDate(profile.createdAt || null);
  const displayedEndingDate = formatDate(profile.sellerPaidUntil || sellerOtpExpiresAt || null);
  const accessEnabled = profile.canSell ?? canSell;

  return (
    <div
      className="min-h-screen px-4 sm:px-8 py-10 bg-[var(--app-bg)] text-[var(--app-text)]"
      style={{
        fontFamily: "'Poppins', sans-serif",
        ['--glow-green' as any]: isDark ? '#20d9a1' : '#4ade80',
        ['--glow-amber' as any]: isDark ? '#f6c86a' : '#facc15',
        ['--glow-teal' as any]: isDark ? '#3dd5c3' : '#22c55e',
        ['--card' as any]: '#111820'
      }}
    >
      <div className="max-w-6xl mx-auto">
        <div
          className={`relative overflow-hidden rounded-[32px] border p-8 sm:p-12 shadow-2xl ${
            isDark
              ? 'border-white/10 bg-gradient-to-br from-[#0e2a22] via-[#0b3f36] to-[#0c2f2c]'
              : 'border-[var(--app-border)] bg-gradient-to-br from-white via-[#f8fafc] to-[#eef2f7]'
          }`}
        >
          <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-[var(--glow-green)]/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-56 rounded-full bg-[var(--glow-amber)]/10 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--app-muted)]">Marketplace Control</p>
              <h1 className={`mt-3 text-3xl sm:text-4xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Customer Marketplace Dashboard
              </h1>
              <p className={`mt-2 text-sm max-w-xl ${isDark ? 'text-emerald-100/80' : 'text-[var(--app-muted)]'}`}>
                Track your uploaded products, manage listings, and open the product registration form anytime.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchProducts}
              className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-xs font-black uppercase tracking-widest transition ${
                isDark
                  ? 'border-white/10 bg-white/10 text-white hover:bg-white/20'
                  : 'border-[var(--app-border)] bg-[var(--app-surface-2)] text-[var(--app-text)] hover:bg-[var(--app-surface-3)]'
              }`}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Updating' : 'Refresh'}
            </button>
          </div>
          {lastUpdated && (
            <p className={`mt-6 text-xs ${isDark ? 'text-emerald-100/70' : 'text-[var(--app-muted)]'}`}>
              Last updated: {lastUpdated.toLocaleString()}
            </p>
          )}
        </div>

        <div className="mt-8 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <div
            className={`rounded-[24px] border p-6 shadow-lg ${
              isDark
                ? 'border-white/10 bg-[#0d1f22]'
                : 'border-[var(--app-border)] bg-white'
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-[var(--app-muted)]">Access Details</p>
                <h2 className={`mt-3 text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  One clear access block
                </h2>
                <p className={`mt-2 text-sm ${isDark ? 'text-emerald-100/70' : 'text-[var(--app-muted)]'}`}>
                  OTP, date paid, from date, and ending date are shown together for easy checking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/marketplace')}
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--app-accent)] px-6 py-3 text-xs font-black uppercase tracking-widest text-[var(--app-accent-contrast)] hover:opacity-90 transition"
              >
                <Store size={16} /> Visit Marketplace
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className={`rounded-2xl border px-4 py-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-[var(--app-border)] bg-[var(--app-surface-2)]'}`}>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--app-muted)]">OTP</p>
                <p className={`mt-1 text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{displayedOtp}</p>
              </div>
              <div className={`rounded-2xl border px-4 py-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-[var(--app-border)] bg-[var(--app-surface-2)]'}`}>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--app-muted)]">Date Paid</p>
                <p className={`mt-1 text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{displayedPaidDate}</p>
              </div>
              <div className={`rounded-2xl border px-4 py-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-[var(--app-border)] bg-[var(--app-surface-2)]'}`}>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--app-muted)]">From</p>
                <p className={`mt-1 text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{displayedFromDate}</p>
              </div>
              <div className={`rounded-2xl border px-4 py-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-[var(--app-border)] bg-[var(--app-surface-2)]'}`}>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--app-muted)]">Ending Date</p>
                <p className={`mt-1 text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{displayedEndingDate}</p>
              </div>
            </div>

            <div className={`mt-4 rounded-2xl border px-4 py-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-[var(--app-border)] bg-[var(--app-surface-2)]'}`}>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--app-muted)]">Account Status</p>
              <p className={`mt-1 text-lg font-black ${accessEnabled ? 'text-emerald-500' : isDark ? 'text-white' : 'text-slate-900'}`}>
                {accessEnabled ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div
              className={`rounded-[24px] border p-5 shadow-lg ${
                isDark
                  ? 'border-white/10 bg-white/5'
                  : 'border-[var(--app-border)] bg-white'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-[var(--app-muted)]">
                <Package size={16} /> Total Products
              </div>
              <p className={`mt-4 text-3xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{productsCount}</p>
              <p className={`mt-2 text-sm ${isDark ? 'text-emerald-100/70' : 'text-[var(--app-muted)]'}`}>
                Products uploaded by your account.
              </p>
            </div>

            <div
              className={`rounded-[24px] border p-5 shadow-lg ${
                isDark
                  ? 'border-white/10 bg-white/5'
                  : 'border-[var(--app-border)] bg-white'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-[var(--app-muted)]">
                <CalendarDays size={16} /> Total Announcements
              </div>
              <p className={`mt-4 text-3xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{announcementsCount}</p>
              <p className={`mt-2 text-sm ${isDark ? 'text-emerald-100/70' : 'text-[var(--app-muted)]'}`}>
                Live announcements currently visible on the system.
              </p>
            </div>
          </div>
        </div>

        <Announcements />
      </div>
    </div>
  );
};

export default CustomerDashboard;
