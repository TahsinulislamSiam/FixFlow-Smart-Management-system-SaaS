import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS } from '../lib/constants.js';
import { formatDuration } from '../lib/format.js';

const AXIS = { stroke: '#6b76b8', fontSize: 11 };
const GRID = { stroke: 'rgba(152,161,208,0.12)' };

const tooltipStyle = {
  contentStyle: {
    background: 'rgba(11,16,32,0.96)',
    border: '1px solid rgba(152,161,208,0.22)',
    borderRadius: 12,
    fontSize: 12,
    color: '#e8eaf7',
    boxShadow: '0 20px 50px -30px rgba(0,0,0,1)',
  },
  labelStyle: { color: '#c4cae6', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: '#e8eaf7' },
};

/** Created vs resolved over time — the backlog story. */
export function TrendChart({ data = [], height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="createdFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="resolvedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="day" tickFormatter={(value) => String(value).slice(5)} {...AXIS} tickLine={false} axisLine={false} />
        <YAxis {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#98a1d0' }} />
        <Area type="monotone" dataKey="created" name="Reported" stroke="#818cf8" strokeWidth={2} fill="url(#createdFill)" />
        <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#4ade80" strokeWidth={2} fill="url(#resolvedFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars — reads well with long category names. */
export function CategoryBars({ data = [], height = 280, dataKey = 'total', labelKey = 'name' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey={labelKey} width={132} {...AXIS} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey={dataKey} radius={[0, 8, 8, 0]} barSize={16}>
          {data.map((entry, index) => (
            <Cell key={entry.category ?? index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusDonut({ data = [], height = 240 }) {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Tooltip {...tooltipStyle} />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="86%" paddingAngle={2} stroke="none">
          {data.map((entry, index) => (
            <Cell key={entry.name ?? index} fill={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Legend wrapperStyle={{ fontSize: 11, color: '#98a1d0' }} />
        {total === 0 ? null : null}
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Technician throughput with an average-resolution overlay. */
export function TechnicianChart({ data = [], height = 260 }) {
  const shaped = data.slice(0, 8).map((row) => ({
    ...row,
    firstName: row.name.split(' ')[0],
    avgHours: row.avg_resolution_minutes == null ? 0 : Number((row.avg_resolution_minutes / 60).toFixed(1)),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={shaped} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="firstName" {...AXIS} tickLine={false} axisLine={false} />
        <YAxis {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value, name) => (name.includes('avg') ? [`${value}h`, 'Avg resolution'] : [value, name])}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#98a1d0' }} />
        <Bar dataKey="resolved" name="Resolved" fill="#6366f1" radius={[8, 8, 0, 0]} barSize={18} />
        <Bar dataKey="open" name="Open" fill="#22d3ee" radius={[8, 8, 0, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Sparkline-style trend used in compact cards. */
export function MiniTrend({ data = [], dataKey = 'created', color = '#818cf8', height = 56 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export { formatDuration };
