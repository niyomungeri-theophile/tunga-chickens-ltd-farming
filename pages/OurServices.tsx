import React from 'react';
import { BookOpen, Cpu, Wifi, Globe, ShoppingCart, Settings, ShieldCheck, Book, Shield, CreditCard } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

const services = [
  { icon: Cpu, title: 'Smart Egg Incubator — Fully Automated', desc: 'Machine Learning, IoT sensors and GSM connectivity for automated temperature, humidity control and hatch optimization.' },
  { icon: ShieldCheck, title: 'Biosecurity & Disease Prediction', desc: 'AI-driven disease risk prediction and early-warning alerts to protect flock health.' },
  { icon: Settings, title: 'Farm Management System', desc: 'Manage flocks, schedules, inventory, treatments and generate operational reports.' },
  { icon: BookOpen, title: 'Poultry Feeding Guidance', desc: 'Tailored feeding plans by chick type, age and flock size with daily feed targets and nutrient guidance.' },
  { icon: Globe, title: 'IoT Deployment & Monitoring', desc: 'Connected sensors and gateways with realtime dashboards for remote visibility and control.' },
  { icon: CreditCard, title: 'Integration & Support', desc: 'Payment, SMS/GSM integrations and installation support for a production-ready deployment.' },
];

const OurServices: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-black text-white py-16">
      <div className="max-w-6xl mx-auto px-6">
        <h1 className="text-4xl md:text-5xl font-black text-center">{t('our_services')}</h1>
        <div className="mx-auto w-40 h-1 bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500 my-6 rounded" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
          {services.map((s, idx) => {
            const Icon = s.icon as any;
            return (
              <div key={idx} className="bg-slate-900/80 border border-white/5 rounded-xl p-6 shadow-lg hover:scale-[1.02] transform transition-all">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-md bg-yellow-900/30 text-yellow-400 flex items-center justify-center">
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{s.title}</h3>
                    <p className="mt-2 text-slate-300 text-sm">{s.desc}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 p-6 bg-slate-800/60 border border-yellow-800/20 rounded-lg">
          <strong className="block mb-2">Note:</strong>
          <p className="text-slate-300">For enquiries, installations or demo requests please contact our sales team or use the request form so we can schedule an assessment and provide a quotation.</p>
        </div>
      </div>
    </div>
  );
};

export default OurServices;
