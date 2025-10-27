import { ReactNode } from 'react';

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  highlights?: string[];
}

export default function FeatureCard({ icon, title, description, highlights }: FeatureCardProps) {
  return (
    <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-0">
      <div className="m-4 rounded-md p-5 bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 transition-all border border-slate-700/50">
        <div className="text-primary text-4xl mb-4">
          {icon}
        </div>
        <h3 className="text-xl font-bold mb-3 text-white">
          {title}
        </h3>
        <p className="text-slate-200 mb-4">
          {description}
        </p>
        {highlights && highlights.length > 0 && (
          <ul className="space-y-2">
            {highlights.map((highlight, index) => (
              <li key={index} className="text-sm text-slate-200/90 flex items-start">
                <span className="text-primary mr-2">✓</span>
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
