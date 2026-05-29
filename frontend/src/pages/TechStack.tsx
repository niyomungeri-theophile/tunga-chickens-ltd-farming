
import React from 'react';
import { Cpu, Code, Wifi, Database, Layers } from 'lucide-react';

const TechStack: React.FC = () => {
  return (
    <div className="py-20 animate-in fade-in duration-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-16">
          <h1 className="text-4xl font-extrabold text-slate-900 mb-4">Technology Stack</h1>
          <p className="text-slate-600 max-w-3xl">
            A robust combination of industrial-grade hardware and modern software frameworks ensures high reliability and scalability.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Hardware */}
          <section className="bg-slate-50 p-10 rounded-[2.5rem] border border-slate-200">
            <div className="flex items-center gap-3 mb-8">
              <Cpu className="text-emerald-600" />
              <h2 className="text-2xl font-bold text-slate-800">Hardware Layer</h2>
            </div>
            <div className="space-y-6">
              <TechItem 
                title="ESP32 Microcontroller" 
                desc="A dual-core processor with integrated WiFi and Bluetooth for low-latency communication."
              />
              <TechItem 
                title="DHT22 & MQ-135 Sensors" 
                desc="Precision environmental monitoring for thermal and air quality metrics."
              />
              <TechItem 
                title="Solar Inverter System" 
                desc="Hybrid 500W pure sine wave inverter for clean energy distribution."
              />
              <TechItem 
                title="4-Channel Relay Module" 
                desc="Interface for high-voltage heating and ventilation fans."
              />
            </div>
          </section>

          {/* Software */}
          <section className="bg-emerald-50 p-10 rounded-[2.5rem] border border-emerald-100">
            <div className="flex items-center gap-3 mb-8">
              <Code className="text-emerald-600" />
              <h2 className="text-2xl font-bold text-slate-800">Software Layer</h2>
            </div>
            <div className="space-y-6">
              <TechItem 
                title="React & Tailwind CSS" 
                desc="Frontend framework for a responsive, modern administrative dashboard."
              />
              <TechItem 
                title="Node.js & MQTT" 
                desc="Backbone for real-time messaging and device orchestration."
              />
              <TechItem 
                title="Cloud Hosting" 
                desc="Google Cloud Platform (GCP) for data persistence and secure API endpoints."
              />
              <TechItem 
                title="Over-The-Air (OTA)" 
                desc="Remote firmware updates to ensure the system evolves without physical intervention."
              />
            </div>
          </section>
        </div>

        {/* Protocols */}
        <section className="mt-20 text-center">
          <h3 className="text-2xl font-bold text-slate-800 mb-10 flex items-center justify-center gap-3">
            <Wifi className="text-emerald-600" /> Communication Protocols
          </h3>
          <div className="flex flex-wrap justify-center gap-4">
            {['MQTT', 'HTTP/REST', 'JSON', 'WPA2/AES', 'TCP/IP'].map(p => (
              <span key={p} className="px-6 py-3 bg-white border border-slate-200 rounded-full text-sm font-bold text-slate-600 shadow-sm hover:border-emerald-500 hover:text-emerald-600 transition-colors cursor-default">
                {p}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

const TechItem = ({ title, desc }: { title: string, desc: string }) => (
  <div className="group">
    <h4 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
      {title}
    </h4>
    <p className="text-slate-500 text-sm pl-4 leading-relaxed group-hover:text-slate-700 transition-colors">{desc}</p>
  </div>
);

export default TechStack;
