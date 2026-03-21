import * as LucideIcons from 'lucide-react';

export default function DashboardMetrics({ metrics }) {
  if (!metrics) return null;

  return (
    <div className="metric-row">
      <MetricCard 
        label="Open tickets"
        val={metrics.open_tickets}
        sub={`Total tickets: ${metrics.total_tickets}`}
        icon="Inbox"
      />
      <MetricCard 
        label="Critical / urgent"
        val={metrics.critical_open_count}
        sub="Need immediate action"
        variant="danger"
        icon="AlertCircle"
      />
      <MetricCard 
        label="Resolved today"
        val={metrics.resolved_today}
        sub={`Avg ${metrics.average_resolution_time_hours} hrs resolution`}
        variant="ok"
        icon="CheckCircle2"
      />
      <MetricCard 
        label="Duplicate rate"
        val={`${(metrics.duplicate_rate * 100).toFixed(1)}%`}
        sub="AI-detected duplicates"
        variant="warn"
        icon="Copy"
      />
    </div>
  );
}

function MetricCard({ label, val, sub, variant = 'default', icon }) {
  const Icon = LucideIcons[icon];
  
  let valClass = "metric-val";
  if (variant === 'danger') valClass += " danger";
  if (variant === 'warn') valClass += " warn";
  if (variant === 'ok') valClass += " ok";

  return (
    <div className="metric flex flex-col relative overflow-hidden">
      <div className="metric-label flex justify-between items-center">
        {label}
        {Icon && <Icon size={14} className="text-gray-400" />}
      </div>
      <div className={valClass}>{val}</div>
      <div className="metric-sub">{sub}</div>
    </div>
  );
}
