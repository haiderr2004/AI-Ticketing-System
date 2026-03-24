import * as LucideIcons from 'lucide-react';

export default function DashboardMetrics({ metrics }) {
  const safeMetrics = metrics || {
    open_tickets: 0,
    total_tickets: 0,
    critical_open_count: 0,
    resolved_today: 0,
    average_resolution_time_hours: 0,
    duplicate_rate: 0
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      <MetricCard 
        label="Open tickets"
        val={safeMetrics.open_tickets}
        sub={`Total tickets: ${safeMetrics.total_tickets}`}
        icon="Inbox"
      />
      <MetricCard 
        label="Critical / urgent"
        val={safeMetrics.critical_open_count}
        sub="Need immediate action"
        variant="danger"
        icon="AlertCircle"
      />
      <MetricCard 
        label="Resolved today"
        val={safeMetrics.resolved_today}
        sub={`Avg ${safeMetrics.average_resolution_time_hours} hrs resolution`}
        variant="ok"
        icon="CheckCircle2"
      />
      <MetricCard 
        label="Duplicate rate"
        val={`${(safeMetrics.duplicate_rate * 100).toFixed(1)}%`}
        sub="AI-detected duplicates"
        variant="warn"
        icon="Copy"
      />
    </div>
  );
}

function MetricCard({ label, val, sub, variant = 'default', icon }) {
  const Icon = LucideIcons[icon];
  
  let valColor = "text-theme-textMain";
  if (variant === 'danger') valColor = "text-theme-danger";
  if (variant === 'warn') valColor = "text-yellow-500";
  if (variant === 'ok') valColor = "text-theme-primary";

  return (
    <div className="bg-white rounded-2xl border border-theme-border p-6 shadow-soft flex flex-col">
      <div className="text-sm font-medium text-theme-textMuted mb-4 flex justify-between items-center">
        {label}
        {Icon && <Icon size={16} className="text-gray-400" />}
      </div>
      <div className={`text-3xl font-bold ${valColor} mb-2`}>{val}</div>
      <div className="text-xs text-theme-textMuted">{sub}</div>
    </div>
  );
}
