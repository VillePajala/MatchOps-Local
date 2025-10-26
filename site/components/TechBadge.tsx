interface TechBadgeProps {
  name: string;
}

export default function TechBadge({ name }: TechBadgeProps) {
  return (
    <div className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 text-center">
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
        {name}
      </span>
    </div>
  );
}
