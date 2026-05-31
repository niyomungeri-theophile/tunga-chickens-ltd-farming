import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Thermometer, FlaskConical,
  Sun, BarChart3, Fan
} from 'lucide-react';
import Announcements from '../components/Announcements';
import { db, subscribeToData } from '../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../contexts/LanguageContext';

const LOCK_MESSAGE = 'Hello your system was locked. Contact admin for support 0755233511, Eng TheophileNIYOMWUNGERI';

const formatRelativeTime = (value: string | null, nowMs: number) => {
  if (!value) return 'Waiting for first push';

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Waiting for first push';

  const diffMs = nowMs - timestamp.getTime();
  const safeDiff = Math.max(0, diffMs);
  const totalSeconds = Math.floor(safeDiff / 1000);

  if (totalSeconds < 5) return 'Just now';
  if (totalSeconds < 60) return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'} ago`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'} ago`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours} hour${totalHours === 1 ? '' : 's'} ago`;

  const totalDays = Math.floor(totalHours / 24);
  return `${totalDays} day${totalDays === 1 ? '' : 's'} ago`;
};

const FarmerDashboard: React.FC<{ user: any }> = ({ user }) => {
  const { userId } = useParams<{ userId?: string }>();
  const viewingAsAdmin = Boolean(userId);
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [viewedUser, setViewedUser] = useState<any>(null);
  const [assignedDeviceSerial, setAssignedDeviceSerial] = useState<string>('');
  const [lockedMessage, setLockedMessage] = useState('');
  const [data, setData] = useState<any>({
    sensors: { temperature: 37.5, humidity: 62, light_lux: 520 },
    power: { source: 'Solar', voltage: 12.8, current: 2.1, totalEnergy_kWh: 4.5, consumed_kWh: 1.2, batteryLevel: 92 },
    gas: { CO2: 412, NH3: 5, CH4: 0.2, O2: 20.8, H2S: 0.1, LPG: 0.1 },
    connected: false
  });
  const [history, setHistory] = useState<any[]>([]);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const isLocked = Boolean(lockedMessage);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!viewingAsAdmin && String(user?.status || '').toLowerCase() === 'inactive') {
      setLockedMessage(LOCK_MESSAGE);
    }
  }, [user?.status, viewingAsAdmin]);

  useEffect(() => {
    if (isLocked) return;
    const sensorPath = userId ? `/sensors?userId=${encodeURIComponent(userId)}` : '/sensors';
    const unsubscribe = subscribeToData(sensorPath, (val) => {
      if (!val) return;
      if (val.locked) {
        setLockedMessage(val.message || LOCK_MESSAGE);
        return;
      }
      // Respect the connected flag from server when provided; default to true for backward compatibility
      const connected = typeof val.connected === 'boolean' ? val.connected : true;
      setData((prev: any) => ({ ...prev, ...val, connected }));
      if (Array.isArray(val.history)) {
        setHistory(val.history);
      } else if (Array.isArray(val.history) === false && Array.isArray(history) === false) {
        // keep existing history if none provided
      }
    }, 5000);
    return () => unsubscribe();
  }, [userId, isLocked]);

  useEffect(() => {
    if (!userId) {
      setViewedUser(null);
      return;
    }
    db.getUser(userId)
      .then((u) => {
        setViewedUser(u);
        const status = String(u?.status || 'active').toLowerCase();
        setLockedMessage(!viewingAsAdmin && status === 'inactive' ? LOCK_MESSAGE : '');
      })
      .catch((err: any) => {
        const message = String(err?.message || '');
        if (!viewingAsAdmin && (message.toLowerCase().includes('inactive') || message.toLowerCase().includes('locked'))) {
          setLockedMessage(message || LOCK_MESSAGE);
        }
        setViewedUser(null);
      });
  }, [userId, viewingAsAdmin]);

  useEffect(() => {
    if (viewingAsAdmin) {
      return;
    }

    db.getMyDevice()
      .then((result) => {
        const serial = result?.device?.deviceSerial || '';
        setAssignedDeviceSerial(serial);
      })
      .catch(() => {
        setAssignedDeviceSerial('');
      });
  }, [viewingAsAdmin]);

  const gas    = data.gas ?? {};
  const power  = data.power ?? {};
  const hasDataFlag = typeof data.hasData === 'boolean' ? data.hasData : true;
  const isOnlineFlag = typeof data.isOnline === 'boolean' ? data.isOnline : (data.connected === true);

  // When device is offline or no data, override displayed values to zeros and mark source as Offline
  const displaySensors = (hasDataFlag && isOnlineFlag) ? {
    temperature: data.sensors?.temperature ?? 37.5,
    humidity: data.sensors?.humidity ?? 62,
    light_lux: data.sensors?.light_lux ?? 520
  } : { temperature: 0, humidity: 0, light_lux: 0 };

  const displayGas = (hasDataFlag && isOnlineFlag) ? (data.gas ?? {}) : { CO2: 0, NH3: 0, CH4: 0, O2: 0, H2S: 0, LPG: 0 };

  const displayPower = (hasDataFlag && isOnlineFlag) ? (data.power ?? {}) : { source: 'OFFLINE', voltage: 0, current: 0, totalEnergy_kWh: 0, consumed_kWh: 0, cost_rwf: 0, cost_usd: 0, batteryLevel: 0 };

  const tempVal = Number(displaySensors.temperature);
  const humVal = Number(displaySensors.humidity);
  const luxVal = Number(displaySensors.light_lux);

  // expose simple names used throughout the component (avoid reference errors)
  const temp = tempVal;
  const hum = humVal;
  const lux = luxVal;

  const tempStatus = tempVal < 36 ? t('low') : tempVal > 39 ? t('high') : t('optimal');
  const humStatus = humVal < 55 ? t('low') : humVal > 70 ? t('high') : t('optimal');
  const luxStatus = luxVal < 200 ? t('low') : luxVal > 1000 ? t('high') : t('normal');
  const co2Val = Number(displayGas.CO2 ?? 0);
  const nh3Val = Number(displayGas.NH3 ?? 0);
  const lpgVal = Number(displayGas.LPG ?? displayGas.H2S ?? 0);
  const oxygenVal = Number(displayGas.O2 ?? 0);
  const thermalCritical = temp >= 39.5 || temp <= 35;
  const airCritical = co2Val >= 1000 || nh3Val >= 25 || lpgVal >= 5;
  const environmentalCritical = thermalCritical || airCritical;
  const aqiOk = !airCritical;
  const sourceRaw = (displayPower.source || 'OFFLINE') as string;
  const sourceUpper = sourceRaw.trim().toUpperCase();
  const isMainGrid = sourceUpper === 'GRID' || sourceUpper.includes('GRID');
  const isSolarSource = sourceUpper === 'SOLAR';
  const sourceLabel = isMainGrid ? 'MAIN GRID' : 'SOLAR';
  const voltage = Number(displayPower.voltage ?? 0);
  const current = Number(displayPower.current ?? 0);
  const batteryLevel = Math.max(0, Math.min(100, Number(displayPower.batteryLevel ?? displayPower.battery_level ?? 0)));
  const solarVoltageVal = isSolarSource ? Number(displayPower.solarVoltage ?? displayPower.solar_voltage ?? displayPower.voltage ?? 0) : 0;
  // Normalize current units: some devices report mA instead of A. If value seems large (>50), assume mA and convert to A.
  const rawSolarCurrent = Number(displayPower.solarCurrent ?? displayPower.solar_current ?? displayPower.current ?? 0);
  const solarCurrentVal = isSolarSource ? (rawSolarCurrent > 50 ? (rawSolarCurrent / 1000) : rawSolarCurrent) : 0;
  const latestSampleAt = data.asOf || data.lastSeen || data.power?.reading_time || data.sensors?.recorded_at || null;
  const latestSampleLabel = formatRelativeTime(latestSampleAt, nowTick);
  const heaterStatus = String(data.status?.heater || 'OFF').toUpperCase();
  const fanStatus = String(data.status?.fan || 'ON').toUpperCase();
  const rotatorStatus = String(data.status?.rotator || 'AUTO').toUpperCase();

  const statusColor = (s: string) => s === t('optimal') || s === t('normal') ? 'text-neon' : 'text-neon-dark';
  const chartData = history.length > 0
    ? history
    : [{
        time: 'Now',
        temp: tempVal,
        hum: humVal,
        light: luxVal,
        co2: Number(displayGas.CO2 ?? 0),
        nh3: Number(displayGas.NH3 ?? 0),
        o2: oxygenVal,
        lpg: lpgVal,
        voltage,
        current,
      }];
      console.log("is onolineflag :",isOnlineFlag )


  // Show only the announcement form (right side, full screen) if requested
  const userRole = (user?.role || localStorage.getItem('userRole') || '').toLowerCase();
  const authToken = localStorage.getItem('authToken') || '';
  if (showAnnouncementForm) {
    return (
      <div className="fixed inset-0 z-[200] flex bg-neon-bg">
        <div className="flex-1 hidden md:block" />
        <div className="w-full md:w-[480px] max-w-full h-full flex flex-col bg-neon-bg-alt border-l border-neon/20 shadow-2xl relative animate-slide-in-right">
          <button
            onClick={() => setShowAnnouncementForm(false)}
            className="absolute top-6 right-6 z-10 bg-neon text-neon-bg font-black rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:bg-white transition-all"
            aria-label="Close announcement form"
          >
            &times;
          </button>
          <div className="flex-1 flex items-center justify-center">
            <Announcements userRole={userRole} authToken={authToken} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 animate-fade-in transition-colors duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-neon tracking-tight">{t('live_telemetry_dashboard')}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm font-medium text-neon-dark">
            <div className={`w-2 h-2 rounded-full animate-pulse ${isOnlineFlag ? 'bg-neon' : 'bg-opacity-20'}`}></div>
            <span>{(viewingAsAdmin ? viewedUser?.deviceSerialNumber : assignedDeviceSerial || user?.deviceSerialNumber) || 'ECO-SMART'}</span>
            <span className="opacity-30">|</span>
            <span className={isOnlineFlag ? 'text-neon font-bold' : 'text-neon-dark font-bold'}>
              {isOnlineFlag ? t('online') : t('offline')}
            </span>
          </div>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-neon-dark">
            Last push/sample: {latestSampleLabel}

          </p>
          {viewingAsAdmin && (
            <p className="mt-2 text-xs font-black uppercase tracking-widest text-neon">
              Admin View: {viewedUser?.fullName || viewedUser?.email || userId}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 bg-neon-bg px-5 py-3 rounded-2xl shadow-sm border border-neon/20 self-start sm:self-auto">
          <div className="w-10 h-10 rounded-xl bg-neon/10 flex items-center justify-center text-neon font-black border border-neon/20 text-sm">
            {(viewedUser?.fullName?.charAt(0) || viewedUser?.email?.charAt(0) || user?.email?.charAt(0) || 'U').toUpperCase()}
          </div>
          <div>
            <p className="text-[10px] font-black text-neon-dark uppercase tracking-widest">{t('operator_role')}</p>
            <p className="text-sm font-black text-neon">{viewedUser?.fullName || viewedUser?.email?.split('@')[0] || user?.email?.split('@')[0]}</p>
          </div>
        </div>
      </header>

      <div className="space-y-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-neon-bg border border-neon/20 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical size={18} className="text-neon" />
              <h3 className="text-base font-black uppercase tracking-widest text-neon">{t('air_quality')}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl border border-neon/15 bg-neon/5 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-neon-dark">CO₂</p>
                <p className="text-2xl font-black text-neon mt-1">{Number(gas.CO2 ?? 0).toFixed(0)} <span className="text-base text-neon-dark">ppm</span></p>
              </div>
              <div className="rounded-xl border border-neon/15 bg-neon/5 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-neon-dark">NH₃</p>
                <p className="text-2xl font-black text-neon mt-1">{Number(gas.NH3 ?? 0).toFixed(1)} <span className="text-base text-neon-dark">ppm</span></p>
              </div>
              <div className="rounded-xl border border-neon/15 bg-neon/5 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-neon-dark">O₂</p>
                <p className="text-2xl font-black text-neon mt-1">{Number(gas.O2 ?? 0).toFixed(1)} <span className="text-base text-neon-dark">%</span></p>
              </div>
              <div className="rounded-xl border border-neon/15 bg-neon/5 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-neon-dark">LPG</p>
                <p className="text-2xl font-black text-neon mt-1">{lpgVal.toFixed(1)} <span className="text-base text-neon-dark">ppm</span></p>
              </div>
            </div>
            <p className="text-base font-black uppercase tracking-widest text-neon">
              {aqiOk ? t('good') : t('attention_needed')}
            </p>
          </div>

          <div className="bg-neon-bg border border-neon/20 rounded-3xl p-6 shadow-xl">
            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-neon/10 flex items-center justify-center">
                <Thermometer size={26} className="text-neon" />
              </div>
              <div className="text-right">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neon">Environmental Conditions</p>
                <p className={`text-sm font-black uppercase ${environmentalCritical ? 'text-[#ff4d4d]' : 'text-neon'}`}>
                  {environmentalCritical ? 'Critical Alert' : 'Stable'}
                </p>
              </div>
            </div>
            <p className="text-6xl font-black text-neon leading-none">{temp.toFixed(1)}°</p>
            <p className="text-lg font-black uppercase tracking-[0.2em] text-neon-dark mt-1">Celsius</p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl border border-neon/15 bg-neon/5 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-neon-dark">Humidity</p>
                <p className="text-xl font-black text-neon mt-1">{hum.toFixed(1)}%</p>
                <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${statusColor(humStatus)}`}>{humStatus}</p>
              </div>
              <div className="rounded-xl border border-neon/15 bg-neon/5 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-neon-dark">Light Intensity</p>
                <p className="text-xl font-black text-neon mt-1">{lux.toFixed(0)} lux</p>
                <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${statusColor(luxStatus)}`}>{luxStatus}</p>
              </div>
            </div>
          </div>

          <div className="bg-neon-bg border border-neon/20 rounded-3xl p-6 shadow-xl">
            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-neon/10 flex items-center justify-center">
                <Fan size={26} className="text-neon" />
              </div>
              <div className="text-right">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neon">Active Cooling</p>
                <p className="text-[11px] font-black uppercase tracking-[0.1em] text-neon-dark">Threshold: 30°C</p>
              </div>
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neon-dark">Cooling System</p>
            <p className="text-5xl font-black text-neon leading-tight mt-1">FAN</p>
            <p className="text-5xl font-black text-neon leading-tight">{fanStatus === 'ON' ? 'OPERATING' : 'STANDBY'}</p>
            <div className="flex gap-1.5 mt-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <span key={i} className={`h-5 w-2 rounded-full ${i < 6 ? 'bg-neon' : 'bg-opacity-20'}`} />
              ))}
            </div>
          </div>

          <div className="bg-neon-bg border border-neon/20 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-2">
                <Sun size={14} className="text-neon" />
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neon-dark">Active Supply</p>
              </div>
              <p className="inline-flex items-center justify-center w-[128px] h-9 rounded-lg text-sm font-black uppercase tracking-[0.12em] border text-neon bg-neon/10 border-neon/25">
                {sourceLabel}
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-[#39ff14]/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl p-3.5 border border-[#39ff14]/15 bg-[#39ff14]/5">
                  <p className="text-[10px] uppercase tracking-widest text-[#1a7a1a] mb-1">Solar Voltage</p>
                  <p className="text-base font-black text-[#39ff14]">{solarVoltageVal.toFixed(2)} V</p>
                </div>
                <div className="rounded-xl p-3.5 border border-[#39ff14]/15 bg-[#39ff14]/5">
                  <p className="text-[10px] uppercase tracking-widest text-[#1a7a1a] mb-1">Solar Current</p>
                  <p className="text-base font-black text-[#39ff14]">{solarCurrentVal.toFixed(2)} A</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="bg-[#020c02] p-5 sm:p-8 rounded-[2rem] shadow-sm border border-[#39ff14]/20">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="text-[#39ff14]" size={20} />
          <h3 className="text-base sm:text-lg font-black text-[#39ff14]">{t('all_parameters_graph')}</h3>
        </div>
        <div className="h-[320px] sm:h-[420px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#0a1f0a" />
              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#39ff14', fontSize: 11, fontWeight: 'bold' }} />

              <YAxis yAxisId="env" axisLine={false} tickLine={false} tick={{ fill: '#1a7a1a', fontSize: 11 }} />
              <YAxis yAxisId="gas" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#1a7a1a', fontSize: 11 }} />
              <YAxis yAxisId="elec" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#1a7a1a', fontSize: 10 }} hide />

              <Tooltip
                contentStyle={{
                  borderRadius: '16px',
                  backgroundColor: '#020c02',
                  border: '1px solid rgba(57,255,20,0.3)',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
                  color: '#39ff14',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700, color: '#39ff14' }} />

              <Line yAxisId="env" type="monotone" dataKey="temp" name={`${t('temperature')} (°C)`} stroke="#39ff14" strokeWidth={2.5} dot={false} />
              <Line yAxisId="env" type="monotone" dataKey="hum" name={`${t('humidity')} (%)`} stroke="#2dcc10" strokeWidth={2.5} dot={false} />
              <Line yAxisId="env" type="monotone" dataKey="light" name={`Light (lux)`} stroke="#56fa30" strokeWidth={2.5} dot={false} />

              <Line yAxisId="gas" type="monotone" dataKey="co2" name="CO₂ (ppm)" stroke="#1fdb05" strokeWidth={2.5} dot={false} />
              <Line yAxisId="gas" type="monotone" dataKey="nh3" name="NH₃ (ppm)" stroke="#66ff66" strokeWidth={2.5} dot={false} />
              <Line yAxisId="gas" type="monotone" dataKey="lpg" name="LPG (ppm)" stroke="#8cff6a" strokeWidth={2.5} dot={false} />
              <Line yAxisId="gas" type="monotone" dataKey="o2" name="O₂ (%)" stroke="#aaff55" strokeWidth={2.5} dot={false} />

              <Line yAxisId="elec" type="monotone" dataKey="voltage" name={`${t('voltage')} (V)`} stroke="#7bff5a" strokeWidth={2.5} dot={false} />
              <Line yAxisId="elec" type="monotone" dataKey="current" name={`${t('current')} (A)`} stroke="#a8ff8a" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5">
    <div className="flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-100">
      <span className="text-emerald-500">{icon}</span>
      <h3 className="text-sm font-black uppercase tracking-widest">{title}</h3>
    </div>
    {children}
  </div>
);

export default FarmerDashboard;