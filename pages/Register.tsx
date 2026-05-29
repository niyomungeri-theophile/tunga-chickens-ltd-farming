import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, Loader2, Mail, ShieldCheck, User, UserPlus, Lock } from 'lucide-react';
import { auth } from '../api';

const Register: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('farmer');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await auth.createUserWithEmailAndPassword(email, password, {
        fullName,
        role,
        photoURL: null,
      });

      if (result.success) {
        setSuccess('Account created successfully. You can now log in.');
        setTimeout(() => navigate('/login'), 900);
      } else {
        setError(result.message || 'Account creation failed.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected error while creating account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f3f4f6] dark:bg-slate-950 py-10 px-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-3xl shadow-2xl border border-white/70 dark:border-white/5 animate-fade-in">
        <div className="text-center mb-6">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
            <UserPlus size={30} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Create Account</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Register to access the Eco-Smart platform.</p>
        </div>

        <form className="space-y-4" onSubmit={handleRegister}>
          <FieldLabel text="Full Name" />
          <InputWithIcon icon={<User size={16} />} value={fullName} onChange={setFullName} placeholder="e.g. Jean Claude" />

          <FieldLabel text="Email" />
          <InputWithIcon icon={<Mail size={16} />} type="email" value={email} onChange={setEmail} placeholder="e.g. user@email.com" />

          <FieldLabel text="Role" />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="w-full bg-[#f0f4ff] dark:bg-slate-950 border border-slate-100 dark:border-white/5 rounded-2xl px-4 py-3 text-sm text-slate-700 dark:text-slate-200 outline-none"
          >
            <option value="farmer">Farmer</option>
            <option value="staff">Staff</option>
            <option value="operator">Operator</option>
          </select>

          <FieldLabel text="Password" />
          <InputWithIcon icon={<Lock size={16} />} type="password" value={password} onChange={setPassword} placeholder="Minimum 6 characters" />

          <FieldLabel text="Confirm Password" />
          <InputWithIcon icon={<Lock size={16} />} type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Repeat password" />

          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold">
              <ShieldCheck size={15} />
              <span>{success}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full flex items-center justify-center py-3.5 rounded-2xl text-white font-black uppercase tracking-widest text-xs transition-all ${
              isLoading ? 'bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isLoading ? (
              <><Loader2 className="animate-spin mr-2" size={16} /> Creating...</>
            ) : (
              <><UserPlus className="mr-2" size={16} /> Create Account</>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-5">
          Already have an account? <Link to="/login" className="text-emerald-600 font-bold hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
};

const FieldLabel = ({ text }: { text: string }) => (
  <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{text}</label>
);

const InputWithIcon = ({
  icon,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) => (
  <div className="relative">
    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>
    <input
      type={type}
      required
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full bg-[#f0f4ff] dark:bg-slate-950 border border-slate-100 dark:border-white/5 rounded-2xl pl-12 pr-4 py-3 text-sm text-slate-700 dark:text-slate-200 outline-none"
      placeholder={placeholder}
    />
  </div>
);

export default Register;
