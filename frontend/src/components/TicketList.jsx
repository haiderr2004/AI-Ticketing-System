import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import { MoreVertical, Check, Copy } from 'lucide-react';

const PRIORITY_TEXT_COLORS = {
  critical: 'text-red-600',
  high:     'text-amber-500',
  medium:   'text-blue-600',
  low:      'text-slate-400',
};

export default function TicketList({ tickets, isLoading, selectedTickets, onToggleSelect }) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse h-24 bg-gray-50 border border-theme-border rounded-2xl"></div>
        ))}
      </div>
    );
  }

  if (!tickets || tickets.length === 0) {
    return <div className="p-10 text-center text-theme-textMuted font-medium">No tickets found.</div>;
  }

  const formatTicketTime = (dateStr) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Just now';
      if (isToday(d)) {
        return `Today ${format(d, 'HH:mm')}`;
      }
      if (isYesterday(d)) {
        return `Yesterday ${format(d, 'HH:mm')}`;
      }
      return format(d, 'd MMM HH:mm');
    } catch(e) {
      return 'Just now';
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {tickets.map((ticket, i) => {
        const isSelected = selectedTickets.includes(ticket.id);
        const isUrgent = ticket.priority === 'critical' || ticket.priority === 'high';
        const agent = ticket.assigned_to || null;
        const submitterName = ticket.submitter_name || 'Unknown';
        const priorityColor = PRIORITY_TEXT_COLORS[ticket.priority?.toLowerCase()] || 'text-theme-textMain';

        return (
          <div
            key={ticket.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all bg-white group relative
              ${isSelected ? 'border-l-4 border-l-indigo-500 border-theme-border shadow-soft' : 'border-theme-border hover:shadow-soft'}`}
          >
            {/* Checkbox */}
            <div 
              className="pl-2 cursor-pointer h-full flex items-center" 
              onClick={(e) => { e.stopPropagation(); onToggleSelect(ticket.id); }}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-theme-sidebar border-theme-sidebar' : 'border-gray-300'}`}>
                {isSelected && <Check size={10} className="text-white" />}
              </div>
            </div>

            {/* Content Wrapper for Navigation */}
            <div className="flex flex-1 min-w-0 items-center cursor-pointer" onClick={() => navigate(`/tickets/${ticket.id}`)}>
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-theme-sidebar bg-gray-50 flex-shrink-0 mr-3 font-bold text-xs">
                {submitterName.charAt(0).toUpperCase()}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h3 className="text-sm font-semibold text-theme-textMain truncate">{ticket.title}</h3>
                  {isUrgent && <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0"></div>}
                </div>
                <div className="flex items-center gap-2 text-xs text-theme-textMuted">
                  <span className="text-gray-400 font-medium">#{ticket.id}</span>
                  <span className="text-gray-300">·</span>
                  <span>{submitterName}</span>
                  <span className="text-gray-300">·</span>
                  <span className="capitalize">{ticket.category?.replace(/_/g, ' ') || 'support'}</span>
                  {agent && <><span className="text-gray-300">·</span><span className="font-medium text-gray-500">{agent}</span></>}
                  {ticket.is_duplicate && (
                    <span className="flex items-center gap-0.5 text-orange-400 font-medium ml-1">
                      <Copy size={10} />
                      {ticket.duplicate_of_id ? `duplicate of #${ticket.duplicate_of_id}` : 'duplicate'}
                    </span>
                  )}
                </div>
              </div>

              {/* Right Actions */}
              <div className="flex items-center gap-6 flex-shrink-0 ml-4">
                <div className="text-xs text-theme-textMuted font-medium w-28 text-right">
                  {formatTicketTime(ticket.created_at)}
                </div>
                
                <button className="text-gray-400 hover:text-gray-600" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical size={16} />
                </button>

                <div className={`text-xs font-semibold capitalize px-2 py-1 rounded ${priorityColor}`}>
                  {ticket.priority || 'normal'}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
