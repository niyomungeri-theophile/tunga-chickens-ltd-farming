import React, { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { 
  BrainCircuit, 
  Calendar, 
  CheckCircle2, 
  Lightbulb, 
  Sparkles,
  AlertCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { useTranslation } from '../contexts/LanguageContext';
import { db, subscribeToData, auth } from '../api';

interface PredictionResult {
  hatchRate: string;
  hatchDate: string;
  feedbackStatus?: 'Good' | 'Normal' | 'Risks' | string;
  riskNotes?: string;
  suggestions: {
    title: string;
    desc: string;
    type: 'success' | 'warning' | 'info';
  }[];
  diseaseName?: string;
  riskLevel?: string;
  riskPercent?: number;
  lightLux?: number;
  sensorReadings?: {
    ammonia_ppm?: number;
    co2_ppm?: number;
    h2s_ppm?: number;
    co_ppm?: number;
    oxygen_percent?: number;
    temperature_c?: number;
    humidity_percent?: number;
    methane_ppm?: number;
  };
}

type PredictionMode = 'realtime' | 'manual';

type GaugeSpec = {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  colorClass: string;
  trackClass: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const RadialGauge: React.FC<GaugeSpec> = ({ label, value, min, max, unit, colorClass, trackClass }) => {
  const size = 92;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safeMax = max === min ? min + 1 : max;
  const pct = (clamp(value, min, max) - min) / (safeMax - min);
  const dash = c * pct;

  return (
    <div className="flex items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            className={trackClass}
            fill="transparent"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            className={colorClass}
            fill="transparent"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
            {Number.isFinite(value) ? Math.round(value) : '--'}
            {unit ? <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 ml-1">{unit}</span> : null}
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600 text-center px-1">
            {label}
          </div>
        </div>
      </div>
    </div>
  );
};

type StatusLevel = 'Normal' | 'Warning' | 'Alert' | 'Critical';

function pctWithin(value: number, goodMin: number, goodMax: number) {
  if (!Number.isFinite(value)) return 0;
  const mid = (goodMin + goodMax) / 2;
  const half = (goodMax - goodMin) / 2;
  if (half === 0) return 1;
  return 1 - Math.min(1, Math.abs(value - mid) / half);
}

function normalizeHigh(value: number, warn: number, crit: number) {
  if (!Number.isFinite(value)) return 0;
  if (value <= warn) return 0;
  return clamp((value - warn) / (crit - warn), 0, 1);
}

function normalizeLow(value: number, warn: number, crit: number) {
  if (!Number.isFinite(value)) return 0;
  if (value >= warn) return 0;
  return clamp((warn - value) / (warn - crit), 0, 1);
}

function computeHarmfulIndex(params: {
  o2: number;
  co2: number;
  ch4: number;
  nh3: number;
  h2s: number;
  temp: number;
  hum: number;
}) {
  const co2Risk = normalizeHigh(params.co2, 800, 2000) * 25;
  const nh3Risk = normalizeHigh(params.nh3, 10, 50) * 25;
  const h2sRisk = normalizeHigh(params.h2s, 2, 10) * 15;
  const ch4Risk = normalizeHigh(params.ch4, 10, 50) * 15;
  const o2Risk = normalizeLow(params.o2, 19, 15) * 20;

  const tempBand = pctWithin(params.temp, 36.5, 38.5);
  const humBand = pctWithin(params.hum, 55, 70);
  const envRisk = (1 - (tempBand * 0.6 + humBand * 0.4)) * 10;

  const index = clamp(Math.round(co2Risk + nh3Risk + h2sRisk + ch4Risk + o2Risk + envRisk), 0, 100);
  const level: StatusLevel = index < 40 ? 'Normal' : index < 70 ? 'Warning' : index < 85 ? 'Alert' : 'Critical';
  const label = level === 'Normal' ? 'Safe' : level === 'Warning' ? 'Warning' : 'High Risk';
  return { index, level, label };
}

function statusChipClasses(level: StatusLevel) {
  switch (level) {
    case 'Normal':
      return 'bg-emerald-600 text-white';
    case 'Warning':
      return 'bg-amber-300 text-slate-900';
    case 'Alert':
      return 'bg-orange-500 text-white';
    case 'Critical':
      return 'bg-rose-600 text-white';
    default:
      return 'bg-slate-600 text-white';
  }
}

function chipFromValue(metric: string, value: number): StatusLevel {
  const v = Number(value);
  if (!Number.isFinite(v)) return 'Normal';

  if (metric === 'o2') {
    if (v < 16) return 'Critical';
    if (v < 18.5) return 'Warning';
    return 'Normal';
  }
  if (metric === 'co2') {
    if (v >= 2000) return 'Critical';
    if (v >= 1200) return 'Alert';
    if (v >= 800) return 'Warning';
    return 'Normal';
  }
  if (metric === 'ch4') {
    if (v >= 50) return 'Critical';
    if (v >= 20) return 'Alert';
    if (v >= 10) return 'Warning';
    return 'Normal';
  }
  if (metric === 'nh3') {
    if (v >= 50) return 'Critical';
    if (v >= 25) return 'Alert';
    if (v >= 10) return 'Warning';
    return 'Normal';
  }
  if (metric === 'temp') {
    if (v >= 41 || v <= 32) return 'Alert';
    if (v >= 39.5 || v <= 35) return 'Warning';
    return 'Normal';
  }
  if (metric === 'hum') {
    if (v >= 85 || v <= 35) return 'Alert';
    if (v >= 75 || v <= 45) return 'Warning';
    return 'Normal';
  }

  return 'Normal';
}

const HarmfulIndexGauge: React.FC<{ value: number; label: string; level: StatusLevel }> = ({ value, label, level }) => {
  const w = 380;
  const h = 230;
  const cx = w / 2;
  const cy = 196;
  const r = 145;
  const thickness = 22;

  const safeValue = clamp(Number(value), 0, 100);

  const polar = (angleDeg: number, radius = r) => {
    const a = (Math.PI / 180) * angleDeg;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };

  const arc = (startAngle: number, endAngle: number, radius = r) => {
    const start = polar(startAngle, radius);
    const end = polar(endAngle, radius);
    const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  // Needle slides along the upper (back) side: from 180° (left, top) to 0° (right, top)
  const angle = Math.max(0, Math.min(180, 180 + (Math.max(0, Math.min(100, safeValue)) * 1.8)));
  const needleTip = polar(angle, r - 18);

  const badgeR = 74;
  const badgeStart = { x: cx - badgeR, y: cy };
  const badgeEnd = { x: cx + badgeR, y: cy };
  const badgePath = `M ${badgeStart.x} ${badgeStart.y} A ${badgeR} ${badgeR} 0 0 1 ${badgeEnd.x} ${badgeEnd.y} L ${badgeEnd.x} ${badgeEnd.y} L ${badgeStart.x} ${badgeStart.y} Z`;

  return (
    <div className="w-full flex flex-col items-center">
      <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-[420px] flex flex-col items-center">
        <div className="text-center font-bold text-lg text-slate-800 mb-2 tracking-tight">Harmful Index</div>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[380px]">
          {/* outer segmented arc */}
          <path d={arc(180, 120)} stroke="#22c55e" strokeWidth={thickness} fill="none" />
          <path d={arc(120, 60)} stroke="#f59e42" strokeWidth={thickness} fill="none" />
          <path d={arc(60, 0)} stroke="#ef4444" strokeWidth={thickness} fill="none" />

          {/* inner subtle arc */}
          <path d={arc(180, 0, r - 28)} stroke="#e5e7eb" strokeWidth={10} fill="none" />

          {/* segment labels */}
          <text x={polar(160, r + 12).x} y={polar(160, r + 12).y} textAnchor="middle" className="fill-slate-800" fontSize="15" fontWeight="bold">Safe</text>
          <text x={polar(90, r + 18).x} y={polar(90, r + 18).y} textAnchor="middle" className="fill-slate-800" fontSize="15" fontWeight="bold">Warning</text>
          <text x={polar(20, r + 12).x} y={polar(20, r + 12).y} textAnchor="middle" className="fill-slate-800" fontSize="15" fontWeight="bold">Danger</text>

          {/* needle - styled like image2 */}
          <g>
            {/* shadow */}
            <polygon
              points={
                `${cx - 7},${cy + 8} ${cx + 7},${cy + 8} ${needleTip.x},${needleTip.y}`
              }
              fill="#222"
              opacity="0.25"
              filter="url(#needleShadow)"
            />
            {/* main needle */}
            <polygon
              points={
                `${cx - 5},${cy + 5} ${cx + 5},${cy + 5} ${needleTip.x},${needleTip.y}`
              }
              fill="#111"
              stroke="#222"
              strokeWidth="1.5"
              opacity="0.95"
            />
            {/* needle base circle */}
            <circle cx={cx} cy={cy} r={10} fill="#222" />
            {/* SVG filter for shadow */}
            <defs>
              <filter id="needleShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.5" />
              </filter>
            </defs>
          </g>

          {/* center badge (numeric value) */}
          <path d={badgePath} fill="#222" opacity={0.97} />
          <text x={cx} y={cy + 14} textAnchor="middle" className="fill-white" fontSize="48" fontWeight="bold">
            {Math.round(safeValue)}
          </text>

          {/* small highlight ring */}
          <circle cx={cx} cy={cy} r={14} fill="transparent" stroke="#cbd5e1" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={3.5} fill="#fff" opacity={0.85} />
        </svg>
        {/* Risk status below gauge */}
        <div className="mt-2 text-center text-xl font-bold" style={{ color: '#ef4444' }}>
          {label === 'Safe' ? '' : label === 'Warning' ? 'Warning' : 'High Risk'}
        </div>
      </div>
    </div>
  );
};

const Predictions: React.FC = () => {
  const { userId } = useParams<{ userId?: string }>();
  const viewingAsAdmin = Boolean(userId);
  const { t } = useTranslation();
  const [mode, setMode] = useState<PredictionMode>('realtime');
  const [isPredicting, setIsPredicting] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [startDate, endDate] = dateRange;
  const [error, setError] = useState<string | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<any>(null);

  const formatHatchDate = (startDate: Date) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + 21);
    // Example output: "20 Mar 2026"
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const buildResultFromMl = (ml: any, fallbackLightLux?: number): PredictionResult => {
    const predictedLabel = Array.isArray(ml?.prediction) ? ml.prediction[0] : ml?.prediction;
    const label = String(predictedLabel || 'Normal condition');

    const classes: string[] = Array.isArray(ml?.classes) ? ml.classes.map((c: any) => String(c)) : [];
    const probabilitiesRow: number[] = Array.isArray(ml?.probabilities) && Array.isArray(ml.probabilities[0])
      ? ml.probabilities[0].map((p: any) => Number(p))
      : [];

    const idx = classes.findIndex((c) => c.toLowerCase() === label.toLowerCase());
    const confidence = idx >= 0 && Number.isFinite(probabilitiesRow[idx]) ? probabilitiesRow[idx] : undefined;

    const normalized = label.toLowerCase();
    const feedbackStatus: PredictionResult['feedbackStatus'] =
      normalized.includes('normal') ? 'Good' :
      normalized.includes('mild') ? 'Normal' :
      'Risks';

    const hatchRate = typeof confidence === 'number' ? Math.round(confidence * 100) : 50;

    const confidenceNote = typeof confidence === 'number'
      ? ` (confidence: ${Math.round(confidence * 100)}%)`
      : '';

    const riskNotesBase = feedbackStatus === 'Good'
      ? 'Model indicates stable conditions.'
      : feedbackStatus === 'Normal'
      ? 'Model indicates mild stress; small adjustments recommended.'
      : 'Model indicates elevated risk; immediate action recommended.';

    const suggestionsByLabel: Record<string, PredictionResult['suggestions']> = {
      'normal condition': [
        { title: 'Maintain stability', desc: 'Keep temperature/humidity steady and avoid sudden changes.', type: 'success' },
        { title: 'Ventilation check', desc: 'Ensure airflow is consistent and filters are clean.', type: 'info' },
        { title: 'Sensor calibration', desc: 'Verify gas sensors are calibrated for accurate monitoring.', type: 'info' },
      ],
      'mild stress': [
        { title: 'Reduce stressors', desc: 'Adjust ventilation and reduce ammonia buildup by improving airflow.', type: 'warning' },
        { title: 'Optimize humidity', desc: 'Keep humidity within your target band to avoid respiratory discomfort.', type: 'info' },
        { title: 'Monitor trends', desc: 'Watch gas readings for upward trends and act early.', type: 'info' },
      ],
      'oxygen deficiency': [
        { title: 'Increase ventilation', desc: 'Boost fresh air intake and check vents/fans are working.', type: 'warning' },
        { title: 'Check fan & airflow', desc: 'Confirm cooling/ventilation fans are not blocked or cycling incorrectly.', type: 'warning' },
        { title: 'Recheck O₂ sensor', desc: 'Verify O₂ sensor placement and calibration.', type: 'info' },
      ],
      'respiratory irritation': [
        { title: 'Lower irritants', desc: 'Reduce NH₃ and H₂S by increasing airflow and cleaning the environment.', type: 'warning' },
        { title: 'Stabilize temperature', desc: 'Avoid high temperature spikes that worsen air quality impact.', type: 'info' },
        { title: 'Inspect gas sensor drift', desc: 'Check for abnormal readings and recalibrate sensors.', type: 'info' },
      ],
      'eye irritation': [
        { title: 'Reduce ammonia', desc: 'Improve ventilation and remove sources of ammonia accumulation.', type: 'warning' },
        { title: 'Humidity balance', desc: 'Avoid overly dry air; keep humidity in the recommended range.', type: 'info' },
        { title: 'Routine cleaning', desc: 'Clean litter/areas contributing to irritant gases.', type: 'info' },
      ],
      'reduced growth': [
        { title: 'Improve air quality', desc: 'Lower CO₂/NH₃ with better ventilation and regular cleaning.', type: 'warning' },
        { title: 'Ensure stable conditions', desc: 'Avoid temperature swings; keep humidity consistent.', type: 'info' },
        { title: 'Review power stability', desc: 'Ensure power source changes don’t disrupt ventilation/cooling.', type: 'info' },
      ],
      'low egg production': [
        { title: 'Stabilize environment', desc: 'Keep temperature/humidity stable and reduce gas exposure.', type: 'warning' },
        { title: 'Check lighting', desc: 'Confirm light intensity is appropriate for your setup.', type: 'info' },
        { title: 'Ventilation schedule', desc: 'Maintain steady airflow, especially during peak heat.', type: 'info' },
      ],
    };

    const suggestions = suggestionsByLabel[normalized] || suggestionsByLabel['mild stress'];

    // Disease/risk fields for UI
    let riskLevel = 'Low';
    if (feedbackStatus === 'Normal') riskLevel = 'Medium';
    if (feedbackStatus === 'Risks') riskLevel = 'High';
    const riskPercent = typeof confidence === 'number' ? Math.round(confidence * 100) : undefined;

    return {
      hatchRate: `${hatchRate}%`,
      hatchDate: formatHatchDate(new Date()),
      feedbackStatus,
      riskNotes: `Disease prediction confidence: ${riskPercent !== undefined ? riskPercent + '%' : '--'}`,
      suggestions,
      diseaseName: label,
      riskLevel,
      riskPercent,
      lightLux: Number(ml?.inputs?.Light_lux ?? ml?.inputs?.light_lux ?? fallbackLightLux ?? 0),
      sensorReadings: {
        ammonia_ppm: Number(ml?.inputs?.Ammonia_ppm ?? ml?.inputs?.ammonia_ppm ?? 0),
        co2_ppm: Number(ml?.inputs?.CO2_ppm ?? ml?.inputs?.co2_ppm ?? 0),
        h2s_ppm: Number(ml?.inputs?.H2S_ppm ?? ml?.inputs?.h2s_ppm ?? 0),
        co_ppm: Number(ml?.inputs?.CO_ppm ?? ml?.inputs?.co_ppm ?? 0),
        oxygen_percent: Number(ml?.inputs?.Oxygen_percent ?? ml?.inputs?.oxygen_percent ?? 0),
        temperature_c: Number(ml?.inputs?.Temperature_C ?? ml?.inputs?.temperature_c ?? 0),
        humidity_percent: Number(ml?.inputs?.Humidity_percent ?? ml?.inputs?.humidity_percent ?? 0),
        methane_ppm: Number(ml?.inputs?.Methane_ppm ?? ml?.inputs?.methane_ppm ?? 0),
      },
    };
  };

  useEffect(() => {
    const sensorPath = userId ? `/sensors?userId=${encodeURIComponent(userId)}` : '/sensors';
    const unsubscribe = subscribeToData(sensorPath, (val) => {
      setLiveSnapshot(val || null);
    }, 5000);

    return () => unsubscribe();
  }, [userId]);

  // Socket.IO for real-time predictions
  useEffect(() => {
    // Get authentication token for Socket.IO connection
    const token = localStorage.getItem('authToken');
    if (!token) return;

    // Determine socket URL from API base
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const socketUrl = apiBase.replace(/\/api\/?$/, '');

    // Connect to Socket.IO server
    const socket: Socket = io(socketUrl, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', async () => {
      console.log('✓ Connected to predictions server');
      // Join predictions room for current user (param for admin view)
      if (userId) {
        socket.emit('join-predictions', userId);
        return;
      }

      // If no userId param, fetch current authenticated user and join their room
      try {
        const me = await auth.getCurrentUser();
        if (me && me.uid) {
          socket.emit('join-predictions', String(me.uid));
        }
      } catch (e) {
        // ignore
      }
    });

    // Listen for real-time predictions from both the room-scoped and global emit paths.
    const handlePrediction = (prediction: any) => {
      console.log('📊 Real-time prediction received:', prediction);
      setResult(buildResultFromMl(prediction));
    };

    socket.on('prediction', handlePrediction);
    socket.on('real-time-prediction', handlePrediction);

    socket.on('disconnect', () => {
      console.log('✗ Disconnected from predictions server');
    });

    return () => {
      socket.off('prediction', handlePrediction);
      socket.off('real-time-prediction', handlePrediction);
      socket.disconnect();
    };
  }, [userId]);

  const handleManualPredict = async () => {
    setMode('manual');
    setIsPredicting(true);
    setError(null);

    if (!startDate || !endDate) {
      setError('Please select a date range.');
      setIsPredicting(false);
      return;
    }

    try {
      const startISO = startDate.toISOString().slice(0, 19).replace('T', ' ');
      const endISO = endDate.toISOString().slice(0, 19).replace('T', ' ');
      const mlResponse = await db.predictChickHealth({
        mode: 'historical',
        startDate: startISO,
        endDate: endISO,
        userId: viewingAsAdmin ? userId : undefined,
      });
      const base = buildResultFromMl(mlResponse);
      setResult({
        ...base,
        hatchDate: formatHatchDate(startDate),
      });
    } catch (err: any) {
      console.error('Manual Prediction ML Error:', err);
      setError(t('error'));
    } finally {
      setIsPredicting(false);
    }
  };

  const handleRealtimePredict = async () => {
    setMode('realtime');
    setIsPredicting(true);
    setError(null);

    try {
      const mlResponse = await db.predictChickHealth({
        mode: 'realtime',
        userId: viewingAsAdmin ? userId : undefined,
      });

      const fallbackLightLux = Number(snapshot?.sensors?.light_lux ?? snapshot?.light_lux ?? 520);
      const data = buildResultFromMl(mlResponse, fallbackLightLux);
      setResult(data);

      const normalizedStatus = String(data?.feedbackStatus || '').toLowerCase();
      const hatchRateValue = Number(String(data?.hatchRate || '').replace(/[^0-9.]/g, ''));
      const warningCount = Array.isArray(data?.suggestions)
        ? data.suggestions.filter((item: any) => item?.type === 'warning').length
        : 0;

      const isTotallyBad =
        normalizedStatus.includes('risk') ||
        (Number.isFinite(hatchRateValue) && hatchRateValue < 70) ||
        warningCount >= 2;

      if (isTotallyBad) {
        try {
          await db.sendPredictionAlertEmail({
            userId,
            prediction: {
              feedbackStatus: data?.feedbackStatus || 'Risks',
              hatchRate: data?.hatchRate || 'N/A',
              riskNotes: data?.riskNotes || 'Critical real-time prediction detected.',
            },
            snapshot: {
              temperature: liveSnapshot?.temperature ?? 0,
              humidity: liveSnapshot?.humidity ?? 0,
              lightLux: liveSnapshot?.light_lux ?? 0,
              powerSource: String(liveSnapshot?.power?.source ?? 'Solar'),
            },
          });
        } catch (notifyError) {
          console.error('Prediction email notification failed:', notifyError);
        }
      }
    } catch (err: any) {
      console.error("Real-time Prediction ML Error:", err);
      setError(t('error'));
    } finally {
      setIsPredicting(false);
    }
  };

  const snapshot = Array.isArray(liveSnapshot) ? liveSnapshot[0] : liveSnapshot;
  const history: Array<any> = Array.isArray(snapshot?.history) ? snapshot.history : [];

  const asOf = snapshot?.asOf ? new Date(snapshot.asOf) : null;

  const currentTemperature = Number(snapshot?.sensors?.temperature ?? snapshot?.temperature ?? 37.5);
  const currentHumidity = Number(snapshot?.sensors?.humidity ?? snapshot?.humidity ?? 62);
  const currentLight = Number(snapshot?.sensors?.light_lux ?? snapshot?.light_lux ?? 520);

  const currentCO2 = Number(snapshot?.gas?.CO2 ?? snapshot?.gas?.co2 ?? 500);
  const currentNH3 = Number(snapshot?.gas?.NH3 ?? snapshot?.gas?.nh3 ?? 5);
  const currentO2 = Number(snapshot?.gas?.O2 ?? snapshot?.gas?.o2 ?? 20.5);
  const currentH2S = Number(snapshot?.gas?.H2S ?? snapshot?.gas?.h2s ?? 2);
  const currentCH4 = Number(snapshot?.gas?.CH4 ?? snapshot?.gas?.ch4 ?? 10);

  // Consider data stale if older than this threshold (ms)
  const DATA_FRESH_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
  const isDataFresh = asOf ? (Date.now() - asOf.getTime() <= DATA_FRESH_THRESHOLD_MS) : false;

  const displayNumber = (value: number, digits: number) => {
    if (!isDataFresh) return '00';
    return Number.isFinite(value) ? value.toFixed(digits) : '00';
  };

  const harmful = computeHarmfulIndex({
    o2: currentO2,
    co2: currentCO2,
    ch4: currentCH4,
    nh3: currentNH3,
    h2s: currentH2S,
    temp: currentTemperature,
    hum: currentHumidity,
  });

  const fmt = (value: number, digits: number) => (Number.isFinite(value) ? value.toFixed(digits) : '--');

  return (
    <div className="min-h-screen bg-slate-900 py-6 px-4 font-['Poppins',_sans-serif] animate-fade-in transition-colors duration-500">
      <div className="w-full rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10">
        <div className="bg-gradient-to-b from-slate-900 to-slate-800 px-6 py-5 text-center">
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Welcome to Prediction Dashboard</h1>
          <p className="text-slate-200 text-sm font-bold mt-1">Data as of: {asOf ? asOf.toLocaleString() : '---'}</p>
          {viewingAsAdmin && (
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300/70 mt-2">Admin View: Selected user prediction data</p>
          )}
        </div>

        <div className="bg-slate-100 dark:bg-slate-950/40 p-4 md:p-5">
          {/* 2x2 Dashboard */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
            <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-white/10 shadow p-4">
              <h2 className="text-sm font-black text-slate-800 dark:text-white tracking-tight text-center mb-2">Gas Concentration Levels</h2>
              <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 6, right: 70, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fontWeight: 800 }} stroke="rgba(100,116,139,0.7)" />
                <YAxis tick={{ fontSize: 10, fontWeight: 800 }} stroke="rgba(100,116,139,0.7)" />
                <Tooltip contentStyle={{ borderRadius: 16, border: '1px solid rgba(148,163,184,0.25)' }} labelStyle={{ fontWeight: 900 }} />
                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="line" wrapperStyle={{ fontSize: 11, fontWeight: 800 }} />
                <Line type="monotone" dataKey="o2" name="O₂" stroke="#16a34a" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="co2" name="CO₂" stroke="#ef4444" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="ch4" name="Methane" stroke="#f97316" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="nh3" name="NH₃" stroke="#eab308" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
              </div>
              <div className="mt-1 text-center text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Time</div>
              <div className="mt-2 text-center text-sm font-bold text-amber-700">
                Light Intensity: <span className="font-black">{fmt(currentLight, 0)} lux</span>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-white/10 shadow p-4">
              <h2 className="text-sm font-black text-slate-800 dark:text-white tracking-tight text-center mb-2">Environmental Conditions</h2>
              <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 6, right: 70, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fontWeight: 800 }} stroke="rgba(100,116,139,0.7)" />
                <YAxis tick={{ fontSize: 10, fontWeight: 800 }} stroke="rgba(100,116,139,0.7)" />
                <Tooltip contentStyle={{ borderRadius: 16, border: '1px solid rgba(148,163,184,0.25)' }} labelStyle={{ fontWeight: 900 }} />
                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="line" wrapperStyle={{ fontSize: 11, fontWeight: 800 }} />
                <Line type="monotone" dataKey="temp" name="Temperature (°C)" stroke="#ef4444" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="hum" name="Humidity (%)" stroke="#2563eb" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-white/10 shadow p-4">
              <h2 className="text-sm font-black text-slate-800 dark:text-white tracking-tight text-center mb-2">Current Status</h2>
              <div className="space-y-2">
                {[
                  { label: 'Oxygen (O₂):', value: `${displayNumber(currentO2, 1)}%`, level: chipFromValue('o2', currentO2) },
                  { label: 'Carbon Dioxide (CO₂):', value: `${displayNumber(currentCO2, 0)} ppm`, level: chipFromValue('co2', currentCO2) },
                  { label: 'Methane (CH₄):', value: `${displayNumber(currentCH4, 0)} ppm`, level: chipFromValue('ch4', currentCH4) },
                  { label: 'Ammonia (NH₃):', value: `${displayNumber(currentNH3, 0)} ppm`, level: chipFromValue('nh3', currentNH3) },
                  { label: 'Temperature:', value: `${displayNumber(currentTemperature, 1)}°C`, level: chipFromValue('temp', currentTemperature) },
                  { label: 'Humidity:', value: `${displayNumber(currentHumidity, 0)}%`, level: chipFromValue('hum', currentHumidity) },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[1fr,90px,120px] gap-2 items-center rounded-xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2"
                  >
                    <div className="text-xs font-black text-slate-800 dark:text-white">{row.label}</div>
                    <div className="text-xs font-black text-slate-700 dark:text-slate-200 text-right">{row.value}</div>
                    <div className={`text-center text-xs font-black uppercase tracking-widest rounded-md py-2 ${statusChipClasses(row.level)}`}>{row.level}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Standalone Harmful Index block removed as requested */}
          </div>

          <div className="mt-4 text-center text-xs font-bold text-slate-600 dark:text-slate-300">
            Data auto-refresh every 5 seconds | Source: IoT Sensor Network
          </div>

          {/* Unified Prediction Block */}
          <div className="mt-5 bg-white/95 dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-white/10 shadow">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

              {/* Start: Manual + Real-time */}
              <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
                <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-tight mb-3 text-center">
                  Choose Prediction Mode
                </h3>
                <div className="mb-2 flex flex-col items-center">
                  <label className="text-xs font-bold mb-1">Select date range for historical prediction:</label>
                  <DatePicker
                    selectsRange
                    startDate={startDate}
                    endDate={endDate}
                    onChange={(update) => setDateRange(update)}
                    isClearable={true}
                    className="border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 bg-white placeholder-slate-400"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <button
                    onClick={handleManualPredict}
                    disabled={isPredicting}
                    className="w-full bg-blue-600 text-white py-3 rounded-md font-bold text-sm hover:bg-blue-500 transition-all shadow active:scale-[0.99] disabled:opacity-50"
                  >
                    {isPredicting && mode === 'manual' ? 'Predicting…' : 'Historical Prediction'}
                  </button>
                  <div className="w-full flex items-center justify-center bg-emerald-600 text-white rounded-md font-bold text-sm py-3 px-4">
                    Real-time predictions enabled — updates arrive automatically
                  </div>
                </div>
                <p className="mt-3 text-center text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  Real-time updates arrive automatically. Use Historical to run date-range predictions.
                </p>

                {/* Harmful Index Gauge below buttons */}
                <div className="mt-4">
                  <h4 className="text-center text-sm font-black text-slate-800 dark:text-white mb-1">Harmful Index</h4>
                  {/* Disease Prediction Result Panel */}
                  {result ? (
                    <div className="bg-white rounded-2xl shadow-lg p-6 w-full flex flex-col items-center">
                      <div className="text-center font-bold text-lg text-slate-800 mb-3 tracking-tight">Prediction Result</div>
                      <div className="text-2xl font-black text-slate-900 mb-1">{result.diseaseName || 'No Disease Detected'}</div>
                      <div className="text-lg font-bold text-slate-700 mb-3">Risk Level: <span className="text-rose-600">{result.riskLevel || 'Low'}</span></div>
                      <div className="text-center text-base text-slate-700 mb-4 font-medium">{result.riskNotes}</div>
                      
                      {/* Sensor Readings Grid */}
                      {result.sensorReadings && (
                        <div className="w-full mt-4 pt-4 border-t border-slate-200">
                          <div className="text-sm font-black text-slate-600 mb-3 uppercase tracking-wide">Sensor Readings</div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-50 rounded-lg p-2">
                              <div className="text-xs text-slate-500 font-bold uppercase">Ammonia</div>
                              <div className="text-sm font-bold text-slate-900">{result.sensorReadings.ammonia_ppm?.toFixed(2) || '--'} ppm</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2">
                              <div className="text-xs text-slate-500 font-bold uppercase">CO₂</div>
                              <div className="text-sm font-bold text-slate-900">{result.sensorReadings.co2_ppm?.toFixed(2) || '--'} ppm</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2">
                              <div className="text-xs text-slate-500 font-bold uppercase">H₂S</div>
                              <div className="text-sm font-bold text-slate-900">{result.sensorReadings.h2s_ppm?.toFixed(2) || '--'} ppm</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2">
                              <div className="text-xs text-slate-500 font-bold uppercase">Methane</div>
                              <div className="text-sm font-bold text-slate-900">{result.sensorReadings.methane_ppm?.toFixed(2) || '--'} ppm</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2">
                              <div className="text-xs text-slate-500 font-bold uppercase">Temperature</div>
                              <div className="text-sm font-bold text-slate-900">{result.sensorReadings.temperature_c?.toFixed(1) || '--'} °C</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2">
                              <div className="text-xs text-slate-500 font-bold uppercase">Humidity</div>
                              <div className="text-sm font-bold text-slate-900">{result.sensorReadings.humidity_percent?.toFixed(1) || '--'} %</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2">
                              <div className="text-xs text-slate-500 font-bold uppercase">Oxygen</div>
                              <div className="text-sm font-bold text-slate-900">{result.sensorReadings.oxygen_percent?.toFixed(2) || '--'} %</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2">
                              <div className="text-xs text-slate-500 font-bold uppercase">Light</div>
                              <div className="text-sm font-bold text-slate-900">{result.lightLux?.toFixed(2) || '--'} lux</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl shadow-lg p-6 w-full flex flex-col items-center">
                      <div className="text-center font-bold text-lg text-slate-800 mb-2 tracking-tight">Prediction Result</div>
                      <div className="text-slate-400 text-xl">No prediction available</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Parallel: Results + Recommendations */}
              <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <Sparkles size={72} className="text-emerald-500" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 relative z-10">
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-3">
                    <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-600 shadow-sm">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Prediction</div>
                      <div className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{`Prediction Result: ${result ? (result.diseaseName || 'No Disease Detected') : '---'}`}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-3">
                    <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-600 shadow-sm">
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t('hatch_success_probability')}</div>
                      <div className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{result ? (Number.isFinite(result.riskPercent) ? `${result.riskPercent}%` : result.hatchRate) : '---'}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 relative z-10">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl text-emerald-600">
                    <Lightbulb size={18} />
                  </div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">{t('technical_ai_recommendations')}</h4>
                </div>

                {result ? (
                  <div className="space-y-3 relative z-10">
                    {result.suggestions.map((s, i) => (
                      <SuggestionItem key={i} type={s.type} title={s.title} desc={s.desc} />
                    ))}
                  </div>
                ) : (
                  <div className="relative z-10 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-white/5 px-4 py-6 text-center">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">{t('awaiting_data')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SuggestionItem = ({ type, title, desc }: { type: 'success' | 'warning' | 'info', title: string, desc: string }) => {
  const styles = {
    success: "bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-100 dark:border-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    warning: "bg-amber-50/50 dark:bg-amber-500/5 border-amber-100 dark:border-amber-500/10 text-amber-700 dark:text-amber-400",
    info: "bg-indigo-50/50 dark:bg-indigo-500/5 border-indigo-100 dark:border-indigo-500/10 text-indigo-700 dark:text-indigo-400"
  };

  return (
    <div className={`p-6 rounded-[2rem] border transition-all hover:scale-[1.01] hover:shadow-lg ${styles[type]}`}>
      <div className="flex items-start gap-4">
        <div className="mt-1 flex-shrink-0 p-2 bg-white dark:bg-slate-900 rounded-xl shadow-sm">
           <Sparkles size={18} />
        </div>
        <div>
          <h4 className="font-black text-base mb-1 tracking-tight">{title}</h4>
          <p className="text-sm opacity-80 leading-relaxed font-medium">{desc}</p>
        </div>
      </div>
    </div>
  );
};

export default Predictions;