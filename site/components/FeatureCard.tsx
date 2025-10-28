import { ReactNode } from 'react';

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  highlights?: string[];
}

export default function FeatureCard({ icon, title, description, highlights }: FeatureCardProps) {
  return (
    <div className="bg-slate-900/70 rounded-xl border border-slate-700/40 shadow-card hover:shadow-card-hover transition-shadow p-0">
      <div className="m-4 rounded-lg p-6 bg-gradient-to-br from-slate-600/40 to-slate-800/30 hover:from-slate-600/50 hover:to-slate-800/40 transition-all border border-slate-700/40">
        <div className="text-primary text-3xl md:text-4xl mb-4">
          {icon}
        </div>
        <h3 className="text-xl font-bold mb-2 text-white tracking-wide">
          {title}
        </h3>
        <p className="text-slate-200 mb-4 leading-relaxed">
          {description}
        </p>
        {highlights && highlights.length > 0 && (
          <ul className="list-checked space-y-2 text-slate-200/90">
            {highlights.map((highlight, index) => (
              <li key={index} className="text-sm"><span>{highlight}</span></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
