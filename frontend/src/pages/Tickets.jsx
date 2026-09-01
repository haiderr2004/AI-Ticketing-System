import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { format, startOfMonth, getDay, getDaysInMonth, addMonths, subMonths, isToday } from 'date-fns';
import { getTickets, deleteTicket } from '../api/client';
import TicketList from '../components/TicketList';

const STATUS_OPTIONS   = ['All statuses', 'open', 'in_progress', 'resolved', 'closed', 'duplicate'];
const PRIORITY_OPTIONS = ['All priorities', 'critical', 'high', 'medium', 'low'];
const CATEGORY_OPTIONS = [
  'All categories',
  'hardware', 'software', 'networking', 'printing',
  'email_calendar', 'security', 'access_request',
  'infrastructure', 'feature_request', 'bug', 'support', 'other',
];
const SORT_OPTIONS = [
  { label: 'Date (newest)', col: 'created_at', desc: true },
  { label: 'Date (oldest)', col: 'created_at', desc: false },
  { label: 'Priority',      col: 'priority',   desc: true },
  { label: 'Status',        col: 'status',     desc: false },
];

function labelFor(val) {
  return val.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function Tickets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [page, setPage]                 = useState(parseInt(searchParams.get('page')) || 1);
  const [search, setSearch]             = useState(searchParams.get('search') || '');
  const [status, setStatus]             = useState(searchParams.get('status') || 'All statuses');
  const [priority, setPriority]         = useState(searchParams.get('priority') || 'All priorities');
  const [category, setCategory]         = useState(searchParams.get('category') || 'All categories');
  const [submitterEmail]                = useState(searchParams.get('submitter_email') || '');
  const [sortOption, setSortOption]     = useState(SORT_OPTIONS[0]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTickets, setSelectedTickets] = useState([]);

  const PAGE_SIZE = 20;

  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', page);
    if (search) params.set('search', search);
    if (status !== 'All statuses') params.set('status', status);
    if (priority !== 'All priorities') params.set('priority', priority);
    if (category !== 'All categories') params.set('category', category);
    setSearchParams(params, { replace: true });
  }, [page, search, status, priority, category, setSearchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', { page, search, status, priority, category, submitterEmail }],
    queryFn: () => getTickets({
      page,
      size: PAGE_SIZE,
      search: search || undefined,
      status: status !== 'All statuses' ? status : undefined,
      priority: priority !== 'All priorities' ? priority : undefined,
      category: category !== 'All categories' ? category : undefined,
      submitter_email: submitterEmail || undefined,
    }),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids) => { for (const id of ids) await deleteTicket(id); },
    onSuccess: () => { queryClient.invalidateQueries(['tickets']); setSelectedTickets([]); },
  });

  const sortedItems = (data?.items ? [...data.items] : [])
    .filter(t => {
      if (!selectedDate) return true;
      const d = new Date(t.created_at);
      return d.getFullYear() === calendarMonth.getFullYear()
          && d.getMonth()    === calendarMonth.getMonth()
          && d.getDate()     === selectedDate;
    })
    .sort((a, b) => {
      const PRIORITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
      let vA = sortOption.col === 'priority' ? (PRIORITY_RANK[a.priority] ?? 0) : (a[sortOption.col] ?? '');
      let vB = sortOption.col === 'priority' ? (PRIORITY_RANK[b.priority] ?? 0) : (b[sortOption.col] ?? '');
      if (vA < vB) return sortOption.desc ? 1 : -1;
      if (vA > vB) return sortOption.desc ? -1 : 1;
      return 0;
    });

  const totalPages = data?.total ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const toggleSelectAll = () =>
    setSelectedTickets(
      selectedTickets.length === sortedItems.length && sortedItems.length > 0
        ? []
        : sortedItems.map(t => t.id)
    );

  const handleDeleteSelected = () => {
    if (!selectedTickets.length) return;
    if (window.confirm(`Delete ${selectedTickets.length} ticket(s)?`))
      deleteMutation.mutate(selectedTickets);
  };

  // Calendar helpers
  const daysInMonth   = getDaysInMonth(calendarMonth);
  // getDay returns 0=Sun..6=Sat; convert to Mon-first offset
  const firstDayOfWeek = (getDay(startOfMonth(calendarMonth)) + 6) % 7;

  return (
    <div className="flex flex-1 min-h-0 w-full bg-white">

      {/* ── Main List ── */}
      <div className="flex-1 flex flex-col min-w-0 p-4 lg:p-5 overflow-hidden">
        <div className="bg-white border border-theme-border rounded-2xl shadow-soft flex flex-col h-full overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border bg-gray-50/50 flex-shrink-0">
            <div className="flex items-center gap-5">
              <label className="flex items-center gap-2 text-sm text-theme-textMain font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-theme-primary focus:ring-theme-primary w-4 h-4 cursor-pointer"
                  checked={selectedTickets.length > 0 && selectedTickets.length === sortedItems.length}
                  onChange={toggleSelectAll}
                />
                Select all
              </label>

              <button
                className={`text-sm font-medium transition-colors ${selectedTickets.length > 0 ? 'text-red-500 hover:text-red-600' : 'text-gray-300 cursor-not-allowed'}`}
                onClick={handleDeleteSelected}
                disabled={selectedTickets.length === 0 || deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>

              {/* Sort dropdown */}
              <div className="relative group">
                <button className="flex items-center gap-1 text-sm font-medium text-theme-textMain hover:text-theme-primary transition-colors">
                  Sort: {sortOption.label}
                  <ChevronDown size={13} className="text-gray-400" />
                </button>
                <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-theme-border rounded-xl shadow-lg z-20 hidden group-hover:block">
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.label}
                      onClick={() => setSortOption(opt)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors first:rounded-t-xl last:rounded-b-xl
                        ${sortOption.label === opt.label ? 'text-theme-primary font-semibold bg-gray-50' : 'text-theme-textMain hover:bg-gray-50'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center gap-3 text-sm text-theme-textMuted font-medium">
              <span>
                {data?.total
                  ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, data.total)} of ${data.total}`
                  : '0'}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1 rounded-md text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1 rounded-md text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Ticket list */}
          <div className="flex-1 overflow-y-auto p-2.5 custom-scroll bg-slate-50/30">
            <TicketList
              tickets={sortedItems}
              isLoading={isLoading}
              selectedTickets={selectedTickets}
              onToggleSelect={(id) =>
                setSelectedTickets(prev =>
                  prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                )
              }
            />
          </div>
        </div>
      </div>

      {/* ── Filter Sidebar ── */}
      <div className="w-72 xl:w-80 border-l border-theme-border bg-white flex flex-col flex-shrink-0">
        <div className="p-5 overflow-y-auto flex-1 custom-scroll">
          <h2 className="text-sm font-semibold text-theme-textMain mb-4">Ticket Filters</h2>

          <div className="flex flex-col gap-3">
            {/* Search */}
            <input
              type="text"
              placeholder="Search tickets…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full border border-theme-border rounded-xl px-3.5 py-2.5 text-sm text-theme-textMain focus:outline-none focus:border-theme-primary transition-colors placeholder:text-gray-400"
            />

            <FilterSelect
              label="Category"
              value={category}
              onChange={v => { setCategory(v); setPage(1); }}
              options={CATEGORY_OPTIONS}
              format={labelFor}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={v => { setStatus(v); setPage(1); }}
              options={STATUS_OPTIONS}
              format={labelFor}
            />
            <FilterSelect
              label="Priority"
              value={priority}
              onChange={v => { setPriority(v); setPage(1); }}
              options={PRIORITY_OPTIONS}
              format={labelFor}
            />

            {/* Calendar date filter */}
            <div className="border border-theme-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-gray-50/50 border-b border-theme-border">
                <span className="text-sm font-medium text-theme-textMain">
                  {selectedDate
                    ? `${selectedDate} ${format(calendarMonth, 'MMM yyyy')}`
                    : 'All dates'}
                </span>
                {selectedDate && (
                  <button onClick={() => setSelectedDate(null)} className="text-[11px] text-theme-primary hover:underline">
                    Clear
                  </button>
                )}
              </div>
              <div className="p-3 bg-white">
                {/* Month nav */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => { setCalendarMonth(m => subMonths(m, 1)); setSelectedDate(null); }}
                    className="p-1 rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs font-semibold text-theme-textMain">
                    {format(calendarMonth, 'MMMM yyyy')}
                  </span>
                  <button
                    onClick={() => { setCalendarMonth(m => addMonths(m, 1)); setSelectedDate(null); }}
                    className="p-1 rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                {/* Day headers */}
                <div className="grid grid-cols-7 text-center mb-1">
                  {['M','T','W','T','F','S','S'].map((d, i) => (
                    <div key={i} className="text-[10px] font-semibold text-gray-400 py-0.5">{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                <div className="grid grid-cols-7 gap-y-0.5 text-center">
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div key={`pad-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                    const cellDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                    const isTodayCell = isToday(cellDate);
                    const isSelected = selectedDate === day;
                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDate(isSelected ? null : day)}
                        className={`relative w-7 h-7 mx-auto flex items-center justify-center text-xs rounded-full transition-colors
                          ${isSelected ? 'bg-theme-primary text-white font-bold' : isTodayCell ? 'text-theme-primary font-bold' : 'text-theme-textMain hover:bg-gray-100'}`}
                      >
                        {day}
                        {isTodayCell && !isSelected && (
                          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-theme-primary rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Clear filters */}
        <div className="p-4 border-t border-theme-border flex justify-end flex-shrink-0">
          <button
            onClick={() => {
              setCategory('All categories');
              setStatus('All statuses');
              setPriority('All priorities');
              setSearch('');
              setSelectedDate(null);
              setPage(1);
            }}
            className="text-sm font-semibold text-theme-textMuted hover:text-theme-textMain transition-colors"
          >
            Clear filters
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, format: fmt = v => v }) {
  return (
    <div className="relative border border-theme-border rounded-xl overflow-hidden bg-white hover:bg-gray-50 transition-colors">
      <select
        className="w-full appearance-none bg-transparent py-2.5 pl-3.5 pr-9 text-sm font-medium text-theme-textMain focus:outline-none cursor-pointer"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>
            {opt.startsWith('All') ? opt : `${label}: ${fmt(opt)}`}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}
