import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Phone, Loader2, CheckCircle2 } from 'lucide-react';
import { parseApiResponse } from '../utils/parseApiResponse';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const CustomerRegister: React.FC = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register-customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          contact: contact.trim(),
          password,
        }),
      });
      const result = await parseApiResponse(response);
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Registration failed');
      }
      setSuccess(true);
      setFullName('');
      setEmail('');
      setContact('');
      setPassword('');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 p-8 shadow-2xl border border-white/5">
        <h1 className="text-2xl font-black text-white mb-2">Create Customer Account</h1>
        <p className="text-sm text-slate-400 mb-6">Marketplace-only access</p>

        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-600/20 px-4 py-3 text-emerald-200">
            <CheckCircle2 size={16} />
            Customer account created. Redirecting to login...
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl bg-rose-600/20 px-4 py-3 text-rose-200">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              className="w-full rounded-xl bg-slate-800 px-10 py-3 text-slate-100"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              className="w-full rounded-xl bg-slate-800 px-10 py-3 text-slate-100"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              className="w-full rounded-xl bg-slate-800 px-10 py-3 text-slate-100"
              placeholder="Contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              className="w-full rounded-xl bg-slate-800 px-10 py-3 text-slate-100"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-3 font-black text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Creating...</span>
            ) : (
              'Create Account'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CustomerRegister;
