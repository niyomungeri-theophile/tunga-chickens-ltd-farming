import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Search, Trash2, UserPlus, Filter, Camera, Loader2, Eye, 
  LayoutDashboard, Wallet, BrainCircuit, FileSignature, Pencil, CheckCircle, XCircle 
} from 'lucide-react';
import { db, subscribeToData } from '../api';
import { registerUser } from '../auth';
import { useTranslation } from '../contexts/LanguageContext';

interface User {
  id: string;
  fullName: string;
  email: string;
  contact: string;
  role: string;
  photoURL?: string;
  farmSize?: string;
  farmLocation?: string;
  deviceSerialNumber?: string;
  status: 'active' | 'inactive';
  createdAt?: string;
  sellerOtp?: string;
  sellerOtpExpiresAt?: string;
  sellerPaidUntil?: string;
  canSell?: boolean;
}

interface Application {
  id: string;
  fullName: string;
  email: string;
  contact: string;
  farmSize?: string;
  farmLocation?: string;
  reason?: string;
  paymentScreenshotUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

const UserManagement: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'applications' | 'users'>('users');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userList, setUserList] = useState<User[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'farmer' | 'admin' | 'supervisor'>('farmer');
  const [farmSize, setFarmSize] = useState('');
  const [farmLocation, setFarmLocation] = useState('');
  const [password, setPassword] = useState(''); // Optional - can be removed if using only OTP

  const currentRole = String(localStorage.getItem('userRole') || '').toLowerCase();

  const fetchApplications = useCallback(async () => {
    try {
      const result = await db.getSellerApplications('pending');
      if (!result?.success) {
        setApplications([]);
        return;
      }

      const list: Application[] = (result.applications || []).map((app: any) => ({
        id: app.id,
        fullName: app.full_name,
        email: app.email,
        contact: app.contact,
        farmSize: app.farm_size || undefined,
        farmLocation: app.location || undefined,
        reason: app.reason || undefined,
        paymentScreenshotUrl: app.payment_screenshot_url || undefined,
        status: app.status,
        createdAt: app.created_at,
      }));

      setApplications(list);
    } catch (error) {
      console.error('Failed to load applications:', error);
      setApplications([]);
    }
  }, []);

  // Subscribe to users
  useEffect(() => {
    const unsubscribeUsers = subscribeToData('users', (data) => {
      if (data) {
        const list: User[] = Object.entries(data).map(([id, val]: [string, any]) => ({
          id,
          ...val,
        }));
        setUserList(list);
      } else {
        setUserList([]);
      }
    }, 5000);

    fetchApplications();
    const appInterval = setInterval(fetchApplications, 5000);

    return () => {
      unsubscribeUsers();
      clearInterval(appInterval);
    };
  }, [fetchApplications]);

  const handlePhotoClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setPhotoPreview(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName || !contact) return;
    if (role === 'farmer' && (!farmSize || !farmLocation)) return;

    setLoading(true);

    const result = await registerUser(
      email,
      password || 'otp-login', // Password can be dummy if using OTP only
      fullName,
      role,
      photoPreview,
      contact,
      role === 'farmer' ? farmSize : '',
      role === 'farmer' ? farmLocation : ''
    );

    if (result.success) {
      alert(`New ${role} account created successfully!`);
      // Reset form
      setFullName(''); setContact(''); setEmail(''); 
      setFarmSize(''); setFarmLocation(''); setPassword(''); 
      setPhotoPreview(null); setRole('farmer');
    } else {
      alert(result.message || 'Registration failed');
    }
    setLoading(false);
  };

  const handleApproveApplication = async (app: Application) => {
    if (!window.confirm(`Approve ${app.fullName} as seller?`)) return;

    try {
      const result = await db.approveSellerApplication(app.id);
      const sellerOtp = result?.sellerOtp || 'n/a';
      const paidUntil = result?.sellerPaidUntil
        ? new Date(result.sellerPaidUntil).toLocaleDateString()
        : 'n/a';

      alert(`Application approved!\nOTP: ${sellerOtp}\nValid until: ${paidUntil}\nSent to: ${app.email}`);
      fetchApplications();
    } catch (error: any) {
      alert(error?.message || 'Failed to approve');
    }
  };

  const handleRejectApplication = async (id: string) => {
    if (window.confirm("Reject this application?")) {
      await db.rejectSellerApplication(id);
      fetchApplications();
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (window.confirm("Delete this user?")) {
      await db.deleteUser(id);
    }
  };

  const handleResetPassword = async (u: User) => {
    const newPassword = window.prompt(`Enter a new password for ${u.fullName}:`);
    if (!newPassword) return;
    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }
    try {
      await db.resetUserPassword(u.id, newPassword);
      alert('Password reset successfully.');
    } catch (error: any) {
      alert(error?.message || 'Failed to reset password');
    }
  };

  const handleStatusChange = async (u: User, status: 'active' | 'inactive') => {
    try {
      await db.updateUser(u.id, { status });
      setUserList(prev => prev.map(x => x.id === u.id ? { ...x, status } : x));
    } catch (error: any) {
      alert(error?.message || 'Failed to update status');
    }
  };

  const handleReactivateSeller = async (u: User) => {
    if (!window.confirm(`Reactivate seller subscription for ${u.fullName}? (Add 30 days)`)) return;

    try {
      const result = await db.reactivateSellerSubscription(u.id);
      const newDate = result?.sellerPaidUntil
        ? new Date(result.sellerPaidUntil).toLocaleDateString()
        : 'n/a';
      alert(`Seller subscription reactivated!\nNew expiry date: ${newDate}`);
      // Refresh user list to update seller_paid_until
      const unsubscribe = subscribeToData('users', (data) => {
        if (data) {
          const list: User[] = Object.entries(data).map(([id, val]: [string, any]) => ({
            id,
            ...val,
          }));
          setUserList(list);
        }
        unsubscribe();
      });
    } catch (error: any) {
      alert(error?.message || 'Failed to reactivate seller subscription');
    }
  };

  const canManageUser = (targetRole?: string) => {
    const tr = String(targetRole || '').toLowerCase();
    if (currentRole === 'supervisor') return true;
    if (currentRole === 'admin') return tr !== 'supervisor';
    return false;
  };

  const isFarmer = (r?: string) => String(r || '').toLowerCase() === 'farmer';

  const isSellerSubscriptionExpired = (u: User) => {
    if (!u.canSell || !u.sellerPaidUntil) return false;
    const now = new Date();
    const paidUntil = new Date(u.sellerPaidUntil);
    return paidUntil < now;
  };

  const filteredUsers = userList.filter(u => 
    u.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredApplications = applications.filter(a => 
    a.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const fmtDate = (value?: string | null) => 
    value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'n/a';

  const addDays = (value?: string | null, days: number = 30) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 animate-fade-in font-['Poppins',_sans-serif] bg-[#f9fafb] dark:bg-slate-950 min-h-screen transition-colors duration-500">
      {/* Header */}
      <div className="bg-indigo-600 text-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-xl mb-8 sm:mb-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10">
          <h1 className="text-3xl sm:text-5xl font-black mb-2 tracking-tighter">User & Application Management</h1>
          <p className="text-indigo-100 text-sm sm:text-lg font-medium opacity-80">
            Approve applications with 30-day OTP • Manage farmers, admins & supervisors
          </p>
        </div>
        <Users className="absolute right-6 sm:right-12 top-1/2 -translate-y-1/2 text-white/10 w-24 sm:w-48 h-24 sm:h-48" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/10 mb-8">
        <button
          onClick={() => setActiveTab('applications')}
          className={`px-8 py-4 font-bold text-lg transition-all ${activeTab === 'applications' 
            ? 'border-b-4 border-indigo-600 text-indigo-600' 
            : 'text-slate-500 dark:text-slate-400'}`}
        >
          Pending Applications
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-8 py-4 font-bold text-lg transition-all ${activeTab === 'users' 
            ? 'border-b-4 border-indigo-600 text-indigo-600' 
            : 'text-slate-500 dark:text-slate-400'}`}
        >
          Approved Users Directory
        </button>
      </div>

      {/* Add New User Form (for Admin creating direct accounts) */}
      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10">
          {/* Registration Form */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-[2rem] sm:rounded-[3rem] shadow-sm border border-slate-100 dark:border-white/5 p-6 sm:p-10 h-fit">
            <div className="flex items-center gap-4 mb-10 text-slate-800 dark:text-white font-black">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl text-indigo-600 dark:text-indigo-400">
                <UserPlus size={24} />
              </div>
              <h3 className="text-2xl tracking-tight">Create New Account</h3>
            </div>

            <form className="space-y-8" onSubmit={handleRegister}>
              {/* Photo Upload */}
              <div className="flex flex-col items-center">
                <div onClick={handlePhotoClick} className="group relative w-36 h-36 cursor-pointer transition-all active:scale-95">
                  <div className="absolute inset-0 rounded-full border-4 border-dashed border-slate-100 dark:border-slate-800 group-hover:border-indigo-500 transition-colors"></div>
                  <div className="absolute inset-2 rounded-full overflow-hidden bg-slate-50 dark:bg-slate-800 flex items-center justify-center border-4 border-white dark:border-slate-900 shadow-xl">
                    {photoPreview ? (
                      <img src={photoPreview} className="w-full h-full object-cover" alt="Preview" />
                    ) : (
                      <Camera size={48} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-400" />
                    )}
                  </div>
                  <div className="absolute bottom-1 right-1 bg-indigo-600 text-white p-3 rounded-full border-4 border-white dark:border-slate-900">
                    <Camera size={16} />
                  </div>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[11px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest ml-1 mb-2">Role</label>
                  <select 
                    value={role} 
                    onChange={(e) => setRole(e.target.value as 'farmer' | 'admin' | 'supervisor')}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-6 py-4 outline-none font-bold focus:border-indigo-500"
                  >
                    <option value="farmer">Farmer</option>
                    <option value="supervisor">Supervisor / Co-Admin</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest ml-1 mb-2">Full Name</label>
                  <input required type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. John Doe" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-indigo-500 font-bold" />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest ml-1 mb-2">Email Address</label>
                  <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@farm.rw" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-indigo-500 font-bold" />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest ml-1 mb-2">Contact</label>
                  <input required type="text" value={contact} onChange={e => setContact(e.target.value)} placeholder="+250 7XX XXX XXX" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-indigo-500 font-bold" />
                </div>

                {role === 'farmer' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest ml-1 mb-2">Farm Size</label>
                      <input required type="text" value={farmSize} onChange={e => setFarmSize(e.target.value)} placeholder="e.g. 5 hectares" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-indigo-500 font-bold" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest ml-1 mb-2">Farm Location</label>
                      <input required type="text" value={farmLocation} onChange={e => setFarmLocation(e.target.value)} placeholder="e.g. Musanze, Northern Province" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-indigo-500 font-bold" />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[11px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest ml-1 mb-2">Password (Optional - OTP preferred)</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-6 py-4 outline-none focus:border-indigo-500 font-bold" />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full px-8 py-5 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-500 shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-widest active:scale-[0.98]"
              >
                {loading ? <Loader2 className="animate-spin" /> : <UserPlus size={18} />} 
                Create {role} Account
              </button>
            </form>
          </div>

          {/* Users Table */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-[3rem] shadow-sm border border-slate-100 dark:border-white/5 overflow-hidden">
            <div className="p-10 border-b flex justify-between items-center">
              <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">
                <Users size={24} className="text-indigo-600" /> Approved Users Directory
              </h3>
              <div className="relative w-80">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search users..."
                  className="pl-14 pr-8 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-white/5 rounded-2xl w-full outline-none focus:border-indigo-600 text-sm font-bold"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-white/5 text-xs font-black text-slate-400 uppercase tracking-widest border-b">
                    <th className="px-10 py-6 text-left">User</th>
                    <th className="px-10 py-6 text-left">Role</th>
                    <th className="px-10 py-6 text-left">Status</th>
                    <th className="px-10 py-6 text-left">Seller OTP</th>
                    <th className="px-10 py-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredUsers.length === 0 ? (
                    <tr><td colSpan={5} className="px-10 py-12 text-center text-slate-400">No users found</td></tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-white/5">
                        <td className="px-10 py-6">
                          <div>
                            <p className="font-bold">{u.fullName}</p>
                            <p className="text-sm text-slate-400">{u.email} • {u.contact || 'n/a'}</p>
                          </div>
                        </td>
                        <td className="px-10 py-6">
                          <div className="flex flex-col gap-2">
                            <span className="px-5 py-2 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 rounded-2xl text-xs font-black uppercase w-fit">
                              {u.role}
                            </span>
                            {u.canSell && (
                              <span className="px-4 py-1 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded-xl text-[10px] font-black uppercase w-fit">
                                Seller enabled
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-6">
                          {canManageUser(u.role) ? (
                            <select
                              value={u.status}
                              onChange={(e) => handleStatusChange(u, e.target.value as 'active' | 'inactive')}
                              className="px-4 py-2 rounded-2xl text-xs font-black uppercase bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200"
                            >
                              <option value="active">ACTIVE</option>
                              <option value="inactive">INACTIVE</option>
                            </select>
                          ) : (
                            <span className={`px-4 py-2 rounded-2xl text-xs font-black uppercase ${u.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'}`}>
                              {u.status}
                            </span>
                          )}
                        </td>
                        <td className="px-10 py-6 text-sm">
                          {u.canSell && !['farmer', 'admin', 'supervisor'].includes(String(u.role || '').toLowerCase()) ? (
                            <>
                              <div className="text-slate-700 dark:text-slate-200 font-bold">{u.sellerOtp || 'n/a'}</div>
                              <div className="text-slate-400">Expires: {fmtDate(u.sellerOtpExpiresAt || addDays(u.createdAt, 30))}</div>
                            </>
                          ) : (
                            <div className="text-slate-400">n/a</div>
                          )}
                        </td>
                        <td className="px-10 py-6 text-right">
                          {canManageUser(u.role) ? (
                            <div className="flex gap-3 justify-end">
                              <button
                                onClick={() => navigate(`/users/${u.id}/edit`)}
                                className="flex items-center gap-2 px-5 py-3 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-2xl text-xs font-bold transition"
                              >
                                <Pencil size={16} /> Edit
                              </button>
                              {isFarmer(u.role) && (
                                <button
                                  onClick={() => {
                                    const params = new URLSearchParams({
                                      userId: u.id,
                                      userName: u.fullName || '',
                                      userEmail: u.email || '',
                                    });
                                    navigate(`/users/${u.id}/dashboard?${params.toString()}`);
                                  }}
                                  className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold transition"
                                >
                                  <LayoutDashboard size={16} /> View Farmer Dashboard
                                </button>
                              )}
                              {currentRole === 'admin' && isFarmer(u.role) && (
                                <button
                                  onClick={() => navigate(`/users/${u.id}/contracts`)}
                                  className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold transition"
                                >
                                  <FileSignature size={16} /> {t('create_contract')}
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold transition"
                              >
                                <Trash2 size={16} /> Delete
                              </button>
                              {['farmer', 'admin', 'supervisor'].includes(String(u.role || '').toLowerCase()) && (
                                <button
                                  onClick={() => handleResetPassword(u)}
                                  className="flex items-center gap-2 px-5 py-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-2xl text-xs font-bold transition"
                                >
                                  <Pencil size={16} /> Reset Password
                                </button>
                              )}
                              {isSellerSubscriptionExpired(u) && (
                                <button
                                  onClick={() => handleReactivateSeller(u)}
                                  className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold transition"
                                >
                                  <CheckCircle size={16} /> Reactivate Seller
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">No permission</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Applications Tab */}
      {activeTab === 'applications' && (
        <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-sm border border-slate-100 dark:border-white/5 overflow-hidden">
          <div className="p-10 border-b flex justify-between items-center">
            <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">
              <Filter size={24} className="text-indigo-600" /> Pending Applications
            </h3>
            <div className="relative w-80">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search applications..." 
                className="pl-14 pr-8 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-white/5 rounded-2xl w-full outline-none focus:border-indigo-600 text-sm font-bold"
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-white/5 text-xs font-black text-slate-400 uppercase tracking-widest border-b">
                  <th className="px-10 py-6 text-left">Applicant</th>
                  <th className="px-10 py-6 text-left">Role Requested</th>
                  <th className="px-10 py-6 text-left">Submitted</th>
                  <th className="px-10 py-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredApplications.length === 0 ? (
                  <tr><td colSpan={4} className="px-10 py-12 text-center text-slate-400">No pending applications</td></tr>
                ) : (
                  filteredApplications.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/80 dark:hover:bg-white/5">
                      <td className="px-10 py-6">
                        <div>
                          <p className="font-bold">{app.fullName}</p>
                          <p className="text-sm text-slate-400">{app.email} • {app.contact}</p>
                        </div>
                      </td>
                      <td className="px-10 py-6">
                        <span className="px-5 py-2 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 rounded-2xl text-xs font-black uppercase">
                          Seller
                        </span>
                      </td>
                      <td className="px-10 py-6 text-sm text-slate-400">{fmtDate(app.createdAt)}</td>
                      <td className="px-10 py-6 text-right">
                        <div className="flex gap-3 justify-end">
                          <button
                            onClick={() => handleApproveApplication(app)}
                            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-sm font-bold transition"
                          >
                            <CheckCircle size={18} /> Approve & Generate OTP
                          </button>
                          <button
                            onClick={() => handleRejectApplication(app.id)}
                            className="flex items-center gap-2 px-6 py-3 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-2xl text-sm font-bold transition"
                          >
                            <XCircle size={18} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;