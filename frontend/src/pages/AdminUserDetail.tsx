import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, Calendar, Wallet, Package, FileSignature,
  Loader2, AlertCircle, TrendingUp, LayoutDashboard, BrainCircuit
} from 'lucide-react';
import { db } from '../api';
import { useTheme } from '../contexts/ThemeContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface UserProfile {
  fullName: string;
  email: string;
  role: string;
  status?: string;
  photoURL?: string;
  canSell?: boolean;
  createdAt?: string;
  sellerOtp?: string | null;
  sellerOtpExpiresAt?: string | null;
  sellerPaidUntil?: string | null;
}

interface Transaction {
  id: string;
  amount: number;
  type: string;
}

const toArray = (value: any) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'n/a';

  const fmtIsoDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'n/a';

const AdminUserDetail: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [contracts, setContracts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [incubators, setIncubators] = useState<any[]>([]);
  const [productsCount, setProductsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUserData = async (showLoading = false) => {
    if (!userId) return;
    if (showLoading) setLoading(true);
    setError('');
    try {
      const profileRes = await db.getUser(userId);
      setProfile(profileRes);

      const role = String(profileRes?.role || '').toLowerCase();
      const isMarketplaceProfile = role === 'customer' || Boolean(profileRes?.canSell);
      if (isMarketplaceProfile) {
        setContracts([]);
        setTransactions([]);
        setIncubators([]);

        const response = await fetch(`${API_BASE_URL}/products`);
        const data = await parseApiResponse(response);
        const products = Array.isArray(data?.products) ? data.products : [];
        const owned = products.filter((product: any) => String(product.uploaded_by || '') === String(userId));
        if (owned.length > 0) {
          setProductsCount(owned.length);
        } else {
          const nameKey = String(profileRes?.fullName || '').trim().toLowerCase();
          const emailKey = String(profileRes?.email || '').trim().toLowerCase();
          const fallback = products.filter((product: any) => {
            const seller = String(product.seller_name || '').trim().toLowerCase();
            const contact = String(product.contact || '').trim().toLowerCase();
            return (nameKey && seller.includes(nameKey)) || (emailKey && (contact.includes(emailKey) || seller.includes(emailKey)));
          });
          setProductsCount(fallback.length);
        }
      } else {
        const [contractsRes, txRes, incRes] = await Promise.allSettled([
          db.getContractsForUser(userId),
          db.getTransactionsForUser(userId),
          db.getIncubatorsForUser(userId),
        ]);
        if (contractsRes.status === 'fulfilled') setContracts(toArray(contractsRes.value?.contracts ?? contractsRes.value));
        if (txRes.status === 'fulfilled') setTransactions(toArray(txRes.value?.transactions ?? txRes.value));
        if (incRes.status === 'fulfilled') setIncubators(toArray(incRes.value?.incubators ?? incRes.value));
      }
    } catch (e: any) {
      // Show detailed error info to help debug admin access problems
      let message = e?.message || 'Failed to load user data';
      try {
        const token = localStorage.getItem('authToken') || '';
        const resp = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' }
        });
        const text = await resp.text();
        message += ` (status: ${resp.status})`;
        if (text) message += ` body: ${text}`;
      } catch (fetchErr) {
        message += ` (diagnostic fetch failed: ${String(fetchErr?.message || fetchErr)})`;
      }

      setError(message);
    }
    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    loadUserData(true);
    const interval = setInterval(() => loadUserData(false), 5000);
    return () => clearInterval(interval);
  }, [userId]);

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors duration-500 ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-emerald-500" size={36} />
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Loading user data...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors duration-500 ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="flex flex-col items-center gap-4 text-center max-w-xs">
          <AlertCircle className="text-rose-500" size={40} />
          <p className="text-base font-black text-slate-700 dark:text-slate-200">User not found</p>
          <p className="text-sm text-slate-400">{error}</p>
          <button onClick={() => navigate('/users')} className="mt-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl text-sm font-black hover:bg-emerald-400 transition-all">
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  const totalRevenue = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const netProfit = totalRevenue - totalExpense;
  const activeContracts = contracts.filter((c: any) => c.status === 'active').length;
  const isFarmerProfile = String(profile.role || '').toLowerCase() === 'farmer';
  const isCustomerProfile = String(profile.role || '').toLowerCase() === 'customer' || Boolean(profile.canSell);

  return (
    <div className={`min-h-screen p-4 sm:p-6 md:p-10 animate-fade-in transition-colors duration-500 ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>

      <button
        onClick={() => navigate('/users')}
        className="flex items-center gap-2 text-sm font-black text-slate-500 hover:text-emerald-500 transition-colors mb-6 group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        Back to User Management
      </button>

      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-8 mb-6 text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-24 -mt-24 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-xl">
            {profile.photoURL ? (
              <img src={profile.photoURL} className="w-full h-full object-cover" alt={profile.fullName} />
            ) : (
              <span className="text-3xl font-black">{profile.fullName?.charAt(0)?.toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{profile.fullName}</h1>
              <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/20 border border-white/30">
                {profile.role}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-sm text-white/80 font-semibold">
              <span className="flex items-center gap-1.5"><Mail size={14} />{profile.email}</span>
              {profile.createdAt && (
                <span className="flex items-center gap-1.5"><Calendar size={14} />Joined {fmtDate(profile.createdAt)}</span>
              )}
            </div>
          </div>
        </div>

        <div className={`grid gap-4 mt-8 ${isCustomerProfile ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {isCustomerProfile ? (
            <div className="bg-white/10 border border-white/20 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-white/70 text-[11px] font-black uppercase tracking-widest mb-2">
                <Package size={16} />Products
              </div>
              <p className="text-xl font-black text-white">{productsCount}</p>
              <p className="text-[11px] text-white/60 font-semibold mt-0.5">Uploaded by this account</p>
            </div>
          ) : (
            [
              { label: 'Contracts', value: contracts.length, sub: `${activeContracts} active`, icon: <FileSignature size={16} /> },
              { label: 'Transactions', value: transactions.length, sub: `${fmt(netProfit)} net`, icon: <Wallet size={16} /> },
              { label: 'Incubators', value: incubators.length, sub: `${incubators.filter((i: any) => i.status === 'online').length} online`, icon: <Package size={16} /> },
              { label: 'Revenue', value: fmt(totalRevenue), sub: `${fmt(totalExpense)} expense`, icon: <TrendingUp size={16} /> },
            ].map(({ label, value, sub, icon }) => (
              <div key={label} className="bg-white/10 border border-white/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-white/70 text-[11px] font-black uppercase tracking-widest mb-2">{icon}{label}</div>
                <p className="text-xl font-black text-white">{value}</p>
                <p className="text-[11px] text-white/60 font-semibold mt-0.5">{sub}</p>
              </div>
            ))
          )}

          {(profile.sellerOtp || profile.sellerPaidUntil) && (
            <div className="bg-white/10 border border-white/20 rounded-2xl p-4">
              <div className="text-white/70 text-[11px] font-black uppercase tracking-widest mb-2">Seller Access</div>
              {profile.sellerOtp && (
                <p className="text-sm font-semibold text-white">OTP: {profile.sellerOtp}</p>
              )}
              {profile.createdAt && (
                <p className="text-sm font-semibold text-white">Start date: {fmtIsoDate(profile.createdAt)}</p>
              )}
              {profile.sellerPaidUntil && (
                <p className="text-sm font-semibold text-white">Valid until: {fmtIsoDate(profile.sellerPaidUntil)}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {isFarmerProfile && (
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => navigate(`/users/${userId}/dashboard`)}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-2xl transition-all text-xs font-black uppercase tracking-widest hover:bg-blue-500 shadow-lg shadow-blue-500/20"
          >
            <LayoutDashboard size={16} />
            Dashboard
          </button>
          <button
            onClick={() => navigate(`/users/${userId}/financial-records`)}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 dark:bg-white/10 text-white rounded-2xl transition-all text-xs font-black uppercase tracking-widest hover:bg-emerald-600"
          >
            <Wallet size={16} />
            Financial
          </button>
          <button
            onClick={() => navigate(`/users/${userId}/predictions`)}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 dark:bg-white/10 text-white rounded-2xl transition-all text-xs font-black uppercase tracking-widest hover:bg-indigo-600"
          >
            <BrainCircuit size={16} />
            Predictions
          </button>
        </div>
      )}

    </div>
  );
};

export default AdminUserDetail;