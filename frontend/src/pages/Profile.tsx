import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UserCircle, Shield, Eye, EyeOff, Save, Loader2, CheckCircle, AlertCircle, Lock
} from 'lucide-react';
import { auth, db } from '../api';

interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  role: string;
  contact?: string;
  farmSize?: string;
  farmLocation?: string;
  photoURL?: string;
  createdAt?: string;
}

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // Message state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch user profile on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const result = await auth.getCurrentUser();
        if (result) {
          setProfile(result);
        } else {
          navigate('/login', { replace: true });
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'All password fields are required.' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    if (currentPassword === newPassword) {
      setMessage({ type: 'error', text: 'New password must be different from current password.' });
      return;
    }

    setUpdating(true);
    try {
      const result = await auth.changePassword(currentPassword, newPassword, confirmPassword);
      if (result?.success) {
        setMessage({ type: 'success', text: 'Password changed successfully!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: result?.message || 'Failed to change password.' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Failed to change password. Please try again.' });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-indigo-600" size={48} />
          <p className="text-slate-600 dark:text-slate-400 font-medium">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 animate-fade-in font-['Poppins',_sans-serif] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 min-h-screen transition-colors duration-500">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 dark:from-indigo-700 dark:to-indigo-800 text-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-xl mb-8 sm:mb-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt={profile.fullName} className="w-full h-full rounded-full object-cover" />
              ) : (
                <UserCircle size={40} />
              )}
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{profile?.fullName}</h1>
              <p className="text-indigo-100 text-sm font-medium">{profile?.email}</p>
            </div>
          </div>
          <p className="text-indigo-100 text-sm sm:text-base font-medium opacity-90">
            Manage your account settings and security
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-8">
        {/* Profile Information Card */}
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-sm border border-slate-100 dark:border-white/5 overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-slate-100 dark:border-white/5 flex items-center gap-3 font-bold text-slate-800 dark:text-slate-100">
            <UserCircle className="text-indigo-600" size={24} />
            <h3 className="text-xl sm:text-2xl">Profile Information</h3>
          </div>
          <div className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Full Name</label>
                <input 
                  type="text" 
                  value={profile?.fullName || ''} 
                  disabled
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-4 py-3 outline-none font-medium text-slate-700 dark:text-slate-300 cursor-not-allowed opacity-75" 
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Email Address</label>
                <input 
                  type="email" 
                  value={profile?.email || ''} 
                  disabled
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-4 py-3 outline-none font-medium text-slate-700 dark:text-slate-300 cursor-not-allowed opacity-75" 
                />
              </div>
              {profile?.contact && (
                <div>
                  <label className="block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Contact</label>
                  <input 
                    type="text" 
                    value={profile.contact} 
                    disabled
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-4 py-3 outline-none font-medium text-slate-700 dark:text-slate-300 cursor-not-allowed opacity-75" 
                  />
                </div>
              )}
              <div>
                <label className="block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Role</label>
                <input 
                  type="text" 
                  value={profile?.role.charAt(0).toUpperCase() + profile?.role.slice(1) || ''} 
                  disabled
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-4 py-3 outline-none font-medium text-slate-700 dark:text-slate-300 cursor-not-allowed opacity-75" 
                />
              </div>
              {profile?.farmSize && (
                <div>
                  <label className="block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Farm Size</label>
                  <input 
                    type="text" 
                    value={profile.farmSize} 
                    disabled
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-4 py-3 outline-none font-medium text-slate-700 dark:text-slate-300 cursor-not-allowed opacity-75" 
                  />
                </div>
              )}
              {profile?.farmLocation && (
                <div>
                  <label className="block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Farm Location</label>
                  <input 
                    type="text" 
                    value={profile.farmLocation} 
                    disabled
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-4 py-3 outline-none font-medium text-slate-700 dark:text-slate-300 cursor-not-allowed opacity-75" 
                  />
                </div>
              )}
              {profile?.createdAt && (
                <div>
                  <label className="block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Account Created</label>
                  <input 
                    type="text" 
                    value={new Date(profile.createdAt).toLocaleDateString()} 
                    disabled
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-4 py-3 outline-none font-medium text-slate-700 dark:text-slate-300 cursor-not-allowed opacity-75" 
                  />
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
              <Lock size={14} className="inline mr-1" />
              Profile information is read-only. Contact admin to update.
            </p>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-sm border border-slate-100 dark:border-white/5 overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-slate-100 dark:border-white/5 flex items-center gap-3 font-bold text-slate-800 dark:text-slate-100">
            <Shield className="text-indigo-600" size={24} />
            <h3 className="text-xl sm:text-2xl">Change Password</h3>
          </div>
          
          <form onSubmit={handleChangePassword} className="p-6 sm:p-8 space-y-6">
            {/* Message Display */}
            {message && (
              <div className={`flex items-center gap-3 p-4 rounded-2xl ${
                message.type === 'success' 
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20' 
                  : 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20'
              }`}>
                {message.type === 'success' ? (
                  <CheckCircle className="text-emerald-600 dark:text-emerald-400" size={20} />
                ) : (
                  <AlertCircle className="text-rose-600 dark:text-rose-400" size={20} />
                )}
                <p className={`text-sm font-medium ${
                  message.type === 'success' 
                    ? 'text-emerald-700 dark:text-emerald-300' 
                    : 'text-rose-700 dark:text-rose-300'
                }`}>
                  {message.text}
                </p>
              </div>
            )}

            {/* Current Password */}
            <div>
              <label className="block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Current Password</label>
              <div className="relative">
                <input 
                  type={showCurrentPass ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-4 py-4 pr-12 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors font-medium text-slate-700 dark:text-slate-300"
                />
                <button 
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  {showCurrentPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">New Password</label>
              <div className="relative">
                <input 
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-4 py-4 pr-12 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors font-medium text-slate-700 dark:text-slate-300"
                />
                <button 
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  {showNewPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 ml-1 font-medium">
                ✓ At least 6 characters
              </p>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Confirm New Password</label>
              <div className="relative">
                <input 
                  type={showConfirmPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl px-4 py-4 pr-12 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors font-medium text-slate-700 dark:text-slate-300"
                />
                <button 
                  type="button"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  {showConfirmPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
              <button 
                type="submit"
                disabled={updating}
                className="flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98] uppercase tracking-widest text-sm"
              >
                {updating ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Security Tips */}
        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-[2rem] p-6 sm:p-8">
          <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Shield size={20} className="text-blue-600 dark:text-blue-400" />
            Security Tips
          </h4>
          <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-2 ml-8 list-disc">
            <li>Use a strong password with letters, numbers, and symbols</li>
            <li>Never share your password with anyone</li>
            <li>Change your password regularly for better security</li>
            <li>Use unique passwords for different accounts</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Profile;
