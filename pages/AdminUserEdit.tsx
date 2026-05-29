import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, UserPlus, Shield } from 'lucide-react';
import { db } from '../api';

interface UserForm {
  fullName: string;
  email: string;
  role: string;
  status: string;
  contact: string;
  photoURL: string;
  farmSize: string;
  farmLocation: string;
  deviceSerialNumber: string;
}

const AdminUserEdit: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [form, setForm] = useState<UserForm>({
    fullName: '',
    email: '',
    role: 'farmer',
    status: 'active',
    contact: '',
    photoURL: '',
    farmSize: '',
    farmLocation: '',
    deviceSerialNumber: '',
  });

  const currentRole = String(localStorage.getItem('userRole') || '').toLowerCase();
  const canManageUser = (targetRole?: string) => {
    const role = String(targetRole || '').toLowerCase();
    if (currentRole === 'supervisor') return true;
    if (currentRole === 'admin') return role !== 'supervisor';
    return false;
  };

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      try {
        const user = await db.getUser(userId);
        setForm({
          fullName: user?.fullName || '',
          email: user?.email || '',
          role: user?.role || 'farmer',
          status: user?.status || 'active',
          contact: user?.contact || '',
          photoURL: user?.photoURL || '',
          farmSize: user?.farmSize || '',
          farmLocation: user?.farmLocation || '',
          deviceSerialNumber: user?.deviceSerialNumber || '',
        });
      } catch (e: any) {
        alert(e?.message || 'Failed to load account data');
        navigate('/users');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId, navigate]);

  const isFarmer = String(form.role).toLowerCase() === 'farmer';
  const canEditTarget = canManageUser(form.role);

  const setField = (key: keyof UserForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    if (!canEditTarget) {
      alert('You do not have permission to edit this account.');
      return;
    }

    if (!form.fullName.trim() || !form.email.trim()) {
      alert('Full name and email are required.');
      return;
    }

    if (isFarmer && (!form.farmSize.trim() || !form.farmLocation.trim())) {
      alert('Farmer account requires farm size and farm location.');
      return;
    }

    try {
      setSaving(true);
      await db.updateUser(userId, {
        fullName: form.fullName,
        email: form.email,
        role: form.role,
        status: form.status,
        contact: form.contact,
        photoURL: form.photoURL || null,
        farmSize: isFarmer ? form.farmSize : '',
        farmLocation: isFarmer ? form.farmLocation : '',
        deviceSerialNumber: isFarmer ? form.deviceSerialNumber : '',
      });
      alert('Account updated successfully.');
      navigate(`/users/${userId}`);
    } catch (e: any) {
      alert(e?.message || 'Failed to update account.');
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async () => {
    if (!userId) return;
    if (!canEditTarget) {
      alert('You do not have permission to reset this password.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      alert('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    try {
      setSavingPassword(true);
      await db.resetUserPassword(userId, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      alert('Password changed successfully.');
    } catch (e: any) {
      alert(e?.message || 'Failed to change password.');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="animate-spin text-emerald-500" size={34} />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-slate-50 dark:bg-slate-950">
      <button
        onClick={() => navigate('/users')}
        className="flex items-center gap-2 text-sm font-black text-slate-500 hover:text-emerald-500 transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Back to Users
      </button>

      <div className="max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-white/5 p-6 sm:p-8">
        {!canEditTarget && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 text-sm font-semibold">
            You do not have permission to edit this account.
          </div>
        )}
        <div className="flex items-center gap-3 mb-6 text-slate-800 dark:text-white">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400">
            <UserPlus size={20} />
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">Edit Registration Information</h1>
        </div>

        <form className="space-y-5" onSubmit={saveChanges}>
          <Field
            label="Assign Role (First)"
            as="select"
            value={form.role}
            onChange={(v) => setField('role', v)}
            required
          >
            <option value="farmer">Farmer (requires farm/device info)</option>
            <option value="customer">Customer (marketplace access)</option>
            {(currentRole === 'supervisor' || currentRole === 'admin') && <option value="admin">System Administrator</option>}
            {currentRole === 'supervisor' && <option value="supervisor">Project Supervisor</option>}
          </Field>

          <Field label="Status" as="select" value={form.status} onChange={(v) => setField('status', v)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Field>

          <Field label="Full Name" value={form.fullName} onChange={(v) => setField('fullName', v)} required />
          <Field label="Email Address" type="email" value={form.email} onChange={(v) => setField('email', v)} required />
          <Field label="Contact" value={form.contact} onChange={(v) => setField('contact', v)} />
          <Field label="Photo URL" value={form.photoURL} onChange={(v) => setField('photoURL', v)} />

          {isFarmer && (
            <>
              <Field label="Farm Size" value={form.farmSize} onChange={(v) => setField('farmSize', v)} required />
              <Field label="Farm Location" value={form.farmLocation} onChange={(v) => setField('farmLocation', v)} required />
              <Field label="Device Serial Number" value={form.deviceSerialNumber} onChange={(v) => setField('deviceSerialNumber', v)} />
            </>
          )}

          <button
            type="submit"
            disabled={saving || !canEditTarget}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-500 transition-all disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Registration Info'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/10">
          <div className="flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-200">
            <Shield size={16} className="text-amber-500" />
            <p className="text-xs font-black uppercase tracking-widest">Change Password</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="New Password" type="password" value={newPassword} onChange={setNewPassword} required />
            <Field label="Confirm New Password" type="password" value={confirmPassword} onChange={setConfirmPassword} required />
          </div>
          <button
            type="button"
            onClick={updatePassword}
            disabled={savingPassword || !canEditTarget}
            className="mt-4 px-5 py-2.5 bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-400 transition-all disabled:opacity-60"
          >
            {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  as?: 'input' | 'select';
  children?: React.ReactNode;
}> = ({ label, value, onChange, type = 'text', required = false, as = 'input', children }) => (
  <div className="space-y-2">
    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">
      {label}{required ? ' *' : ''}
    </label>
    {as === 'select' ? (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-500 transition-all"
      >
        {children}
      </select>
    ) : (
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-500 transition-all"
      />
    )}
  </div>
);

export default AdminUserEdit;
