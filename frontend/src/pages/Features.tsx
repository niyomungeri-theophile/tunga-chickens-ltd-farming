
import React from 'react';
import { Activity, LayoutDashboard, Sun, Bell, Settings, Database } from 'lucide-react';

const Features: React.FC = () => {
  const features = [
    {
      icon: <Activity className="text-emerald-600" size={32} />,
      title: "Real-time Monitoring",
      description: "Continuous tracking of thermal conditions and air quality with 10-second update intervals."
    },
    {
      icon: <Settings className="text-emerald-600" size={32} />,
      title: "Automated Control",
      description: "Smart algorithms trigger fans and heaters based on bird age and external weather conditions."
    },
    {
      icon: <Sun className="text-emerald-600" size={32} />,
      title: "Solar Integration",
      description: "Harnesses renewable energy with intelligent load balancing and grid fall-back mechanisms."
    },
    {
      icon: <LayoutDashboard className="text-emerald-600" size={32} />,
      title: "Farm Management",
      description: "Centralized hub for inventory tracking, feed consumption logs, and weight gain projections."
    },
    {
      icon: <Bell className="text-emerald-600" size={32} />,
      title: "Predictive Alerts",
      description: "SMS and email notifications for abnormal events such as power failure or humidity spikes."
    },
    {
      icon: <Database className="text-emerald-600" size={32} />,
      title: "Data Analytics",
      description: "Historical data export for farm evaluators and academic research purposes."
    }
  ];

  return (
    <div className="py-20 bg-slate-50 animate-in fade-in duration-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-extrabold text-slate-900 mb-4">Core Features</h1>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Our platform provides a comprehensive suite of tools designed to optimize every aspect of modern poultry management.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, idx) => (
            <div key={idx} className="bg-white p-10 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all group hover:-translate-y-2">
              <div className="mb-6 inline-block p-4 bg-emerald-50 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                {f.icon}
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-4 group-hover:text-emerald-600 transition-colors">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-20 bg-emerald-600 rounded-[3rem] p-10 md:p-16 flex flex-col md:flex-row items-center gap-10">
          <div className="flex-1 text-white">
            <h2 className="text-3xl font-bold mb-4">Ready to Modernize Your Farm?</h2>
            <p className="text-emerald-100 opacity-90 mb-8">
              Join the growing community of smart farmers utilizing our IoT platform to secure their investments and improve animal welfare.
            </p>
            <button className="bg-white text-emerald-600 px-8 py-3 rounded-xl font-bold hover:bg-emerald-50 transition-colors">
              Request Demo
            </button>
          </div>
          <div className="flex-1 w-full flex justify-center">
            <img 
              src="https://picsum.photos/seed/dashboard/600/400" 
              alt="Dashboard Preview" 
              className="rounded-2xl shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Features;
