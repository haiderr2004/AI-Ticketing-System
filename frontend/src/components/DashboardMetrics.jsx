import * as LucideIcons from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CARDS = [
  {
    label: 'Open Tickets',
    getValue: (m) => m.open_tickets,
    getSub: (m) => `${m.total_tickets} total tickets`,
    icon: 'Inbox',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
    valColor: 'text-theme-textMain',
    borderColor: 'border-b-blue-400',
  },
  {
    label: 'Critical & Urgent',
    getValue: (m) => m.critical_open_count,
    getSub: () => 'Need immediate attention',
    icon: 'AlertTriangle',
    iconBg: 'bg-red-50',
    iconColor: 'text-red-500',
    valColor: 'text-red-600',
    borderColor: 'border-b-red-400',
  },
  {
    label: 'In Progress',
    getValue: (m) => m.in_progress_tickets,
    getSub: () => 'Currently being worked on',
    icon: 'Clock',
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-500',
    valColor: 'text-indigo-600',
    borderColor: 'border-b-indigo-400',
  },
  {
    label: 'Resolved Today',
    getValue: (m) => m.resolved_today,
    getSub: () => 'Closed tickets today',
    icon: 'CheckCircle2',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    valColor: 'text-emerald-600',
    borderColor: 'border-b-emerald-400',
  },
  {
    label: 'Duplicates',
    getValue: (m) => Math.round((m.duplicate_rate || 0) * (m.total_tickets || 0)),
    getSub: () => 'AI-detected duplicates',
    icon: 'GitMerge',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    valColor: 'text-amber-600',
    borderColor: 'border-b-amber-400',
  },
];

export default function DashboardMetrics({ metrics }) {
  const navigate = useNavigate();
  const m = metrics || {
    open_tickets: 0,
    total_tickets: 0,
    in_progress_tickets: 0,
    critical_open_count: 0,
    resolved_today: 0,
    duplicate_rate: 0,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {CARDS.map((card) => {
        const Icon = LucideIcons[card.icon];
        return (
          <div
            key={card.label}
            onClick={() => navigate('/tickets')}
            className={`bg-white rounded-2xl border border-theme-border border-b-2 ${card.borderColor} px-4 py-3.5 shadow-soft flex items-center gap-3 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all`}
          >
            <div className={`${card.iconBg} p-2 rounded-xl flex-shrink-0`}>
              {Icon && <Icon size={16} className={card.iconColor} />}
            </div>
            <div className="min-w-0">
              <div className="text-xs text-theme-textMuted truncate">{card.label}</div>
              <div className={`text-2xl font-bold ${card.valColor} leading-tight`}>{card.getValue(m)}</div>
              <div className="text-[11px] text-theme-textMuted truncate">{card.getSub(m)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
