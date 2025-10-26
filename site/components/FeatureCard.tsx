import { ReactNode } from 'react';

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  highlights?: string[];
}

export default function FeatureCard({ icon, title, description, highlights }: FeatureCardProps) {
  return (
    <div className="card">
      <div className="text-primary text-4xl mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
        {title}
      </h3>
      <p className="text-gray-700 dark:text-gray-300 mb-4">
        {description}
      </p>
      {highlights && highlights.length > 0 && (
        <ul className="space-y-2">
          {highlights.map((highlight, index) => (
            <li key={index} className="text-sm text-gray-700 dark:text-gray-300 flex items-start">
              <span className="text-primary mr-2">✓</span>
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
