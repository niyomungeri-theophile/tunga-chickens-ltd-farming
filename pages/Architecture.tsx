
import React from 'react';
import { Thermometer, Droplets, Wind, Sun, Battery, Cloud, Laptop, Server } from 'lucide-react';

const Architecture: React.FC = () => {
  return (
    <div className="py-16 animate-in fade-in duration-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-16 text-center">
          <h1 className="text-4xl font-extrabold text-slate-900 mb-4">System Architecture</h1>
          <p className="text-slate-600 max-w-2xl mx-auto">
            A multi-layer integrated system connecting physical poultry environments to digital monitoring platforms.
          </p>
        </header>

        {/* Conceptual Diagram Placeholder */}
        <section className="mb-20">
          <div className="bg-white p-8 md:p-12 rounded-3xl shadow-lg border border-emerald-100">
            <h2 className="text-xl font-bold text-slate-800 mb-8 text-center uppercase tracking-widest text-emerald-600">System Flow Diagram</h2>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-center">
              <FlowBlock icon={<Sun size={32} />} title="Power Unit" list={['Solar Panel', 'Charge Controller', 'Battery Bank']} color="amber" />
              <div className="hidden lg:block h-0.5 bg-slate-200"></div>
              <FlowBlock icon={<Cpu size={32} />} title="Edge Layer" list={['Microcontroller', 'Sensor Array', 'Actuators']} color="emerald" />
              <div className="hidden lg:block h-0.5 bg-slate-200"></div>
              <FlowBlock icon={<Cloud size={32} />} title="Network Layer" list={['WiFi/LTE Module', 'MQTT Protocol', 'Secure Gateway']} color="blue" />
              <div className="hidden lg:block h-0.5 bg-slate-200"></div>
              <FlowBlock icon={<Laptop size={32} />} title="User Layer" list={['Web Dashboard', 'Alert System', 'Mobile App']} color="slate" />
            </div>
          </div>
        </section>

        {/* Detailed Components */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Sensors */}
          <section>
            <h3 className="text-2xl font-bold text-slate-800 mb-6 border-b-2 border-emerald-100 pb-2">IoT Sensor Array</h3>
            <div className="space-y-4">
              <SensorDetail 
                icon={<Thermometer className="text-red-500" />} 
                name="Temperature Sensor" 
                desc="Monitors brooder warmth within 0.1°C precision."
              />
              <SensorDetail 
                icon={<Droplets className="text-blue-500" />} 
                name="Humidity Sensor" 
                desc="Ensures optimal moisture levels to prevent respiratory issues."
              />
              <SensorDetail 
                icon={<Wind className="text-emerald-500" />} 
                name="Oxygen/CO2 Sensor" 
                desc="Detects stale air and hazardous gas accumulation."
              />
            </div>
          </section>

          {/* Power */}
          <section>
            <h3 className="text-2xl font-bold text-slate-800 mb-6 border-b-2 border-emerald-100 pb-2">Energy & Cloud Management</h3>
            <div className="space-y-6 text-slate-600 leading-relaxed">
              <p>
                The system utilizes a <strong>Hybrid Power Strategy</strong>. A primary 200W solar array charges a deep-cycle lithium battery bank during daylight hours. An automatic transfer switch (ATS) engages grid power only if battery levels drop below a critical threshold (30%).
              </p>
              <p>
                Data is processed locally on the edge device before being transmitted to an <strong>InfluxDB Time-Series Database</strong>. The Grafana-based dashboard provides visualizations of historical trends and current status.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

const FlowBlock = ({ icon, title, list, color }: { icon: React.ReactNode, title: string, list: string[], color: string }) => {
  const colors: Record<string, string> = {
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
  };
  return (
    <div className={`p-6 rounded-2xl border-2 ${colors[color]} text-center transition-transform hover:scale-105`}>
      <div className="mb-4 flex justify-center">{icon}</div>
      <h4 className="font-bold text-lg mb-3">{title}</h4>
      <ul className="text-xs space-y-1 opacity-80">
        {list.map(l => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );
};

const SensorDetail = ({ icon, name, desc }: { icon: React.ReactNode, name: string, desc: string }) => (
  <div className="flex items-center gap-4 bg-white p-5 rounded-xl shadow-sm border border-slate-100">
    <div className="p-3 bg-slate-50 rounded-full">{icon}</div>
    <div>
      <h5 className="font-bold text-slate-800">{name}</h5>
      <p className="text-sm text-slate-500">{desc}</p>
    </div>
  </div>
);

const Cpu = ({ size }: { size: number }) => <CpuIcon size={size} />;
const CpuIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M9 2v2"/><path d="M9 20v2"/><path d="M20 15h2"/><path d="M2 15h2"/><path d="M20 9h2"/><path d="M2 9h2"/></svg>
);

export default Architecture;
