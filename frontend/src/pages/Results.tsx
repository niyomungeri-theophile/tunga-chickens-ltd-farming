
import React from 'react';
import { CheckCircle2, TrendingUp, HeartPulse, Leaf, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const Results: React.FC = () => {
  const data = [
    { name: 'Traditional', mortality: 15, cost: 100 },
    { name: 'Eco-Smart', mortality: 3, cost: 45 },
  ];

  return (
    <div className="py-20 animate-in fade-in duration-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-16">
          <h1 className="text-4xl font-extrabold text-slate-900 mb-4">Expected Outcomes</h1>
          <p className="text-slate-600 max-w-2xl">
            Empirical projections based on prototype testing and industry standards in smart agriculture.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-24">
          <div className="space-y-8">
            <ResultItem 
              icon={<HeartPulse className="text-emerald-500" />}
              title="80% Reduction in Mortality"
              desc="Optimized brooder heating ensures a stable internal environment, drastically reducing early-stage chick fatalities."
            />
            <ResultItem 
              icon={<TrendingUp className="text-emerald-500" />}
              title="Improved Feed Conversion Ratio (FCR)"
              desc="Stress-free birds grow faster and process nutrients more efficiently, leading to shorter production cycles."
            />
            <ResultItem 
              icon={<BarChart3 className="text-emerald-500" />}
              title="55% Operational Savings"
              desc="The switch from charcoal to solar significantly offsets monthly energy expenses and manual labor costs."
            />
            <ResultItem 
              icon={<Leaf className="text-emerald-500" />}
              title="Sustainability Goals"
              desc="Contribution to UN Sustainable Development Goals (SDGs) by reducing agricultural carbon footprint."
            />
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100">
            <h3 className="text-xl font-bold text-slate-800 mb-8 text-center">Mortality Rate Comparison (%)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="mortality" radius={[8, 8, 0, 0]}>
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#94a3b8' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-center text-slate-400 mt-6 italic">
              *Projections based on a 1000-bird capacity house.
            </p>
          </div>
        </div>

        <section className="bg-slate-900 rounded-[3rem] p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-8">Impact on Animal Welfare</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="p-6 border border-slate-800 rounded-2xl">
              <h4 className="text-emerald-400 font-bold mb-2">Clean Air</h4>
              <p className="text-sm text-slate-400">Elimination of smoke and harmful gases improves bird respiratory health.</p>
            </div>
            <div className="p-6 border border-slate-800 rounded-2xl">
              <h4 className="text-emerald-400 font-bold mb-2">Stable Heat</h4>
              <p className="text-sm text-slate-400">Zero temperature fluctuations reduces stress and prevents huddling behavior.</p>
            </div>
            <div className="p-6 border border-slate-800 rounded-2xl">
              <h4 className="text-emerald-400 font-bold mb-2">Biosecurity</h4>
              <p className="text-sm text-slate-400">Less physical intervention reduces the risk of human-transferred pathogens.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const ResultItem = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
  <div className="flex gap-4 items-start">
    <div className="p-2 bg-emerald-50 rounded-lg mt-1">{icon}</div>
    <div>
      <h3 className="text-lg font-bold text-slate-800 mb-1">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
    </div>
  </div>
);

export default Results;
