import React from 'react';

interface BulletListProps {
  items: string[];
  className?: string;
}

export const BulletList: React.FC<BulletListProps> = ({ items, className = '' }) => (
  <ul className={`space-y-3 ${className}`}>
    {items.map((item, idx) => (
      <li key={idx} className="flex items-center gap-3 font-semibold text-slate-300">
        <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block"></span>
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

export default BulletList;
