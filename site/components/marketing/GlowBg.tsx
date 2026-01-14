interface GlowBgProps {
  color?: 'primary' | 'amber' | 'blue' | 'green';
  position?: 'center' | 'top-right' | 'bottom-left' | 'top-left' | 'bottom-right' | 'bottom-center';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  blur?: number;
}

export default function GlowBg({
  color = 'primary',
  position = 'center',
  size = 'lg',
  blur = 100,
}: GlowBgProps) {
  const colors = {
    primary: 'bg-primary/20',
    amber: 'bg-amber-500/15',
    blue: 'bg-blue-500/15',
    green: 'bg-green-500/15',
  };
  const sizes = { sm: 300, md: 500, lg: 700, xl: 900 };
  const positions = {
    center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    'top-right': 'top-0 right-0 translate-x-1/4 -translate-y-1/4',
    'bottom-left': 'bottom-0 left-0 -translate-x-1/4 translate-y-1/4',
    'top-left': 'top-0 left-0 -translate-x-1/4 -translate-y-1/4',
    'bottom-right': 'bottom-0 right-0 translate-x-1/4 translate-y-1/4',
    'bottom-center': 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/4',
  };

  return (
    <div
      className={`absolute ${positions[position]} ${colors[color]} rounded-full`}
      style={{ width: sizes[size], height: sizes[size], filter: `blur(${blur}px)` }}
    />
  );
}
