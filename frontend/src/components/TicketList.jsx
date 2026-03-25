import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import { MoreVertical, Lock, User, Check } from 'lucide-react';

export default function TicketList({ tickets, isLoading, selectedTickets, onToggleSelect }) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse h-20 bg-gray-50 border border-theme-border rounded-xl"></div>
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
        const isUrgent = ticket.priority === 'Critical' || ticket.priority === 'High';
        const agent = ticket.assigned_to ? ticket.assigned_to.split(' ')[0] : 'ff';
        const submitterName = ticket.submitter_name || 'Unknown';

        return (
          <div 
            key={ticket.id} 
            className={`flex items-center gap-4 p-4 rounded-xl border transition-all bg-white group relative
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
              <div className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-theme-sidebar bg-gray-50 flex-shrink-0 mr-4 font-bold text-sm">
                {submitterName.charAt(0).toUpperCase()}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="text-xs font-semibold text-theme-textMain mb-0.5">{submitterName}</div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-theme-textMain truncate">
                    {ticket.title}
                  </h3>
                  {isUrgent && <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></div>}
                </div>
                <div className="flex items-center gap-2 text-xs text-theme-textMuted mt-1">
                  <span className="font-medium text-gray-500">{ticket.category || 'Technical Support'}</span>
                  <span className="font-bold text-gray-700">{agent}</span>
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

                <div className="flex items-center gap-1 text-xs font-semibold text-theme-textMain px-2 py-1 hover:bg-gray-50 rounded" onClick={(e) => e.stopPropagation()}>
                  {ticket.priority || 'Normal'}
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                <button className="text-gray-400 hover:text-gray-600" onClick={(e) => e.stopPropagation()}>
                  <Lock size={16} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
