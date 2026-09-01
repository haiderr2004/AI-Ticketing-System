import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import { getMetrics, getTickets, getWeeklyDigest } from '../api/client';
import DashboardMetrics from '../components/DashboardMetrics';
import AskTicketsChat from '../components/AskTicketsChat';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: getMetrics,
  });

  const { data: recentTickets, isLoading: loadingTickets } = useQuery({
    queryKey: ['tickets', { status: 'open', size: 5 }],
    queryFn: () => getTickets({ status: 'open', size: 5, page: 1 }),
  });

  const { data: digest, isLoading: loadingDigest } = useQuery({
    queryKey: ['weekly-digest'],
    queryFn: getWeeklyDigest,
  });

  return (
    <div className="flex-1 p-6 md:p-8 flex flex-col min-h-0 min-w-0 bg-theme-card">
      <div className="flex-shrink-0">
        {loadingMetrics ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-50 border border-theme-border rounded-2xl animate-pulse"></div>
            ))}
          </div>
        ) : (
          <DashboardMetrics metrics={metrics} />
        )}
      </div>

      <div className="flex-1 flex flex-col gap-6 min-h-0">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
          <div className="bg-white rounded-2xl border border-theme-border shadow-soft flex flex-col overflow-hidden h-full">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-semibold text-theme-textMain">Recent open tickets</h2>
              <button onClick={() => navigate('/tickets')} className="text-sm font-medium text-theme-primary hover:text-theme-primaryHover transition-colors flex items-center gap-1">
                View all <ArrowRight size={14} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 pt-4 custom-scroll">
              {loadingTickets ? (
                 <div className="flex flex-col gap-3">
                   {[...Array(3)].map((_, i) => (
                     <div key={i} className="h-16 bg-gray-50 border border-theme-border rounded-xl animate-pulse"></div>
                   ))}
                 </div>
              ) : recentTickets?.items?.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {recentTickets.items.slice(0, 4).map(ticket => (
                    <div 
                      key={ticket.id} 
                      className="flex items-center justify-between p-3 rounded-xl border border-theme-border hover:shadow-soft transition-all cursor-pointer" 
                      onClick={() => navigate(`/tickets/${ticket.id}`)}
                    >
                      <div className="flex flex-col min-w-0 pr-4">
                        <span className="text-sm font-semibold text-theme-textMain truncate">{ticket.title}</span>
                        <span className="text-xs text-theme-textMuted mt-1 flex items-center gap-2">
                          <span className="font-medium">#{ticket.id}</span>
                          <span className={`w-1.5 h-1.5 rounded-full ${ticket.priority === 'Critical' ? 'bg-red-500' : ticket.priority === 'High' ? 'bg-orange-500' : 'bg-gray-300'}`}></span>
                          <span className="capitalize">{ticket.priority || 'Normal'}</span>
                        </span>
                      </div>
                      <span className="text-xs font-medium text-gray-400 whitespace-nowrap">
                        {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-theme-textMuted p-4 text-center border border-dashed border-gray-200 rounded-xl">No recent open tickets.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-theme-border shadow-soft flex flex-col overflow-hidden h-full">
            <div className="p-6 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-theme-textMain">AI Weekly Digest</h2>
            </div>
            <div className="p-6 flex-1 overflow-y-auto custom-scroll">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 h-full flex flex-col">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-100/50 px-2.5 py-1 rounded-full mb-3 w-max uppercase tracking-wide">
                  <Sparkles size={12} className="text-indigo-500" /> Generated by AI
                </div>
                <div className="text-sm text-indigo-900 leading-relaxed">
                  {loadingDigest ? 'Analyzing recent ticket trends...' : digest?.digest || 'Digest unavailable.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
          <div className="bg-white rounded-2xl border border-theme-border shadow-soft flex flex-col overflow-hidden h-full">
            <div className="p-6 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-theme-textMain">Tickets by Category</h2>
            </div>
            <div className="p-6 flex-1 overflow-y-auto custom-scroll">
              <div className="grid grid-cols-2 gap-4">
                {metrics?.tickets_by_category ? Object.entries(metrics.tickets_by_category).map(([cat, count]) => (
                  <div key={cat} className="p-4 border border-theme-border rounded-xl flex items-center justify-between bg-gray-50/50 hover:bg-gray-50 transition-colors">
                    <span className="text-sm font-medium text-theme-textMuted capitalize">{cat.replace('_', ' ')}</span>
                    <span className="text-lg font-bold text-theme-textMain">{count}</span>
                  </div>
                )) : (
                   <div className="col-span-2 text-sm text-theme-textMuted p-4 text-center border border-dashed border-gray-200 rounded-xl">No category data.</div>
                )}
              </div>
            </div>
          </div>

          <div className="h-full">
            <AskTicketsChat />
          </div>
        </div>
      </div>
    </div>
  );
}
