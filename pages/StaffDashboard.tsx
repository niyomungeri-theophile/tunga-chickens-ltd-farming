
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  BarChart as BarChartIcon, Wallet, PieChart as PieChartIcon, 
  TrendingUp, DollarSign, Plus, History, Bolt, Trash2, Edit2, X,
  ArrowUpCircle, ArrowDownCircle, Loader2
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts';
import { db, subscribeToData } from '../api';
import { useTranslation } from '../contexts/LanguageContext';

const StaffDashboard: React.FC<{ user: any }> = ({ user }) => {
  const { userId } = useParams<{ userId?: string }>();
  const viewingAsAdmin = Boolean(userId);
  const { t } = useTranslation();
  const [financials, setFinancials] = useState({
    totalIncome: 0,
    totalExpense: 0,
    profit: 0,
    breakdown: [] as any[],
    history: [] as any[]
  });
  const [currentEnergyCost, setCurrentEnergyCost] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [type, setType] = useState('income');
  const [category, setCategory] = useState('Egg Sales');
  const [amount, setAmount] = useState('');
  const [otherDesc, setOtherDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Report State
  const toYmd = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const getDefaultRange = (mode: 'weekly' | 'monthly') => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - (mode === 'weekly' ? 6 : 29));
    return { start: toYmd(start), end: toYmd(end) };
  };

  const [reportGranularity, setReportGranularity] = useState<'weekly' | 'monthly'>('weekly');
  const [reportStartDate, setReportStartDate] = useState(() => getDefaultRange('weekly').start);
  const [reportEndDate, setReportEndDate] = useState(() => getDefaultRange('weekly').end);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    const txPath = userId ? `/transactions?userId=${encodeURIComponent(userId)}` : 'transactions';
    const powerPath = userId ? `/sensors/power/cost?userId=${encodeURIComponent(userId)}` : 'power/cost_RWF';

    // 1. Listen to Transactions (polling-based)
    const unsubTrans = subscribeToData(txPath, (data) => {
      if (data) {
        const entries = Object.entries(data).map(([id, val]: [string, any]) => ({
          id,
          ...val
        })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        let income = 0;
        let expense = 0;
        let categoriesMap: Record<string, number> = {
            "Energy Bill": 0, "Feed": 0, "Medicine": 0, "Maintenance": 0, "Other": 0
        };
        
        entries.forEach((t: any) => {
          const val = Number(t.amount);
          if (t.type === 'income') {
              income += val;
          } else {
            expense += val;
            const cat = t.category || "Other";
            categoriesMap[cat] = (categoriesMap[cat] || 0) + val;
          }
        });

        setFinancials({
          totalIncome: income,
          totalExpense: expense,
          profit: income - expense,
          breakdown: Object.keys(categoriesMap).map(name => ({ name, value: categoriesMap[name] })),
          history: entries
        });
      } else {
        setFinancials(prev => ({ ...prev, totalIncome: 0, totalExpense: 0, profit: 0, breakdown: [], history: [] }));
      }
      setLoading(false);
    }, 5000);

    // 2. Listen to Live Energy Cost
    const unsubEnergy = subscribeToData(powerPath, (cost) => {
      const parsed = typeof cost === 'number' ? cost : Number(cost?.cost_RWF ?? 0);
      setCurrentEnergyCost(parsed || 0);
    }, 5000);

    return () => {
      unsubTrans();
      unsubEnergy();
    };
  }, [userId]);

  useEffect(() => {
    const r = getDefaultRange(reportGranularity);
    setReportStartDate(r.start);
    setReportEndDate(r.end);
    setReportError(null);
  }, [reportGranularity]);

  const downloadReportCsv = () => {
    setReportError(null);
    if (!reportStartDate || !reportEndDate) {
      setReportError(t('report_select_dates_error'));
      return;
    }

    const start = new Date(reportStartDate);
    const end = new Date(reportEndDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setReportError(t('report_invalid_dates_error'));
      return;
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (start.getTime() > end.getTime()) {
      setReportError(t('report_start_after_end_error'));
      return;
    }

    const startOfIsoWeek = (date: Date) => {
      const d = new Date(date);
      const day = (d.getDay() + 6) % 7; // Monday=0
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const getTxTimestamp = (tx: any) => {
      const ts = Number(tx.timestamp);
      if (Number.isFinite(ts)) return ts;

      const rawDate = String(tx.date || '').trim();
      if (!rawDate) return NaN;

      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        const d = new Date(rawDate);
        return d.getTime();
      }

      const parts = rawDate.split(/[\/\-\.]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length !== 3) return NaN;

      const a = Number(parts[0]);
      const b = Number(parts[1]);
      const c = Number(parts[2]);
      if (![a, b, c].every((n) => Number.isFinite(n))) return NaN;

      const year = c;
      let month = 0;
      let day = 0;
      if (a > 12) {
        day = a;
        month = b;
      } else if (b > 12) {
        month = a;
        day = b;
      } else {
        month = a;
        day = b;
      }
      const d = new Date(year, month - 1, day);
      return d.getTime();
    };

    const records = financials.history
      .map((tx: any) => {
        const ts = getTxTimestamp(tx);
        return { tx, ts };
      })
      .filter(({ ts }) => Number.isFinite(ts) && ts >= start.getTime() && ts <= end.getTime())
      .sort((a, b) => b.ts - a.ts);

    if (records.length === 0) {
      setReportError(t('report_no_rows_error'));
      return;
    }

    const escapeCsv = (value: any) => {
      const s = String(value ?? '');
      if (/[\n",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    let totalIncome = 0;
    let totalExpense = 0;

    const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
    const dateFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    const header = ['Date', 'Time', 'Day', 'Type', 'Category', 'Amount_RWF'];
    const lines = [header.join(',')];

    for (const { tx, ts } of records) {
      const d = new Date(ts);
      const typeLower = String(tx.type || '').toLowerCase();
      const amountNum = Number(tx.amount) || 0;
      if (typeLower === 'income') totalIncome += amountNum;
      else if (typeLower === 'expense') totalExpense += amountNum;

      lines.push(
        [
          escapeCsv(dateFmt.format(d)),
          escapeCsv(timeFmt.format(d)),
          escapeCsv(weekdayFmt.format(d)),
          escapeCsv(typeLower || ''),
          escapeCsv(String(tx.category || '')),
          escapeCsv(amountNum.toFixed(2)),
        ].join(',')
      );
    }

    const netProfit = totalIncome - totalExpense;
    lines.push('');
    lines.push(['SUMMARY', '', '', '', '', ''].join(','));
    lines.push(['Total Income', '', '', '', '', escapeCsv(totalIncome.toFixed(2))].join(','));
    lines.push(['Total Expense', '', '', '', '', escapeCsv(totalExpense.toFixed(2))].join(','));
    lines.push(['Net Profit', '', '', '', '', escapeCsv(netProfit.toFixed(2))].join(','));
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const safeStart = reportStartDate.replace(/[^0-9-]/g, '');
    const safeEnd = reportEndDate.replace(/[^0-9-]/g, '');
    const filename = `financial-records_${reportGranularity}_${safeStart}_to_${safeEnd}${viewingAsAdmin ? `_user-${userId}` : ''}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAddTransaction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!amount || isNaN(Number(amount))) return;

    setIsSubmitting(true);
    
    try {
      const payload = {
        date: editingId ? editingDate : new Date().toLocaleDateString(),
        type,
        category: category === 'Other' && otherDesc.trim() ? `Other: ${otherDesc.trim()}` : category,
        amount: Number(amount),
        ...(userId ? { userId } : {})
      };

      if (editingId) {
        await db.updateTransaction(editingId, payload);
      } else {
        await db.addTransaction(payload);
      }

      setAmount('');
      setOtherDesc('');
      setEditingId(null);
      setEditingDate('');
      setType('income');
      setCategory('Egg Sales');
    } catch (err) {
      console.error("Error adding transaction:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (transaction: any) => {
    setEditingId(transaction.id);
    setEditingDate(transaction.date || new Date().toLocaleDateString());
    setType(transaction.type || 'income');
    const currentCategory = String(transaction.category || 'Other');
    if (currentCategory.startsWith('Other:')) {
      setCategory('Other');
      setOtherDesc(currentCategory.replace('Other:', '').trim());
    } else {
      setCategory(currentCategory);
      setOtherDesc('');
    }
    setAmount(String(transaction.amount ?? ''));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingDate('');
    setType('income');
    setCategory('Egg Sales');
    setAmount('');
    setOtherDesc('');
  };

  const handleLogEnergy = async () => {
    if (currentEnergyCost <= 0) return;
    setIsSubmitting(true);
    
    try {
      await db.addTransaction({
        date: new Date().toLocaleDateString(),
        type: 'expense',
        category: 'Energy Bill',
        amount: currentEnergyCost,
        ...(userId ? { userId } : {})
      });
    } catch (err) {
      console.error("Error logging energy bill:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t('delete_record_confirm'))) {
      await db.deleteTransaction(id);
    }
  };

  const COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#64748b'];

  const barData = [
    { name: t('income'), value: financials.totalIncome },
    { name: t('expense'), value: financials.totalExpense },
  ];

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-emerald-600 w-12 h-12" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 font-['Poppins',_sans-serif] animate-fade-in bg-[#020c02] min-h-screen">
      <h2 className="text-2xl sm:text-4xl font-extrabold text-[#39ff14] mb-6 sm:mb-10 tracking-tight">{t('financial_dashboard')}</h2>
      {viewingAsAdmin && (
        <p className="-mt-4 mb-8 text-xs font-black uppercase tracking-widest text-[#1a7a1a]">
          Admin View: Selected user financial records
        </p>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-10">
        <div className="bg-[#39ff14]/10 border border-[#39ff14]/25 p-6 sm:p-8 rounded-[2rem] shadow-xl shadow-[#39ff14]/5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#1a7a1a] mb-3 sm:mb-4">{t('total_income')}</p>
          <p className="text-2xl sm:text-4xl font-extrabold mb-2 text-[#39ff14]">{financials.totalIncome.toFixed(1)} RWF</p>
          <p className="text-sm font-medium text-[#1a7a1a]">Sales (Eggs, Birds)</p>
        </div>

        <div className="bg-[#39ff14]/5 border border-[#39ff14]/15 p-6 sm:p-8 rounded-[2rem] shadow-xl shadow-[#39ff14]/5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#1a7a1a] mb-3 sm:mb-4">{t('total_expense')}</p>
          <p className="text-2xl sm:text-4xl font-extrabold mb-2 text-[#39ff14]">{financials.totalExpense.toFixed(1)} RWF</p>
          <p className="text-sm font-medium text-[#1a7a1a]">Energy, Feed, Meds</p>
        </div>

        <div className="bg-[#020c02] border border-[#39ff14]/20 p-6 sm:p-8 rounded-[2rem] shadow-xl shadow-[#39ff14]/5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#1a7a1a] mb-3 sm:mb-4">{t('net_balance')}</p>
          <p className="text-2xl sm:text-4xl font-extrabold mb-2 text-[#39ff14]">
            {financials.profit.toFixed(1)} RWF
          </p>
          <p className="text-sm font-medium text-[#1a7a1a]">Income - Expenses</p>
        </div>
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-10">
        <div className="bg-[#020c02] border border-[#39ff14]/20 p-6 sm:p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center gap-3 mb-6 sm:mb-8">
            <PieChartIcon className="text-[#39ff14]" size={24} />
            <h3 className="text-lg sm:text-xl font-bold text-[#39ff14]">{t('total_expense')}</h3>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={financials.breakdown.filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {financials.breakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: '1px solid rgba(57,255,20,0.3)', backgroundColor: '#020c02', color: '#39ff14', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.4)' }}
                  formatter={(value: any) => [`${value.toLocaleString()} RWF`, t('expense')]}
                />
                <Legend verticalAlign="bottom" iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#020c02] border border-[#39ff14]/20 p-6 sm:p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center gap-3 mb-6 sm:mb-8">
            <BarChartIcon className="text-[#39ff14]" size={24} />
            <h3 className="text-lg sm:text-xl font-bold text-[#39ff14]">{t('net_balance')}</h3>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#0a1f0a" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#39ff14', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#1a7a1a', fontSize: 12}} />
                <Tooltip cursor={{ fill: '#39ff14/5' }} contentStyle={{ borderRadius: '16px', border: '1px solid rgba(57,255,20,0.3)', backgroundColor: '#020c02', color: '#39ff14' }} />
                <Bar dataKey="value" radius={[12, 12, 0, 0]} barSize={80}>
                  {barData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill='#39ff14' />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Reports */}
      <div className="bg-[#020c02] border border-[#39ff14]/20 p-6 sm:p-8 rounded-[2.5rem] shadow-sm mb-6 sm:mb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h3 className="text-lg sm:text-xl font-bold text-[#39ff14]">{t('financial_report')}</h3>
          <div className="flex items-center gap-2">
            <select
              value={reportGranularity}
              onChange={(e) => setReportGranularity(e.target.value as any)}
              className="bg-[#020c02] border-2 border-[#39ff14]/20 rounded-2xl px-4 py-2.5 outline-none focus:border-[#39ff14] transition-all font-semibold text-[#39ff14] cursor-pointer"
            >
              <option value="weekly">{t('weekly')}</option>
              <option value="monthly">{t('monthly')}</option>
            </select>
            <button
              type="button"
              onClick={downloadReportCsv}
              className="px-5 py-2.5 border border-[#39ff14]/30 text-[#39ff14] font-bold text-sm rounded-2xl hover:bg-[#39ff14]/10 transition-all"
            >
              {t('download_csv')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-[10px] font-bold text-[#1a7a1a] uppercase tracking-widest mb-2 ml-1">{t('start_date')}</label>
            <input
              type="date"
              value={reportStartDate}
              onChange={(e) => setReportStartDate(e.target.value)}
              className="w-full bg-[#020c02] border-2 border-[#39ff14]/20 rounded-2xl px-4 py-3 outline-none focus:border-[#39ff14] transition-all font-semibold text-[#39ff14]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#1a7a1a] uppercase tracking-widest mb-2 ml-1">{t('end_date')}</label>
            <input
              type="date"
              value={reportEndDate}
              onChange={(e) => setReportEndDate(e.target.value)}
              className="w-full bg-[#020c02] border-2 border-[#39ff14]/20 rounded-2xl px-4 py-3 outline-none focus:border-[#39ff14] transition-all font-semibold text-[#39ff14]"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            {reportError ? (
              <div className="h-full flex items-end">
                <p className="text-sm font-bold text-[#1a7a1a]">{reportError}</p>
              </div>
            ) : (
              <div className="h-full flex items-end">
                <p className="text-sm font-bold text-[#1a7a1a]">
                  {t('report_hint')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* History and Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
        <div className="lg:col-span-4 bg-[#020c02] border border-[#39ff14]/20 p-6 sm:p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <h3 className="text-lg sm:text-xl font-bold text-[#39ff14]">{editingId ? t('edit_transaction_title') : t('add_transaction_title')}</h3>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#1a7a1a] hover:text-[#39ff14] transition-colors"
              >
                <X size={14} /> {t('cancel')}
              </button>
            )}
          </div>
          <form onSubmit={handleAddTransaction} className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-[#1a7a1a] uppercase tracking-widest mb-2 ml-1">{t('type')}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-[#020c02] border-2 border-[#39ff14]/20 rounded-2xl px-4 py-3.5 outline-none focus:border-[#39ff14] transition-all font-semibold text-[#39ff14] cursor-pointer"
              >
                <option value="income">{t('income')} (+)</option>
                <option value="expense">{t('expense')} (-)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#1a7a1a] uppercase tracking-widest mb-2 ml-1">{t('category')}</label>
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); setOtherDesc(''); }}
                className="w-full bg-[#020c02] border-2 border-[#39ff14]/20 rounded-2xl px-4 py-3.5 outline-none focus:border-[#39ff14] transition-all font-semibold text-[#39ff14] cursor-pointer"
              >
                <option value="Egg Sales">Egg Sales</option>
                <option value="Bird Sales">Bird Sales</option>
                <option value="Feed">{t('feed')}</option>
                <option value="Medicine">{t('medication')}</option>
                <option value="Maintenance">{t('maintenance')}</option>
                <option value="Other">{t('other')}</option>
              </select>

              {category === 'Other' && (
                <div className="mt-3 animate-fade-in">
                  <label className="block text-[10px] font-bold text-[#1a7a1a] uppercase tracking-widest mb-2 ml-1">{t('other_description')}</label>
                  <textarea
                    value={otherDesc}
                    onChange={(e) => setOtherDesc(e.target.value)}
                    placeholder="e.g. Equipment repair, transport cost…"
                    rows={3}
                    className="w-full bg-[#39ff14]/5 border-2 border-[#39ff14]/20 rounded-2xl px-4 py-3 outline-none focus:border-[#39ff14] transition-all font-medium text-[#39ff14] resize-none placeholder:text-[#1a7a1a] text-sm"
                  />
                  <p className="text-[10px] text-[#1a7a1a] font-bold ml-1 mt-1">This description will be saved with the record.</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#1a7a1a] uppercase tracking-widest mb-2 ml-1">{t('amount_rwf')}</label>
              <input
                type="number"
                required
                min="1"
                placeholder={t('enter_amount')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-[#020c02] border-2 border-[#39ff14]/20 rounded-2xl px-4 py-3.5 outline-none focus:border-[#39ff14] transition-all font-semibold text-[#39ff14] placeholder:text-[#1a7a1a]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#39ff14]/15 border border-[#39ff14]/30 text-[#39ff14] font-bold py-4 rounded-2xl hover:bg-[#39ff14]/25 transition-all shadow-lg shadow-[#39ff14]/10 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? t('saving') : editingId ? t('save_changes') : t('add_record')}
            </button>
          </form>
        </div>

        <div className="lg:col-span-8 bg-[#020c02] border border-[#39ff14]/20 p-6 sm:p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6 sm:mb-8">
            <h3 className="text-xl font-bold text-[#39ff14] flex items-center gap-3">
               {t('history_log')}
            </h3>
            <button 
              onClick={handleLogEnergy}
              className="flex items-center gap-2 px-5 py-2.5 border border-[#39ff14]/30 text-[#39ff14] font-bold text-sm rounded-2xl hover:bg-[#39ff14]/10 transition-all"
            >
              <Bolt size={18} /> {t('log_energy_bill')}
            </button>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
            <table className="w-full min-w-[480px] text-left">
              <thead>
                <tr className="text-[10px] font-extrabold text-[#1a7a1a] uppercase tracking-widest border-b border-[#39ff14]/10">
                  <th className="pb-4">{t('date_col')}</th>
                  <th className="pb-4">{t('category_col')}</th>
                  <th className="pb-4">{t('type_col')}</th>
                  <th className="pb-4">{t('amount_col')}</th>
                  <th className="pb-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#39ff14]/5">
                {financials.history.map((row) => (
                  <tr key={row.id} className="group hover:bg-[#39ff14]/5 transition-colors">
                    <td className="py-5 text-sm font-medium text-[#1a7a1a]">{row.date || '-'}</td>
                    <td className="py-5 text-sm font-bold text-[#39ff14]">{row.category || '-'}</td>
                    <td className="py-5">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                        row.type === 'income' ? 'bg-[#39ff14]/10 text-[#39ff14]' : 'bg-[#39ff14]/5 text-[#1a7a1a]'
                      }`}>
                        {row.type || '-'}
                      </span>
                    </td>
                    <td className="py-5 text-sm font-bold text-[#39ff14]">
                      {row.type === 'income' ? '+' : '-'} {Number(row.amount ?? 0).toFixed(1)}
                    </td>
                    <td className="py-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(row)}
                          className="p-2 text-[#1a7a1a] hover:text-[#39ff14] transition-colors"
                          title={t('edit_transaction_btn')}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(row.id)}
                          className="p-2 text-[#1a7a1a] hover:text-[#39ff14] transition-colors"
                          title={t('delete_transaction_btn')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffDashboard;
