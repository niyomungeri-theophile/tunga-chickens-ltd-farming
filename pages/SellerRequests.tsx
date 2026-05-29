import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Trash2 } from 'lucide-react';
import { db } from '../api';

const SellerRequests: React.FC = () => {
  const assetBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/api$/, '');
  const [applications, setApplications] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<Record<string, string>>({});

  const loadApplications = async (status?: string) => {
    setLoading(true);
    try {
      const result = await db.getSellerApplications(status);
      setApplications(Array.isArray(result?.applications) ? result.applications : []);
    } catch (error) {
      console.error('Failed to load applications', error);
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications(statusFilter);
  }, [statusFilter]);

  const handleApprove = async (id: string) => {
    if (!window.confirm('Approve this seller application?')) return;
    try {
      const result = await db.approveSellerApplication(id);
      const otpNote = result?.sellerOtp ? ` | Seller OTP: ${result.sellerOtp}` : '';
      const paidNote = result?.sellerPaidUntil ? ` | Valid until: ${String(result.sellerPaidUntil).split('T')[0]}` : '';
      if (result?.tempPassword) {
        setActionMessage((prev) => ({
          ...prev,
          [id]: `Approved. Email: ${result.email} | Temp password: ${result.tempPassword}${otpNote}${paidNote}`
        }));
      } else {
        setActionMessage((prev) => ({
          ...prev,
          [id]: `${result?.message || 'Approved. Existing account updated.'}${otpNote}${paidNote}`
        }));
      }
      await loadApplications(statusFilter);
    } catch (error: any) {
      setActionMessage((prev) => ({
        ...prev,
        [id]: error?.message || 'Approval failed'
      }));
    }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm('Reject this seller application?')) return;
    try {
      const result = await db.rejectSellerApplication(id);
      setActionMessage((prev) => ({
        ...prev,
        [id]: result?.message || 'Rejected.'
      }));
      await loadApplications(statusFilter);
    } catch (error: any) {
      setActionMessage((prev) => ({
        ...prev,
        [id]: error?.message || 'Rejection failed'
      }));
    }
  };

  const handleDeleteRejected = async (id: string) => {
    if (!window.confirm('Delete this rejected seller application?')) return;
    try {
      const result = await db.deleteSellerApplication(id);
      setActionMessage((prev) => ({
        ...prev,
        [id]: result?.message || 'Rejected application deleted.'
      }));
      await loadApplications(statusFilter);
    } catch (error: any) {
      setActionMessage((prev) => ({
        ...prev,
        [id]: error?.message || 'Delete failed'
      }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100">Seller Applications</h3>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Loading applications...
            </div>
          ) : applications.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-300">No applications found.</div>
          ) : (
            <div className="space-y-4">
              {applications.map((app) => (
                <div key={app.id} className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50 dark:bg-slate-800/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-100">{app.full_name}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{app.email}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{app.contact}</p>
                      {app.location && <p className="text-sm text-slate-600 dark:text-slate-300">Location: {app.location}</p>}
                      {app.farm_size && <p className="text-sm text-slate-600 dark:text-slate-300">Farm size: {app.farm_size}</p>}
                    </div>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      {app.status}
                    </div>
                  </div>
                  {app.reason && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{app.reason}</p>}

                  {app.payment_screenshot_url && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-300 mb-2">Payment screenshot</p>
                      <a
                        href={`${assetBase}${app.payment_screenshot_url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-emerald-600 hover:text-emerald-500"
                      >
                        View image
                      </a>
                      <img
                        src={`${assetBase}${app.payment_screenshot_url}`}
                        alt="Payment screenshot"
                        className="mt-2 w-full max-w-sm rounded-xl border border-slate-200 dark:border-white/10"
                      />
                    </div>
                  )}

                  {actionMessage[app.id] && (
                    <div className="mt-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
                      {actionMessage[app.id]}
                    </div>
                  )}

                  {app.status === 'pending' && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprove(app.id)}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                      >
                        <CheckCircle2 size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(app.id)}
                        className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-500"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  )}

                  {app.status === 'rejected' && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteRejected(app.id)}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-600"
                      >
                        <Trash2 size={14} /> Delete Rejected Request
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SellerRequests;
