import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileSignature, Plus, Edit2, Trash2, CheckCircle2, XCircle,
  Loader2, Eye, X, ChevronDown, ChevronUp, Copy, ClipboardCheck,
  UserCheck, ShieldAlert, User
} from 'lucide-react';
import { db } from '../api';
import { useTranslation } from '../contexts/LanguageContext';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SystemUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  contact?: string | null;
  farmSize?: string | null;
  farmLocation?: string | null;
  deviceSerialNumber?: string | null;
}

interface Contract {
  id: string;
  contract_number: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  buyer_address: string | null;
  system_name: string;
  modules_included: string | null;
  hardware: string | null;
  quantity: number;
  total_price_rwf: number;
  deposit_rwf: number;
  balance_rwf: number;
  payment_method: string;
  payment_status: string;
  delivery_date: string | null;
  warranty_months: number;
  installation_address: string | null;
  notes: string | null;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  buyer_user_id: string | null;
  admin_id: string;
  // Joined from backend SELECT
  buyer_user_name: string | null;
  buyer_user_email: string | null;
  buyer_user_role: string | null;
  buyer_user_contact?: string | null;
  buyer_user_farm_size?: string | null;
  buyer_user_farm_location?: string | null;
  buyer_user_device_serial_number?: string | null;
  admin_name: string | null;
  admin_email: string | null;
  created_at: string;
  updated_at: string;
}

const EMPTY_FORM = {
  buyer_name: '',
  buyer_email: '',
  buyer_phone: '',
  buyer_address: '',
  system_name: 'Eco-Smart Poultry Care System',
  modules_included: 'Sensor Monitoring, AI Predictions, Incubator Control, Financial Records',
  hardware: 'Raspberry Pi 5, Temperature/Humidity Sensor (DHT22), Light Sensor (BH1750), Gas Sensor (MQ-135), pH Sensor, Solar Panel 200W',
  quantity: 1,
  total_price_rwf: '',
  deposit_rwf: '',
  payment_method: 'bank_transfer',
  payment_status: 'pending',
  delivery_date: '',
  warranty_months: 12,
  installation_address: '',
  notes: '',
  status: 'draft',
  buyer_user_id: ''
};

// ─── Helper ───────────────────────────────────────────────────────────────────
function fmtRwf(val: number | string) {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(n);
}

function statusBadge(status: string) {
  const MAP: Record<string, string> = {
    draft:     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    active:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    cancelled: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400',
  };
  return MAP[status] || MAP.draft;
}

function payBadge(ps: string) {
  const MAP: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    partial: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400',
    paid:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  };
  return MAP[ps] || MAP.pending;
}

const ContractDocument: React.FC<{ contract: Contract }> = ({ contract }) => {
  const buyerPhone = contract.buyer_phone || contract.buyer_user_contact || null;
  const buyerAddress = contract.buyer_address || contract.buyer_user_farm_location || null;
  const buyerFarmSize = contract.buyer_user_farm_size || null;
  const buyerSerial = contract.buyer_user_device_serial_number || null;
  const delivery = contract.delivery_date ? new Date(contract.delivery_date).toLocaleDateString('en-GB') : '—';
  const created = contract.created_at ? new Date(contract.created_at).toLocaleDateString('en-GB') : '—';

  const companyName = 'Eco-Smart Poultry Care System';
  const sellerName = contract.admin_name || '________________';
  const sellerEmail = contract.admin_email || '________________';

  return (
    <div className="contract-print-sheet bg-white text-slate-900 dark:bg-slate-900 dark:text-white border border-slate-200 rounded-2xl p-6 sm:p-10">
      {/* Header */}
      <div className="text-center">
        <div className="h-[2px] bg-slate-200 w-full" />
        <h1 className="mt-3 text-sm sm:text-base font-black uppercase tracking-widest">System Sales and Usage Agreement</h1>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">
          Eco-Smart Poultry Care System for Efficient Environmental Monitoring and Farm Management
        </p>
        <div className="mt-2 flex items-center justify-center gap-3 text-[11px] text-slate-500 font-bold">
          <span className="uppercase tracking-widest">Contract No:</span>
          <span className="tracking-widest">{contract.contract_number}</span>
        </div>
        <div className="mt-3 h-[2px] bg-slate-200 w-full" />
      </div>

      {/* Seller/Buyer cards */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <FileSignature size={18} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Seller Details</p>
              <p className="text-xs text-slate-400 dark:text-white font-semibold">Agreement issuer information</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <DocRow label="Company" value={companyName} />
            <DocRow label="Representative" value={sellerName} />
            <DocRow label="Email" value={sellerEmail} />
            <DocRow label="Location" value="Kigali, Rwanda" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <User size={18} className="text-slate-700" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Buyer Details</p>
              <p className="text-xs text-slate-400 dark:text-white font-semibold">Auto-filled from account record</p>
            </div>
          </div>
            <div className="mt-4 space-y-2">
            <DocRow label="Name" value={contract.buyer_name} />
            <DocRow label="Email" value={contract.buyer_email} />
            <DocRow label="Contact" value={buyerPhone} />
            <DocRow label="Address" value={buyerAddress} />
            <DocRow label="Farm Size" value={buyerFarmSize} />
            <DocRow label="Device Serial" value={buyerSerial} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
        {/* Left side */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">System Specifications</p>
            <div className="mt-3 space-y-2">
              <DocRow label="System" value={contract.system_name} />
              <DocRow label="Quantity" value={String(contract.quantity)} />
              <DocRow label="Delivery Date" value={delivery} />
              <DocRow label="Warranty" value={`${contract.warranty_months} months`} />
              <DocRow label="Installation" value={contract.installation_address || contract.buyer_user_farm_location || '—'} />
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Modules Included</p>
              <div className="mt-2 h-px bg-slate-200" />
              <p className="mt-3 text-sm text-slate-700 dark:text-white leading-relaxed whitespace-pre-wrap">
                {contract.modules_included || '—'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-white">Legal Conditions</p>
            <div className="mt-2 h-px bg-slate-200" />
            <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-white list-disc pl-5">
              <li>System is delivered as described and configured for poultry monitoring and farm management.</li>
              <li>Buyer agrees not to misuse, tamper, or reverse-engineer system components.</li>
              <li>Seller is not responsible for losses caused by misuse, unsafe wiring, or poor connectivity/power conditions.</li>
            </ul>
          </div>
        </div>

        {/* Right side */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Service Agreement</p>
            <div className="mt-2 h-px bg-slate-200" />
            <ul className="mt-3 space-y-2 text-sm text-slate-700 list-disc pl-5">
              <li>Warranty is valid for {contract.warranty_months} months from delivery/installation date.</li>
              <li>Buyer keeps the device powered and connected for accurate monitoring and reporting.</li>
              <li>Seller provides setup support and basic training at installation (where applicable).</li>
              <li>Remote support depends on internet availability at the buyer location.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Installment Registry</p>
            <div className="mt-2 h-px bg-slate-200" />
            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white">Total (RWF)</p>
                  <p className="mt-1 text-sm font-black text-slate-800">{fmtRwf(contract.total_price_rwf)}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Deposit</p>
                  <p className="mt-1 text-sm font-black text-emerald-700">{fmtRwf(contract.deposit_rwf)}</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Remaining</p>
                  <p className="mt-1 text-sm font-black text-amber-800">{fmtRwf(contract.balance_rwf)}</p>
                </div>
              </div>

              <div className="mt-1 rounded-xl bg-white border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-bold text-slate-600">
                    Method: <span className="uppercase">{contract.payment_method.replace(/_/g, ' ')}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-black uppercase text-[10px] ${payBadge(contract.payment_status)}`}>
                    {contract.payment_status}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 text-[11px] text-slate-500 font-semibold">
              <div className="flex items-center justify-between gap-3">
                <span>Created: {created}</span>
                <span className="uppercase">Status: {contract.status}</span>
              </div>
            </div>
          </div>

          {contract.notes && (
            <div className="rounded-2xl border border-slate-200 p-5">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-white">Additional Notes</p>
              <div className="mt-2 h-px bg-slate-200" />
              <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-white whitespace-pre-wrap">{contract.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Signatures */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-2">
          <div className="h-px bg-slate-300" />
          <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest">Seller Signature</p>
          <p className="text-sm text-slate-700 dark:text-white font-semibold">{sellerName}</p>
        </div>
        <div className="space-y-2">
          <div className="h-px bg-slate-300" />
          <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest">Buyer Signature</p>
          <p className="text-sm text-slate-700 dark:text-white font-semibold">{contract.buyer_name}</p>
        </div>
      </div>
    </div>
  );
};

// ─── PrintView ────────────────────────────────────────────────────────────────
const PrintView: React.FC<{ contract: Contract; onClose: () => void }> = ({ contract, onClose }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    const text = `
SALES & SERVICE AGREEMENT
${contract.contract_number}

System: ${contract.system_name}
Buyer: ${contract.buyer_name}
Email: ${contract.buyer_email}
Phone: ${contract.buyer_phone || '—'}

Hardware: ${contract.hardware || '—'}
Modules: ${contract.modules_included || '—'}
Quantity: ${contract.quantity}

Total Price: ${fmtRwf(contract.total_price_rwf)}
Deposit: ${fmtRwf(contract.deposit_rwf)}
Balance: ${fmtRwf(contract.balance_rwf)}
Payment: ${contract.payment_method.replace('_', ' ')} (${contract.payment_status})

Delivery Date: ${contract.delivery_date || '—'}
Warranty: ${contract.warranty_months} months
Installation Address: ${contract.installation_address || '—'}

Notes: ${contract.notes || '—'}
Status: ${contract.status.toUpperCase()}
Created: ${new Date(contract.created_at).toLocaleDateString()}
    `.trim();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="contract-print-overlay fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="contract-print-card bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-3xl w-full p-6 sm:p-8 space-y-6 relative">
        <button onClick={onClose} className="contract-print-close absolute top-5 right-5 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10">
          <X size={20} className="text-slate-500" />
        </button>

        <div style={{ pageBreakAfter: 'always' }}>
          <ContractDocument contract={contract} />
        </div>

        <ConfirmationLetter contract={contract} />

        <div className="contract-print-actions flex gap-3 justify-end pt-2">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white font-bold text-xs hover:bg-slate-200 dark:hover:bg-white/20 transition-all"
          >
            {copied ? <ClipboardCheck size={16} className="text-emerald-500" /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 transition-all"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
};

const ConfirmationLetter: React.FC<{ contract: Contract }> = ({ contract }) => {
  const { t } = useTranslation();
  const date = contract.created_at ? new Date(contract.created_at).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
  return (
    <div className="contract-confirmation-sheet bg-white text-slate-900 dark:bg-slate-900 dark:text-white border border-slate-200 rounded-2xl p-6 sm:p-10 mt-6">
      <div className="text-center mb-6">
        <h2 className="text-lg font-black">{t('contract_confirmation_title')}</h2>
        <p className="text-sm text-slate-500 mt-1">{t('contract_confirmation_subtitle')} — {contract.contract_number}</p>
      </div>

      <div className="space-y-4 text-sm text-slate-700 dark:text-white">
        <p>{t('contract_to')}: <strong>{contract.buyer_name}</strong> ({contract.buyer_email})</p>
        <p>{t('contract_date')}: <strong>{date}</strong></p>
        <p>
          {t('contract_confirmation_statement')} <strong>{contract.buyer_name}</strong> ({t('contract_buyer_label')}) {t('contract_confirmation_identifier')} <strong>{contract.contract_number}</strong>.
        </p>
        <p>
          {t('contract_system')}: <strong>{contract.system_name}</strong> — {t('contract_quantity')}: <strong>{contract.quantity}</strong>. {t('contract_total_price')}: <strong>{fmtRwf(contract.total_price_rwf)}</strong>.
        </p>
        <p>
          {t('contract_deposit_received')}: <strong>{fmtRwf(contract.deposit_rwf)}</strong>. {t('contract_remaining_balance')}: <strong>{fmtRwf(contract.balance_rwf)}</strong>.
        </p>
        <p>
          {t('contract_delivery_address')}: <strong>{contract.installation_address || contract.buyer_user_farm_location || '—'}</strong>.
        </p>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="h-px bg-slate-300" />
            <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest">Seller Signature</p>
            <p className="text-sm text-slate-700 font-semibold">{contract.admin_name || '________________'}</p>
          </div>
          <div className="space-y-2">
            <div className="h-px bg-slate-300" />
            <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest">Buyer Signature</p>
            <p className="text-sm text-slate-700 font-semibold">{contract.buyer_name || '________________'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const DocRow: React.FC<{ label: string; value: string | null | undefined }> = ({ label, value }) => (
  <div className="grid grid-cols-[140px_1fr] gap-3 items-start">
    <div className="text-slate-500 font-bold text-[12px] dark:text-white">{label}</div>
      <div className="text-slate-800 text-[12px] dark:text-white break-words">{value && String(value).trim() ? value : '—'}</div>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white">{title}</h4>
    <div className="space-y-1">{children}</div>
  </div>
);

const Field: React.FC<{ label: string; value: string | null | undefined }> = ({ label, value }) => (
  <div className="flex gap-2 text-sm">
    <span className="text-slate-400 font-semibold min-w-[80px] shrink-0 dark:text-white">{label}:</span>
    <span className="text-slate-700 dark:text-white break-all">{value || '—'}</span>
  </div>
);

// ─── ContractForm ─────────────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
];

const ContractForm: React.FC<{
  initial: typeof EMPTY_FORM;
  isEditing: boolean;
  users: SystemUser[];
  onSubmit: (data: typeof EMPTY_FORM) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}> = ({ initial, isEditing, users, onSubmit, onCancel, loading }) => {
  const [form, setForm] = useState(initial);
  const [showHardware, setShowHardware] = useState(false);

  useEffect(() => { setForm(initial); }, [initial]);

  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const selectedUser = users.find(u => u.id === form.buyer_user_id) || null;
  const needsUser = form.status === 'active' && !form.buyer_user_id;

  const inputCls = 'w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-slate-400';
  const labelCls = 'block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white mb-1.5';

  // When a user is selected from the dropdown, auto-fill buyer name/email if blank
  const handleUserSelect = (userId: string) => {
    set('buyer_user_id', userId);
    if (userId) {
      const u = users.find(x => x.id === userId);
      if (u) {
        setForm(prev => ({
          ...prev,
          buyer_user_id: userId,
          buyer_name: prev.buyer_name || u.fullName,
          buyer_email: prev.buyer_email || u.email,
          buyer_phone: prev.buyer_phone || (u.contact || ''),
          buyer_address: prev.buyer_address || (u.farmLocation || ''),
          installation_address: prev.installation_address || (u.farmLocation || ''),
        }));
      }
    }
  };

  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); await onSubmit(form); }}
      className="space-y-5"
    >
      {/* ─── ASSIGNED USER (anti-scam) ─── */}
      <div className={`rounded-2xl border-2 p-4 space-y-3 ${
        form.buyer_user_id
          ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/10'
          : 'border-amber-400 bg-amber-50 dark:bg-amber-900/10'
      }`}>
        <div className="flex items-center gap-2">
          {form.buyer_user_id
            ? <UserCheck size={16} className="text-emerald-500" />
            : <ShieldAlert size={16} className="text-amber-500" />}
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {form.buyer_user_id ? 'Assigned Registered Buyer Account' : '⚠️ No User Assigned — Required to activate contract'}
          </span>
        </div>

        <div>
          <label className={labelCls}>Select Registered User (Buyer) *</label>
          <select
            className={inputCls}
            value={form.buyer_user_id}
            onChange={e => handleUserSelect(e.target.value)}
          >
            <option value="">-- Select a registered user --</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.fullName} • {u.email} [{u.role}]
              </option>
            ))}
          </select>
        </div>

        {selectedUser && (
          <div className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-xl px-4 py-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <User size={18} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800 dark:text-white">{selectedUser.fullName}</p>
              <p className="text-xs text-slate-400 dark:text-white">{selectedUser.email} • <span className="capitalize">{selectedUser.role}</span></p>
            </div>
            <button
              type="button"
              onClick={() => set('buyer_user_id', '')}
              className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-white"
              title="Remove assignment"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {needsUser && (
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
            A registered user must be selected to set status to “Active”. Either select a user above or leave status as “Draft”.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Buyer Name *</label>
          <input className={inputCls} value={form.buyer_name} onChange={e => set('buyer_name', e.target.value)} required placeholder="Full name" />
        </div>
        <div>
          <label className={labelCls}>Buyer Email *</label>
          <input className={inputCls} type="email" value={form.buyer_email} onChange={e => set('buyer_email', e.target.value)} required placeholder="buyer@example.com" />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input className={inputCls} value={form.buyer_phone} onChange={e => set('buyer_phone', e.target.value)} placeholder="+250 7XX XXX XXX" />
        </div>
        <div>
          <label className={labelCls}>Buyer Address</label>
          <input className={inputCls} value={form.buyer_address} onChange={e => set('buyer_address', e.target.value)} placeholder="City, Province" />
        </div>
      </div>

      <div>
        <label className={labelCls}>System Name</label>
        <input className={inputCls} value={form.system_name} onChange={e => set('system_name', e.target.value)} />
      </div>

      <div>
        <label className={labelCls}>Modules Included</label>
        <textarea className={inputCls} rows={2} value={form.modules_included} onChange={e => set('modules_included', e.target.value)} />
      </div>

      {/* Collapsible hardware */}
      <div>
        <button type="button" onClick={() => setShowHardware(v => !v)} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white hover:text-emerald-500 transition-colors mb-1.5">
          Hardware Details {showHardware ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showHardware && (
          <textarea className={inputCls} rows={3} value={form.hardware} onChange={e => set('hardware', e.target.value)} placeholder="List hardware items..." />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Quantity</label>
          <input className={inputCls} type="number" min={1} value={form.quantity} onChange={e => set('quantity', Number(e.target.value))} />
        </div>
        <div>
          <label className={labelCls}>Total Price (RWF)</label>
          <input className={inputCls} type="number" min={0} value={form.total_price_rwf} onChange={e => set('total_price_rwf', e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className={labelCls}>Deposit (RWF)</label>
          <input className={inputCls} type="number" min={0} value={form.deposit_rwf} onChange={e => set('deposit_rwf', e.target.value)} placeholder="0" />
        </div>
      </div>

      {(form.total_price_rwf || form.deposit_rwf) && (
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 dark:bg-white/5 rounded-2xl px-4 py-3">
          <span>Balance:</span>
          <span className="text-rose-500">
            {fmtRwf((parseFloat(String(form.total_price_rwf)) || 0) - (parseFloat(String(form.deposit_rwf)) || 0))}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Payment Method</label>
          <select className={inputCls} value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Payment Status</label>
          <select className={inputCls} value={form.payment_status} onChange={e => set('payment_status', e.target.value)}>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Delivery Date</label>
          <input className={inputCls} type="date" value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Warranty (months)</label>
          <input className={inputCls} type="number" min={0} value={form.warranty_months} onChange={e => set('warranty_months', Number(e.target.value))} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Installation Address</label>
        <input className={inputCls} value={form.installation_address} onChange={e => set('installation_address', e.target.value)} placeholder="Farm / installation location" />
      </div>

      <div>
        <label className={labelCls}>Contract Status</label>
        <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea className={inputCls} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional terms, conditions, or remarks..." />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading || needsUser}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <FileSignature size={16} />}
          {isEditing ? 'Update Contract' : 'Create Contract'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3.5 rounded-2xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white font-bold text-xs uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/20 transition-all"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

// ─── ActivationModal ──────────────────────────────────────────────────────────
const ActivationModal: React.FC<{
  result: { tempPassword: string | null; message: string; linked: boolean };
  onClose: () => void;
}> = ({ result, onClose }) => {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (result.tempPassword) {
      navigator.clipboard.writeText(result.tempPassword).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-8 space-y-6 text-center">
        <div className="flex justify-center">
          <div className="bg-emerald-500/10 p-4 rounded-full">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
        </div>
        <h3 className="text-xl font-black text-slate-800 dark:text-white">Contract Activated</h3>
        <p className="text-sm text-slate-500 dark:text-slate-300">{result.message}</p>

        {result.tempPassword && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white">Temporary Password</p>
            <div className="flex items-center justify-between gap-3">
              <code className="text-lg font-black text-emerald-500 tracking-widest">{result.tempPassword}</code>
              <button onClick={copy} className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-all">
                {copied ? <ClipboardCheck size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-white">Share this password with the buyer. They can change it after first login.</p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-emerald-500 text-white font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all"
        >
          Done
        </button>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const ContractManagement: React.FC<{ currentUser?: any; currentRole?: string }> = ({ currentRole }) => {
  const { userId } = useParams<{ userId?: string }>();
  const viewingAsAdmin = Boolean(userId);
  const role = String(currentRole || '').toLowerCase();
  const canManage = role === 'admin' || role === 'supervisor';
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [formValues, setFormValues] = useState<typeof EMPTY_FORM>(EMPTY_FORM);

  const [previewContract, setPreviewContract] = useState<Contract | null>(null);
  const [activationResult, setActivationResult] = useState<{ tempPassword: string | null; message: string; linked: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadContracts = useCallback(async () => {
    try {
      const res = userId ? await db.getContractsForUser(userId) : await db.getContracts();
      setContracts(res.contracts || []);
    } catch (e) {
      console.error('Failed to load contracts', e);
    } finally {
      setLoadingList(false);
    }
  }, [userId]);

  const loadUsers = useCallback(async () => {
    if (!canManage) {
      setUsers([]);
      return;
    }
    try {
      const res = await db.getAllUsers();
      // getAllUsers returns { [id]: { fullName, email, role, ... } }
      const list: SystemUser[] = Object.entries(res).map(([id, u]: [string, any]) => ({
        id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        contact: u.contact,
        farmSize: u.farmSize,
        farmLocation: u.farmLocation,
        deviceSerialNumber: u.deviceSerialNumber,
      }));
      setUsers(list);
    } catch (e) {
      console.error('Failed to load users', e);
    }
  }, [canManage]);

  useEffect(() => {
    loadContracts();
    loadUsers();
  }, [loadContracts, loadUsers]);

  const openCreate = () => {
    if (!canManage) return;
    setEditingContract(null);
    const presetUser = userId ? users.find(u => u.id === userId) : null;
    setFormValues({
      ...EMPTY_FORM,
      buyer_user_id: userId || '',
      buyer_name: presetUser?.fullName || EMPTY_FORM.buyer_name,
      buyer_email: presetUser?.email || EMPTY_FORM.buyer_email,
    });
    setShowForm(true);
    setError(null);
  };

  const openEdit = (c: Contract) => {
    if (!canManage) return;
    setEditingContract(c);
    setFormValues({
      buyer_name: c.buyer_name,
      buyer_email: c.buyer_email,
      buyer_phone: c.buyer_phone || '',
      buyer_address: c.buyer_address || '',
      system_name: c.system_name,
      modules_included: c.modules_included || '',
      hardware: c.hardware || '',
      quantity: c.quantity,
      total_price_rwf: String(c.total_price_rwf),
      deposit_rwf: String(c.deposit_rwf),
      payment_method: c.payment_method,
      payment_status: c.payment_status,
      delivery_date: c.delivery_date ? c.delivery_date.slice(0, 10) : '',
      warranty_months: c.warranty_months,
      installation_address: c.installation_address || '',
      notes: c.notes || '',
      status: c.status,
      buyer_user_id: c.buyer_user_id || ''
    });
    setShowForm(true);
    setError(null);
  };

  const handleSubmit = async (data: typeof EMPTY_FORM) => {
    if (!canManage) return;
    setSubmitting(true);
    setError(null);
    try {
      if (editingContract) {
        await db.updateContract(editingContract.id, data);
      } else {
        await db.createContract(data);
      }
      await loadContracts();
      setShowForm(false);
      setEditingContract(null);
    } catch (e: any) {
      setError(e.message || 'Failed to save contract');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManage) return;
    if (!window.confirm('Delete this contract? This cannot be undone.')) return;
    try {
      await db.deleteContract(id);
      setContracts(prev => prev.filter(c => c.id !== id));
    } catch (e: any) {
      alert(e.message || 'Failed to delete contract');
    }
  };

  const handleActivate = async (id: string) => {
    if (!canManage) return;
    const contract = contracts.find(c => c.id === id);
    if (contract && !contract.buyer_user_id) {
      alert('This contract has no registered user assigned.\nPlease edit the contract and select a buyer account first.');
      return;
    }
    if (!window.confirm('Activate this contract?\nThis will link the buyer account and mark the contract as active.')) return;
    setActivating(id);
    try {
      const res = await db.activateContract(id);
      if (res.success) {
        await loadContracts();
        setActivationResult({ tempPassword: res.tempPassword, message: res.message, linked: res.linked });
      } else {
        alert(res.message || 'Activation failed');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to activate contract');
    } finally {
      setActivating(null);
    }
  };

  // Stats
  const totalContracts = contracts.length;
  const activeContracts = contracts.filter(c => c.status === 'active').length;
  const totalRevenue = contracts.filter(c => c.status !== 'cancelled').reduce((s, c) => s + Number(c.total_price_rwf), 0);
  const depositsCollected = contracts.filter(c => c.status !== 'cancelled').reduce((s, c) => s + Number(c.deposit_rwf), 0);
  const unassigned = contracts.filter(c => !c.buyer_user_id && c.status !== 'cancelled').length;
  const primaryAssignedContract = contracts[0] || null;

  if (!canManage) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-500 p-3 rounded-2xl shadow-lg shadow-emerald-500/25">
            <FileSignature size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white">My Final Contract</h1>
            <p className="text-xs font-bold text-slate-400 dark:text-white uppercase tracking-widest mt-0.5">Assigned agreement only</p>
          </div>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-400 dark:text-white bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/5">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-sm font-bold">Loading contract…</span>
          </div>
        ) : !primaryAssignedContract ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400 dark:text-white bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/5">
            <FileSignature size={36} />
            <p className="text-sm font-bold">No final contract has been assigned to your account yet.</p>
          </div>
        ) : (
          <>
            <ContractDocument contract={primaryAssignedContract} />
            <div className="flex justify-end">
              <button
                onClick={() => setPreviewContract(primaryAssignedContract)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 transition-all"
              >
                <Eye size={16} />
                Preview / Print
              </button>
            </div>
          </>
        )}

        {previewContract && (
          <PrintView contract={previewContract} onClose={() => setPreviewContract(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {viewingAsAdmin && (
        <div className="px-4 py-3 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 text-xs font-black uppercase tracking-widest border border-blue-100 dark:border-blue-400/20">
          Admin View: Selected user contracts
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-500 p-3 rounded-2xl shadow-lg shadow-emerald-500/25">
            <FileSignature size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white">
              {canManage ? 'Contract Management' : 'My Assigned Contract'}
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              {canManage ? 'Sales & Service Agreements' : 'View-only assigned agreement'}
            </p>
          </div>
        </div>
        {canManage && !showForm && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20"
          >
            <Plus size={16} />
            New Contract
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Contracts', value: totalContracts, color: 'text-slate-700 dark:text-white' },
          { label: 'Active', value: activeContracts, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Total Value', value: fmtRwf(totalRevenue), color: 'text-sky-600 dark:text-sky-400' },
          { label: 'Deposits Collected', value: fmtRwf(depositsCollected), color: 'text-violet-600 dark:text-violet-400' },
        ].map(card => (
          <div key={card.label} className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100 dark:border-white/5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white mb-2">{card.label}</p>
            <p className={`text-xl font-black ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Anti-scam warning: contracts without user assigned */}
      {canManage && unassigned > 0 && (
        <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-2xl">
          <ShieldAlert size={20} className="text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-black text-amber-700 dark:text-amber-400">
              {unassigned} contract{unassigned > 1 ? 's' : ''} without a registered buyer account
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
              Contracts cannot be activated until a registered user is assigned. Edit each contract and select a buyer account.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 px-5 py-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl text-rose-600 dark:text-rose-400 text-sm font-bold">
          <XCircle size={18} />
          {error}
        </div>
      )}

      {/* Form Panel */}
      {canManage && showForm && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-100 dark:border-white/5 shadow-sm">
          <h2 className="text-base font-black uppercase tracking-widest text-slate-700 dark:text-white mb-6">
            {editingContract ? `Edit Contract — ${editingContract.contract_number}` : 'New Contract'}
          </h2>
          <ContractForm
            initial={formValues}
            isEditing={!!editingContract}
            users={users}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditingContract(null); setError(null); }}
            loading={submitting}
          />
        </div>
      )}

      {/* Contracts List */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/5 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white">
            {canManage ? `All Contracts (${contracts.length})` : `Assigned Contracts (${contracts.length})`}
          </h2>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-400 dark:text-white">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-sm font-bold">Loading contracts…</span>
          </div>
        ) : contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400 dark:text-white">
            <FileSignature size={36} />
            <p className="text-sm font-bold">
              {canManage ? 'No contracts yet. Create your first one.' : 'No contract has been assigned to your account yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {contracts.map(c => (
              <ContractRow
                key={c.id}
                contract={c}
                onEdit={() => openEdit(c)}
                onDelete={() => handleDelete(c.id)}
                onActivate={() => handleActivate(c.id)}
                onPreview={() => setPreviewContract(c)}
                activating={activating === c.id}
                  canManage={canManage}
              />
            ))}
          </div>
        )}
      </div>

      {/* Print / Preview Modal */}
      {previewContract && (
        <PrintView contract={previewContract} onClose={() => setPreviewContract(null)} />
      )}

      {/* Activation Result Modal */}
      {activationResult && (
        <ActivationModal result={activationResult} onClose={() => setActivationResult(null)} />
      )}
    </div>
  );
};

// ─── ContractRow ──────────────────────────────────────────────────────────────
const ContractRow: React.FC<{
  contract: Contract;
  onEdit: () => void;
  onDelete: () => void;
  onActivate: () => void;
  onPreview: () => void;
  activating: boolean;
  canManage: boolean;
}> = ({ contract, onEdit, onDelete, onActivate, onPreview, activating, canManage }) => {
  const [expanded, setExpanded] = useState(false);
  const hasUser = !!contract.buyer_user_id;

  return (
    <div className="px-6 py-5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
      <div className="flex flex-wrap items-center gap-3">
        {/* Contract number + buyer */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-slate-800 dark:text-white">{contract.contract_number}</span>
            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${statusBadge(contract.status)}`}>
              {contract.status}
            </span>
            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${payBadge(contract.payment_status)}`}>
              {contract.payment_status}
            </span>
            {/* User assignment indicator */}
            {hasUser ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                <UserCheck size={10} /> User Linked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                <ShieldAlert size={10} /> No User
              </span>
            )}
          </div>
          <div className="flex gap-3 flex-wrap mt-1 text-xs text-slate-500">
            <span className="font-semibold">{contract.buyer_name}</span>
            <span>{contract.buyer_email}</span>
            {contract.buyer_phone && <span>{contract.buyer_phone}</span>}
          </div>
          {/* Admin (CEO) signature line */}
          {contract.admin_name && (
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400 dark:text-white">
              <ShieldAlert size={11} className="text-slate-300" />
              <span>Created by <span className="font-bold text-slate-500">{contract.admin_name}</span> ({contract.admin_email})</span>
            </div>
          )}
        </div>

        {/* Price + actions */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-black text-slate-700 dark:text-white">{fmtRwf(contract.total_price_rwf)}</div>
            <div className="text-[10px] text-slate-400 dark:text-white">{new Date(contract.created_at).toLocaleDateString()}</div>
          </div>

          <button onClick={() => setExpanded(v => !v)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-white transition-all" title="Toggle details">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button onClick={onPreview} className="p-2 rounded-xl hover:bg-sky-50 dark:hover:bg-sky-900/20 text-sky-500 transition-all" title="Preview / Print">
            <Eye size={16} />
          </button>
          {canManage && (
            <button onClick={onEdit} className="p-2 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 transition-all" title="Edit">
              <Edit2 size={16} />
            </button>
          )}
          {canManage && contract.status !== 'active' && contract.status !== 'completed' && (
            <button
              onClick={onActivate}
              disabled={activating || !hasUser}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                hasUser
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-white'
              }`}
              title={hasUser ? 'Activate contract' : 'Assign a registered user first'}
            >
              {activating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {hasUser ? 'Activate' : 'Assign User'}
            </button>
          )}
          {canManage && (
            <button onClick={onDelete} className="p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500 transition-all" title="Delete">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs text-slate-500 dark:text-white">
          <div><span className="font-bold text-slate-400 dark:text-white block mb-0.5">Deposit</span>{fmtRwf(contract.deposit_rwf)}</div>
          <div><span className="font-bold text-slate-400 dark:text-white block mb-0.5">Balance</span><span className="text-rose-500">{fmtRwf(contract.balance_rwf)}</span></div>
          <div><span className="font-bold text-slate-400 dark:text-white block mb-0.5">Payment</span>{contract.payment_method.replace(/_/g, ' ')}</div>
          <div><span className="font-bold text-slate-400 dark:text-white block mb-0.5">Delivery</span>{contract.delivery_date ? new Date(contract.delivery_date).toLocaleDateString() : '—'}</div>
          <div><span className="font-bold text-slate-400 dark:text-white block mb-0.5">Warranty</span>{contract.warranty_months}mo</div>
          <div><span className="font-bold text-slate-400 dark:text-white block mb-0.5">Quantity</span>{contract.quantity}</div>
          {contract.buyer_user_name && (
            <div className="col-span-2">
              <span className="font-bold text-slate-400 dark:text-white block mb-0.5">Buyer Account</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{contract.buyer_user_name}</span>
              <span className="ml-2 text-slate-400 dark:text-white">{contract.buyer_user_email}</span>
              <span className="ml-2 capitalize bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">{contract.buyer_user_role}</span>
            </div>
          )}
          {contract.installation_address && (
            <div className="col-span-2"><span className="font-bold text-slate-400 dark:text-white block mb-0.5">Install Address</span>{contract.installation_address}</div>
          )}
          {contract.notes && (
            <div className="col-span-full"><span className="font-bold text-slate-400 dark:text-white block mb-0.5">Notes</span>{contract.notes}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default ContractManagement;
