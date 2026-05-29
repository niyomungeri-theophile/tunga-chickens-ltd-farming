import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, User, MapPin, ClipboardList, Loader2, CheckCircle2 } from 'lucide-react';
import { db } from '../api';

const SellerApplication: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    contact: '',
    location: '',
    farmSize: '',
    reason: ''
  });
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      if (!paymentScreenshot) {
        setError('Please upload a payment screenshot.');
        setLoading(false);
        return;
      }

      const formData = new FormData();
      formData.append('fullName', form.fullName.trim());
      formData.append('email', form.email.trim().toLowerCase());
      formData.append('contact', form.contact.trim());
      formData.append('location', form.location.trim());
      formData.append('farmSize', form.farmSize.trim());
      formData.append('reason', form.reason.trim());
      formData.append('paymentScreenshot', paymentScreenshot);

      await db.submitSellerApplicationWithProof(formData);
      setSuccess(true);
      setForm({ fullName: '', email: '', contact: '', location: '', farmSize: '', reason: '' });
      setPaymentScreenshot(null);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: any) {
      setError(err?.message || 'Application failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 p-8 shadow-2xl border border-white/5">
        <h1 className="text-2xl font-black text-white mb-2">Apply to Become a Seller</h1>
        <p className="text-sm text-slate-400 mb-6">Submit your details. Admin will review and send login credentials once approved.</p>

        <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-emerald-100">
          <p className="text-sm font-semibold">Payment Info</p>
          <p className="text-sm">Tel: +250785133511</p>
          <p className="text-sm">Momo pay: 511358</p>
          <p className="text-xs text-emerald-200/80 mt-2">Upload the payment screenshot below.</p>
        </div>

        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-600/20 px-4 py-3 text-emerald-200">
            <CheckCircle2 size={16} /> Application submitted. Redirecting to login...
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
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              required
            />
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              className="w-full rounded-xl bg-slate-800 px-10 py-3 text-slate-100"
              placeholder="Email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              className="w-full rounded-xl bg-slate-800 px-10 py-3 text-slate-100"
              placeholder="Contact"
              name="contact"
              value={form.contact}
              onChange={handleChange}
              required
            />
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              className="w-full rounded-xl bg-slate-800 px-10 py-3 text-slate-100"
              placeholder="Location"
              name="location"
              value={form.location}
              onChange={handleChange}
            />
          </div>
          <div className="relative">
            <ClipboardList className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              className="w-full rounded-xl bg-slate-800 px-10 py-3 text-slate-100"
              placeholder="Farm size (optional)"
              name="farmSize"
              value={form.farmSize}
              onChange={handleChange}
            />
          </div>
          <div className="relative">
            <textarea
              className="w-full rounded-xl bg-slate-800 px-4 py-3 text-slate-100 min-h-[110px]"
              placeholder="Tell us about what you want to sell"
              name="reason"
              value={form.reason}
              onChange={handleChange}
            />
          </div>
          <div className="relative">
            <label className="block text-sm text-slate-300 mb-2">Payment screenshot</label>
            <input
              className="w-full rounded-xl bg-slate-800 px-4 py-3 text-slate-100"
              type="file"
              accept="image/*"
              onChange={(e) => setPaymentScreenshot(e.target.files?.[0] || null)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-3 font-black text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Submitting...</span>
            ) : (
              'Submit Application'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SellerApplication;
