'use client';
import React from 'react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, Tooltip, YAxis } from 'recharts';

interface MetricTrendPoint {
  date: string;
  value: number;
}

interface MetricTrendChartProps {
  data: MetricTrendPoint[];
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: MetricTrendPoint }>;
}

// Compact dark tooltip showing the clicked point's value (and its real date),
// instead of recharts' default white box with a bogus epoch date.
const TrendTooltip: React.FC<TrendTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  const parsed = new Date(point.date);
  const dateText = Number.isNaN(parsed.getTime()) ? point.date : parsed.toLocaleDateString();
  return (
    <div className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs shadow-lg">
      <div className="text-slate-400">{dateText}</div>
      <div className="text-yellow-400 font-semibold">{point.value}</div>
    </div>
  );
};

const MetricTrendChart: React.FC<MetricTrendChartProps> = ({ data }) => {
  const chartData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  // Per-metric ratings are stored on the canonical 1-10 scale.
  const max = Math.max(10, ...chartData.map(d => d.value));
  return (
    <div style={{ width: '100%', height: 60 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#4b5563" strokeDasharray="3 3" vertical={false} />
          <YAxis hide domain={[0, max]} />
          <Tooltip cursor={{ stroke: '#334155' }} content={<TrendTooltip />} />
          <Line type="monotone" dataKey="value" stroke="#facc15" dot={false} activeDot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MetricTrendChart;
