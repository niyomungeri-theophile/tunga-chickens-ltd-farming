import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Droplets, Activity } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { auth, db } from '../api';

type ChickType = 'broiler' | 'layer' | 'dual-purpose' | 'local';
type SpecificType = 'indigenous' | 'improved-breed' | 'meat-type' | 'egg-type';

const FeedWaterRecommendation: React.FC = () => {
  const { t } = useTranslation();

  const { userId } = useParams<{ userId?: string }>();
  const viewingAsAdmin = Boolean(userId);

  const [chickType, setChickType] = useState<ChickType>('broiler');
  const [specificType, setSpecificType] = useState<SpecificType>('meat-type');
  const [ageMonths, setAgeMonths] = useState<number>(1);
  const [flockSize, setFlockSize] = useState<number>(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  const [feedType, setFeedType] = useState<string>('');
  const [quantityKg, setQuantityKg] = useState<number>(0);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [farmSize, setFarmSize] = useState<string>('');
  const [farmLocation, setFarmLocation] = useState<string>('');

  const loadLogs = async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const result = await db.getFeedingLogs(50, userId);
      const rows = Array.isArray(result?.logs) ? result.logs : [];
      setLogs(rows);

      // Prefer explicit values from server-stored logs.
      const first = rows?.[0];
      if (!farmSize && first?.farm_size) setFarmSize(String(first.farm_size));
      if (!farmLocation && first?.farm_location) setFarmLocation(String(first.farm_location));
    } catch (e: any) {
      setLogsError(e?.message || 'Failed to load feeding history');
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    // Best-effort load of farm size/location from profile for display.
    let cancelled = false;
    let attempts = 0;

    const tryLoadProfile = async () => {
      if (cancelled) return;
      if (farmSize || farmLocation) return;

      const uid = viewingAsAdmin ? userId : auth.currentUser?.uid;
      if (!uid) {
        attempts += 1;
        if (attempts < 12) setTimeout(tryLoadProfile, 250);
        return;
      }

      try {
        const result = await db.getUser(uid);
        const u = result?.user || result;
        if (!cancelled) {
          if (u?.farmSize) setFarmSize(String(u.farmSize));
          if (u?.farmLocation) setFarmLocation(String(u.farmLocation));
        }
      } catch {
        // ignore
      }
    };

    tryLoadProfile();
    return () => {
      cancelled = true;
    };
  }, [farmLocation, farmSize, t, userId, viewingAsAdmin]);

  const specificTypeOptions = useMemo(() => {
    // Options are aligned to the selected category so farmers can pick easily.
    if (chickType === 'broiler') {
      return [
        { value: 'meat-type' as const, labelKey: 'meat_type' },
        { value: 'improved-breed' as const, labelKey: 'improved_breed' },
        { value: 'indigenous' as const, labelKey: 'indigenous' },
      ];
    }

    if (chickType === 'layer') {
      return [
        { value: 'egg-type' as const, labelKey: 'egg_type' },
        { value: 'improved-breed' as const, labelKey: 'improved_breed' },
        { value: 'indigenous' as const, labelKey: 'indigenous' },
      ];
    }

    if (chickType === 'local') {
      return [
        { value: 'indigenous' as const, labelKey: 'indigenous' },
        { value: 'improved-breed' as const, labelKey: 'improved_breed' },
      ];
    }

    // dual-purpose
    return [
      { value: 'improved-breed' as const, labelKey: 'improved_breed' },
      { value: 'indigenous' as const, labelKey: 'indigenous' },
    ];
  }, [chickType]);

  useEffect(() => {
    // Ensure the selected specific type is valid for the selected category.
    const allowed = new Set(specificTypeOptions.map((o) => o.value));
    if (!allowed.has(specificType)) {
      setSpecificType(specificTypeOptions[0]?.value || 'indigenous');
    }
  }, [specificType, specificTypeOptions]);

  const onSubmit = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const result = await db.recommendFeedWater({
        chickType,
        ageMonths,
        flockSize,
        specificType,
      });
      setData(result?.recommendation || null);
    } catch (e: any) {
      setError(e?.message || 'Failed to get recommendation');
    } finally {
      setLoading(false);
    }
  };

  const saveFeedingLog = async () => {
    setSaveLoading(true);
    setSaveMessage(null);
    try {
      const payload = {
        chickCategory: chickType,
        chickSpecificType: specificType,
        ageMonths,
        flockSize,
        feedType: feedType.trim(),
        quantityKg,
      };

      if (editingId) {
        await db.updateFeedingLog(editingId, payload, userId);
      } else {
        await db.addFeedingLog(payload, userId);
      }
      setSaveMessage(t('saved'));
      setFeedType('');
      setQuantityKg(0);
      setEditingId(null);
      await loadLogs();
    } catch (e: any) {
      setSaveMessage(e?.message || t('error'));
    } finally {
      setSaveLoading(false);
    }
  };

  const startEdit = (row: any) => {
    setEditingId(String(row.id));
    setFeedType(String(row.feed_type || ''));
    setQuantityKg(Number(row.quantity_kg || 0));
    if (row.chick_category) setChickType(String(row.chick_category) as ChickType);
    if (row.chick_specific_type) setSpecificType(String(row.chick_specific_type) as SpecificType);
    if (row.age_months !== null && typeof row.age_months !== 'undefined') setAgeMonths(Number(row.age_months));
    if (row.flock_size !== null && typeof row.flock_size !== 'undefined') setFlockSize(Number(row.flock_size));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFeedType('');
    setQuantityKg(0);
  };

  const deleteLog = async (id: string) => {
    if (!window.confirm(t('confirm_delete'))) return;
    setSaveLoading(true);
    setSaveMessage(null);
    try {
      await db.deleteFeedingLog(id, userId);
      setSaveMessage(t('deleted'));
      if (editingId === id) cancelEdit();
      await loadLogs();
    } catch (e: any) {
      setSaveMessage(e?.message || t('error'));
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 animate-fade-in transition-colors duration-500">
      <header className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-neon tracking-tight">{t('feed_water_recommendation')}</h1>
          <p className="mt-2 text-sm font-black text-neon-dark">
            {t('feed_water_desc')}
          </p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-neon/10 border border-neon/20 flex items-center justify-center">
          <Droplets size={22} className="text-neon" />
        </div>
      </header>

      <div className="bg-[#020c02] border border-[#39ff14]/20 rounded-3xl p-6 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-[#1a7a1a] mb-1">{t('chick_type')}</label>
            <select
              value={chickType}
              onChange={(e) => setChickType(e.target.value as ChickType)}
              className="w-full rounded-xl bg-[#010601] border border-[#39ff14]/20 px-3 py-2 text-sm font-black text-[#39ff14] focus:outline-none focus:ring-2 focus:ring-[#39ff14]/30"
            >
              <option value="broiler">{t('broiler')}</option>
              <option value="layer">{t('layer')}</option>
              <option value="dual-purpose">{t('dual_purpose')}</option>
              <option value="local">{t('local_indigenous')}</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-neon-dark mb-1">{t('specific_type')}</label>
            <select
              value={specificType}
              onChange={(e) => setSpecificType(e.target.value as SpecificType)}
              className="w-full rounded-xl bg-[#010601] border border-[#39ff14]/20 px-3 py-2 text-sm font-black text-[#39ff14] focus:outline-none focus:ring-2 focus:ring-[#39ff14]/30"
            >
              {specificTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-neon-dark mb-1">{t('age_months')}</label>
            <input
              type="number"
              min={0}
              max={36}
              step={0.5}
              value={Number.isFinite(ageMonths) ? ageMonths : 1}
              onChange={(e) => setAgeMonths(Number(e.target.value))}
              className="w-full rounded-xl bg-[#010601] border border-[#39ff14]/20 px-3 py-2 text-sm font-black text-[#39ff14] placeholder:text-[#1a7a1a] focus:outline-none focus:ring-2 focus:ring-[#39ff14]/30"
              placeholder="e.g. 1"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-neon-dark mb-1">{t('total_chickens')}</label>
            <input
              type="number"
              min={1}
              max={1000000}
              step={1}
              value={Number.isFinite(flockSize) ? flockSize : 1}
              onChange={(e) => setFlockSize(Number(e.target.value))}
              className="w-full rounded-xl bg-[#010601] border border-[#39ff14]/20 px-3 py-2 text-sm font-black text-[#39ff14] placeholder:text-[#1a7a1a] focus:outline-none focus:ring-2 focus:ring-[#39ff14]/30"
              placeholder="e.g. 100"
            />
          </div>

          <div className="flex items-end md:col-span-4">
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading}
              className="w-full rounded-xl px-4 py-2 text-sm font-black uppercase tracking-widest border border-[#39ff14]/25 bg-[#39ff14]/10 text-[#39ff14] hover:bg-[#39ff14]/15 disabled:opacity-60"
            >
              {loading ? t('processing') : t('get_recommendation')}
            </button>
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-black text-[#1a7a1a]">{error}</p>}

        {data && (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-[#39ff14]/15 bg-[#39ff14]/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#39ff14]">{t('flock_totals')}</p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#39ff14]/15 bg-[#010601] px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neon-dark">{t('feed_total_per_day')}</p>
                  <p className="text-lg font-black text-neon mt-1">{data.totals?.feedKgPerDay ? `${data.totals.feedKgPerDay} kg/day` : '—'}</p>
                </div>
                <div className="rounded-xl border border-neon/15 bg-neon-bg-darker px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neon-dark">{t('water_total_per_day')}</p>
                  <p className="text-lg font-black text-neon mt-1">{data.totals?.waterLitersPerDay ? `${data.totals.waterLitersPerDay} L/day` : '—'}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-neon/15 bg-neon/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-neon-dark">{t('stage')}</p>
              <p className="text-lg font-black text-neon mt-1">{data.stage}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-neon-dark mt-3">{t('recommended_feed')}</p>
              <p className="text-base font-black text-neon mt-1">{data.feed?.name}</p>
              <p className="text-xs font-black uppercase tracking-widest text-neon-dark mt-2">{t('daily_feed_intake')}</p>
              <p className="text-sm font-black text-neon mt-1">{data.feed?.dailyIntakeGPerBird} g/bird/day</p>
            </div>

            <div className="rounded-2xl border border-neon/15 bg-neon/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-neon-dark">{t('recommended_water')}</p>
              <p className="text-lg font-black text-neon mt-1">{data.water?.litersPerBirdPerDay} L/bird/day</p>

              <p className="text-[10px] font-black uppercase tracking-widest text-neon-dark mt-4">{t('notes')}</p>
              <ul className="mt-2 space-y-1">
                {(data.water?.notes || []).slice(0, 3).map((n: string, idx: number) => (
                  <li key={idx} className="text-xs font-black text-neon-dark">• {n}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-neon/15 bg-neon/5 p-4">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-neon" />
                <p className="text-[10px] font-black uppercase tracking-widest text-neon">{t('nutrient_targets')}</p>
              </div>
              <div className="mt-3 space-y-2">
                {(data.nutrients || []).slice(0, 6).map((n: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black text-neon-dark">{n.name}</p>
                    <p className="text-xs font-black text-[#39ff14]">{n.target}{n.unit ? ` ${n.unit}` : ''}</p>
                  </div>
                ))}
              </div>

              <p className="text-[10px] font-black uppercase tracking-widest text-[#1a7a1a] mt-4">{t('feed_notes')}</p>
              <ul className="mt-2 space-y-1">
                {(data.feed?.notes || []).slice(0, 2).map((n: string, idx: number) => (
                  <li key={idx} className="text-xs font-black text-[#1a7a1a]">• {n}</li>
                ))}
              </ul>
            </div>
            </div>
          </div>
        )}
      </div>


    </div>
  );
};

export default FeedWaterRecommendation;
