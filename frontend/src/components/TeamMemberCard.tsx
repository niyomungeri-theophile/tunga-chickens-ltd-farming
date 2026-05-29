import React from 'react';

interface TeamMemberCardProps {
  name: string;
  role: string;
  imageUrl?: string;
  description?: string;
}

const initialsFromName = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || 'E';
};

const TeamMemberCard: React.FC<TeamMemberCardProps> = ({ name, role, imageUrl, description }) => (
  <div className="relative overflow-hidden rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-100 dark:border-white/5 shadow-lg shadow-emerald-500/5 hover:shadow-emerald-500/15 transition-all duration-300 group">
    <div className="absolute inset-x-6 top-0 h-20 bg-gradient-to-b from-emerald-500/20 to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

    <div className="p-7 flex flex-col items-center text-center space-y-4 relative z-10">
      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-400 to-blue-600 p-[5px] shadow-md shadow-emerald-500/30">
        <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-115">
          {imageUrl ? (
            <img src={imageUrl} alt={name} className="w-full h-full object-cover rounded-full" />
          ) : (
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-300">
              {initialsFromName(name)}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{name}</div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-500/30">
          {role}
        </span>
      </div>

      {description && (
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xs">
          {description}
        </p>
      )}
    </div>
  </div>
);

export default TeamMemberCard;
