import React, { useEffect, useState } from 'react';
import { 
  Rocket, Eye, Brain, Smartphone, Sun, 
  Gauge, ShieldCheck, Layers, User, Code,
  ChevronRight, CheckCircle2, Info, Book, Target
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../contexts/LanguageContext';
import TeamMemberCard from '../components/TeamMemberCard';
import BulletList from '../components/BulletList';
import { db } from '../api';

const API_HOST = (import.meta.env.VITE_API_URL || '/api').replace(/\/api$/, '');

type TeamMember = {
  id: string;
  name: string;
  role: string;
  description?: string;
  image_url?: string;
  imageUrl?: string;
  display_order?: number;
};

const resolveImageUrl = (url?: string): string => {
  if (!url) return '';
  return url.startsWith('/uploads/') ? `${API_HOST}${url}` : url;
};

const About: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamError, setTeamError] = useState('');

  useEffect(() => {
    let mounted = true;
    db.getTeamMembers()
      .then((rows: TeamMember[]) => {
        if (!mounted) return;
        const sorted = [...(rows || [])].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        setTeamMembers(sorted);
      })
      .catch((error) => {
        console.error('Failed to load team members', error);
        if (mounted) setTeamError('Failed to load team members right now.');
      });
    return () => { mounted = false; };
  }, []);

  const fallbackTeam: TeamMember[] = [
    { id: 'fallback-1', name: 'Theophile NIYOMWUNGERI', role: t('electronics_engineer') },
    { id: 'fallback-2', name: 'Emmanuel TWAGIRAYEZU', role: t('systems_engineer') },
    { id: 'fallback-3', name: 'Emmanuel NSHUTI', role: t('fullstack_developer') },
  ];

  const displayedTeam = teamMembers.length ? teamMembers : fallbackTeam;

  return (
    <div className="py-12 px-6 md:px-12 font-['Poppins',_sans-serif] animate-fade-in min-h-screen transition-colors duration-500">
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-[10px] font-bold uppercase tracking-widest mb-6 border border-emerald-200 dark:border-emerald-500/20">
            <Info size={14} /> {t('documentation')}
          </div>
          <h1 className="text-2xl md:text-4xl font-black text-slate-900 dark:text-white mb-8 tracking-tighter">{t('project_overview_architecture')}</h1>
          <p className="text-xl text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed font-medium">
            {t('about_intro')}
          </p>
        </div>

        {/* The Problem & Goal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-24">
          <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] shadow-sm border border-slate-100 dark:border-white/5 transition-all">
            <div className="w-12 h-12 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-xl flex items-center justify-center mb-8 border border-rose-100 dark:border-rose-500/20">
              <Target size={24} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-6 tracking-tight">{t('the_problem')}</h3>
            <BulletList items={t('problem_points') as string[]} className="text-slate-600 dark:text-slate-400 leading-relaxed text-lg font-medium" />
          </div>
          <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] shadow-sm border border-slate-100 dark:border-white/5 transition-all">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center mb-8 border border-emerald-100 dark:border-emerald-500/20">
              <Book size={24} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-6 tracking-tight">{t('our_objective')}</h3>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-lg font-medium">
              {t('objective_text')}
            </p>
          </div>
        </div>

        {/* Technical Layers */}
        <div className="mb-32">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-16 text-center tracking-tight">{t('technical_layers')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <LayerCard 
              step="01" 
              title={t('perception_layer')} 
              items={["DHT22 (Temperature)", "MQ-135 (Air Quality)", "CO2 Sensor (Air Quality)", "O2 Sensor (Air Quality)", "LDR (Light Detection)"]} 
            />
            <LayerCard 
              step="02" 
              title={t('processing_layer')} 
              items={["ESP32 Dual-Core CPU", "Local display", "Local Alarm Triggers", "Email message to user"]} 
            />
            <LayerCard 
              step="03" 
              title={t('application_layer')} 
              items={["Farm Environmental Management", "Farm Air Quality", "Farm Management System", "Predictive Data Analytics"]} 
            />
          </div>
        </div>

        {/* Team Section */}
        <div className="mb-24">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-16 text-center tracking-tight">{t('project_contributors')}</h2>
          {teamError && (
            <div className="mb-6 text-center text-rose-500 text-sm">{teamError}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {displayedTeam.map((member) => (
              <TeamMemberCard
                key={member.id}
                name={member.name}
                role={member.role}
                imageUrl={resolveImageUrl(member.imageUrl || member.image_url)}
                description={member.description}
              />
            ))}
          </div>
        </div>

        {/* Call to Action */}
        <div className="bg-slate-900 dark:bg-slate-900 border border-white/5 p-16 rounded-[4rem] text-center shadow-2xl relative overflow-hidden mb-20 group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 blur-[100px] rounded-full group-hover:scale-125 transition-transform duration-700"></div>
          <h3 className="text-4xl font-black text-white mb-6 tracking-tighter">{t('ready_telemetry')}</h3>
          <p className="text-slate-400 mb-12 max-w-lg mx-auto text-lg">{t('telemetry_cta_text')}</p>
          <button 
            onClick={() => navigate('/login')}
            className="px-12 py-6 bg-emerald-500 text-slate-900 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-400 transition-all flex items-center gap-3 mx-auto shadow-2xl shadow-emerald-500/20 active:scale-[0.97]"
          >
            {t('enter_dashboard_portal')} <ChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
};

const LayerCard = ({ step, title, items }: { step: string, title: string, items: string[] }) => (
  <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-xl transition-all group">
    <div className="text-emerald-500 dark:text-emerald-400 font-black text-5xl mb-8 opacity-20 group-hover:opacity-40 transition-opacity">{step}</div>
    <h4 className="text-xl font-black text-slate-900 dark:text-white mb-8 tracking-tight">{title}</h4>
    <ul className="space-y-5">
      {items.map(item => (
        <li key={item} className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          {item}
        </li>
      ))}
    </ul>
  </div>
);

const ContributorCard = ({ name, role }: { name: string, role: string }) => (
  <div className="bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] text-center border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-lg transition-all">
    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-8 text-slate-300 dark:text-slate-600 border border-slate-100 dark:border-white/5">
      <User size={40} />
    </div>
    <h5 className="font-black text-slate-900 dark:text-white mb-3 text-lg tracking-tight">{name}</h5>
    <div className="inline-block px-4 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-emerald-100 dark:border-emerald-500/20">
      {role}
    </div>
  </div>
);

export default About;