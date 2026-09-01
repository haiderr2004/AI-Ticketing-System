import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, UserX } from 'lucide-react';
import { getMetrics, getTickets, getTrends } from '../api/client';
import DashboardMetrics from '../components/DashboardMetrics';
import { formatDistanceToNow, format } from 'date-fns';

const CATEGORY_COLORS = {
  hardware: 'bg-orange-400',
  software: 'bg-violet-400',
  networking: 'bg-cyan-400',
  printing: 'bg-lime-400',
  email_calendar: 'bg-sky-400',
  security: 'bg-yellow-400',
  access_request: 'bg-indigo-400',
  infrastructure: 'bg-purple-400',
  bug: 'bg-red-400',
  support: 'bg-blue-400',
  feature_request: 'bg-teal-400',
  other: 'bg-gray-400',
};

function TicketRow({ ticket, navigate }) {
  return (
    <tr
      onClick={() => navigate(`/tickets/${ticket.id}`)}
      className="border-b border-gray-50 hover:bg-gray-50/70 cursor-pointer transition-colors"
    >
      <td className="px-5 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-theme-textMain truncate max-w-[200px]">
            {ticket.title}
          </span>
          <span className="text-[11px] text-theme-textMuted mt-0.5">
            #{ticket.id} · {ticket.category?.replace(/_/g, ' ') || 'support'}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-theme-sidebar/10 flex items-center justify-center text-[10px] font-bold text-theme-sidebar flex-shrink-0">
            {(ticket.submitter_name || 'U').charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-theme-textMuted truncate max-w-[64px]">
            {ticket.submitter_name || 'Unknown'}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className={`badge ${ticket.status?.toLowerCase() || 'open'}`}>
          {ticket.status?.replace(/_/g, ' ') || 'open'}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className={`badge ${ticket.priority?.toLowerCase() || 'medium'}`}>
          {ticket.priority || 'medium'}
        </span>
      </td>
      <td className="px-5 py-2.5 text-right text-xs text-theme-textMuted whitespace-nowrap">
        {(() => {
          try { return formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true }); }
          catch { return '—'; }
        })()}
      </td>
    </tr>
  );
}

const TABLE_HEADERS = ['Ticket', 'Submitter', 'Status', 'Priority', 'Age'];

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: getMetrics,
  });

  const { data: recentTickets, isLoading: loadingTickets } = useQuery({
    queryKey: ['tickets', { size: 4, page: 1 }],
    queryFn: () => getTickets({ size: 4, page: 1 }),
  });

  const { data: unassignedTickets, isLoading: loadingUnassigned } = useQuery({
    queryKey: ['tickets', { assigned_to: 'unassigned', size: 10, page: 1 }],
    queryFn: () => getTickets({ size: 10, page: 1 }),
  });

  const { data: trends, isLoading: loadingTrends } = useQuery({
    queryKey: ['trends'],
    queryFn: getTrends,
  });

  const categoryEntries = metrics?.tickets_by_category
    ? Object.entries(metrics.tickets_by_category).sort((a, b) => b[1] - a[1])
    : [];
  const maxCatCount = categoryEntries.length > 0
    ? Math.max(...categoryEntries.map(([, v]) => v), 1)
    : 1;

  const maxBar = trends?.length
    ? Math.max(...trends.map((d) => Math.max(d.opened, d.closed)), 1)
    : 1;

  // Filter unassigned from the recent list
  const unassigned = (unassignedTickets?.items || []).filter(
    (t) => !t.assigned_to && t.status !== 'resolved' && t.status !== 'closed'
  );

  return (
    <div className="h-full overflow-hidden flex flex-col p-5 gap-4">

      {/* ── Stats Row ── */}
      {loadingMetrics ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 flex-shrink-0">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[72px] bg-gray-50 border border-theme-border rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex-shrink-0">
          <DashboardMetrics metrics={metrics} />
        </div>
      )}

      {/* ── Main Grid ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Left col — 3 cols, split into two rows */}
        <div className="lg:col-span-3 flex flex-col gap-4 min-h-0">

          {/* Recent Tickets Table (top, ~60%) */}
          <div className="flex-[3] min-h-0 bg-white rounded-2xl border border-theme-border shadow-soft flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-sm font-semibold text-theme-textMain">Recent Tickets</h2>
              <button
                onClick={() => navigate('/tickets')}
                className="text-xs font-medium text-theme-primary hover:text-theme-primaryHover flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>
            {loadingTickets ? (
              <div className="p-5 flex flex-col gap-2.5">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-9 bg-gray-50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto custom-scroll">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-100">
                      {TABLE_HEADERS.map((h, i) => (
                        <th
                          key={h}
                          className={`text-[11px] font-semibold text-theme-textMuted uppercase tracking-wide py-2.5 ${i === TABLE_HEADERS.length - 1 ? 'text-right px-5' : i === 0 ? 'text-left px-5' : 'text-left px-3'}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentTickets?.items?.length > 0 ? (
                      recentTickets.items.map((ticket) => (
                        <TicketRow key={ticket.id} ticket={ticket} navigate={navigate} />
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-5 py-6 text-center text-sm text-theme-textMuted">
                          No tickets yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Unassigned Tickets (bottom, ~40%) */}
          <div className="flex-[2] min-h-0 bg-white rounded-2xl border border-theme-border shadow-soft flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <UserX size={14} className="text-rose-400" />
                <h2 className="text-sm font-semibold text-theme-textMain">Needs Assignment</h2>
                {unassigned.length > 0 && (
                  <span className="text-[11px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">
                    {unassigned.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => navigate('/tickets')}
                className="text-xs font-medium text-theme-primary hover:text-theme-primaryHover flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scroll">
              {loadingUnassigned ? (
                <div className="p-4 flex flex-col gap-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-8 bg-gray-50 rounded-lg animate-pulse" />)}
                </div>
              ) : unassigned.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {unassigned.slice(0, 6).map((t) => (
                    <div
                      key={t.id}
                      onClick={() => navigate(`/tickets/${t.id}`)}
                      className="px-5 py-2.5 flex items-center gap-3 hover:bg-gray-50/70 cursor-pointer transition-colors"
                    >
                      <div className="w-6 h-6 rounded-full bg-theme-sidebar/10 flex items-center justify-center text-[10px] font-bold text-theme-sidebar flex-shrink-0">
                        {(t.submitter_name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-theme-textMain truncate block">{t.title}</span>
                        <span className="text-[11px] text-theme-textMuted">#{t.id} · {t.category?.replace(/_/g, ' ') || 'support'}</span>
                      </div>
                      <span className={`badge ${t.priority?.toLowerCase() || 'medium'} flex-shrink-0`}>
                        {t.priority || 'medium'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-theme-textMuted py-6">
                  <UserX size={24} className="text-gray-300" />
                  <p className="text-xs">All tickets are assigned</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right column — 2 cols */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">

          {/* 7-Day Activity Chart */}
          <div className="flex-1 min-h-0 bg-white rounded-2xl border border-theme-border shadow-soft flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-sm font-semibold text-theme-textMain">7-Day Activity</h2>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[11px] text-theme-textMuted">
                  <span className="w-2 h-2 rounded-sm bg-theme-sidebar/70 inline-block" /> Opened
                </span>
                <span className="flex items-center gap-1 text-[11px] text-theme-textMuted">
                  <span className="w-2 h-2 rounded-sm bg-theme-primary inline-block" /> Resolved
                </span>
              </div>
            </div>
            <div className="flex-1 min-h-0 px-4 pt-3 pb-4 flex gap-2">
              {/* Y-axis labels */}
              <div className="flex flex-col justify-between items-end pb-6 flex-shrink-0 w-5">
                {[maxBar, Math.round(maxBar * 0.5), 0].map((v, i) => (
                  <span key={i} className="text-[9px] text-gray-400 font-medium leading-none">{v}</span>
                ))}
              </div>

              {/* Chart area */}
              <div className="flex-1 min-w-0 flex flex-col">
                {loadingTrends ? (
                  <div className="flex items-end gap-2 flex-1">
                    {[...Array(7)].map((_, i) => (
                      <div key={i} className="flex-1 bg-gray-100 rounded animate-pulse" style={{ height: `${30 + i * 8}%` }} />
                    ))}
                  </div>
                ) : (
                  <div className="relative flex-1 min-h-0">
                    {/* Horizontal gridlines */}
                    {[0, 50, 100].map((pct) => (
                      <div
                        key={pct}
                        className="absolute left-0 right-0 border-t border-gray-100"
                        style={{ bottom: `calc(${pct}% + 24px)`, top: pct === 100 ? 0 : 'auto', height: pct === 100 ? 0 : 'auto' }}
                      />
                    ))}

                    {/* Bars */}
                    <div className="absolute inset-0 flex items-end gap-1.5 pb-6">
                      {(trends || []).map((day, i) => {
                        const openedH = maxBar > 0 ? Math.max((day.opened / maxBar) * 100, day.opened > 0 ? 6 : 0) : 0;
                        const closedH = maxBar > 0 ? Math.max((day.closed / maxBar) * 100, day.closed > 0 ? 6 : 0) : 0;
                        const label = (() => {
                          try { return format(new Date(day.date), 'EEE'); } catch { return ''; }
                        })();
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center min-w-0 h-full justify-end group">
                            <div className="hidden group-hover:flex flex-col items-center bg-theme-sidebar text-white text-[10px] rounded-lg px-2 py-1 mb-1 whitespace-nowrap shadow-lg pointer-events-none absolute -top-1 z-10">
                              <span>{day.opened} opened</span>
                              <span>{day.closed} resolved</span>
                            </div>
                            <div className="w-full flex items-end gap-0.5 flex-1">
                              <div
                                className="flex-1 bg-theme-sidebar/60 rounded-t-md transition-all"
                                style={{ height: `${openedH}%`, minHeight: day.opened > 0 ? '3px' : '0' }}
                              />
                              <div
                                className="flex-1 bg-theme-primary rounded-t-md transition-all"
                                style={{ height: `${closedH}%`, minHeight: day.closed > 0 ? '3px' : '0' }}
                              />
                            </div>
                            <span className="text-[10px] text-theme-textMuted font-medium mt-1 flex-shrink-0">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="flex-1 min-h-0 bg-white rounded-2xl border border-theme-border shadow-soft flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-sm font-semibold text-theme-textMain">Tickets by Category</h2>
            </div>
            <div className="flex-1 min-h-0 px-4 py-3 flex flex-col justify-evenly gap-2 overflow-y-auto custom-scroll">
              {categoryEntries.length > 0 ? (
                categoryEntries.map(([cat, count]) => (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-xs text-theme-textMuted capitalize w-28 flex-shrink-0 truncate">
                      {cat.replace(/_/g, ' ')}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-0">
                      <div
                        className={`h-full rounded-full ${CATEGORY_COLORS[cat] || 'bg-gray-400'}`}
                        style={{ width: `${Math.round((count / maxCatCount) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-theme-textMain w-4 text-right flex-shrink-0">
                      {count}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-theme-textMuted text-center">No category data yet.</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
