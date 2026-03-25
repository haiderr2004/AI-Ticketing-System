import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, Calendar as CalendarIcon } from 'lucide-react';
import { getTickets } from '../api/client';
import TicketList from '../components/TicketList';

export default function Tickets() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const initialPage = parseInt(searchParams.get('page')) || 1;
  const initialSearch = searchParams.get('search') || '';
  const initialStatus = searchParams.get('status') || 'All statuses';
  const initialPriority = searchParams.get('priority') || 'All priorities';
  const initialCategory = searchParams.get('category') || 'All categories';
  
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState(initialPriority);
  const [category, setCategory] = useState(initialCategory);
  const [sortCol, setSortCol] = useState('created_at');
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  // Sync state to URL
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
    queryKey: ['tickets', { page, search, status, priority, category }],
    queryFn: () => getTickets({
      page,
      size: 100, // Fetch more so we can filter by date locally for this demo
      search: search || undefined,
      status: status !== 'All statuses' ? status.toLowerCase() : undefined,
      priority: priority !== 'All priorities' ? priority.toLowerCase() : undefined,
      category: category !== 'All categories' ? category.toLowerCase().replace(' ', '_') : undefined,
    }),
    placeholderData: (prev) => prev,
  });

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDesc(!sortDesc);
    } else {
      setSortCol(col);
      setSortDesc(true);
    }
  };

  const sortedItems = data?.items ? [...data.items]
    .filter(t => {
      if (!selectedDate) return true;
      const tDate = new Date(t.created_at);
      return tDate.getDate() === selectedDate && tDate.getMonth() === new Date().getMonth();
    })
    .sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];
    
    if (valA == null) valA = '';
    if (valB == null) valB = '';
    
    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  }) : [];

  const handleDateClick = (day) => {
    if (selectedDate === day) {
      setSelectedDate(null); // toggle off
    } else {
      setSelectedDate(day);
    }
  };

  return (
    <div className="flex h-full w-full bg-white">
      {/* Main List Area */}
      <div className="flex-1 flex flex-col min-w-0 p-8 pr-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-theme-textMain font-medium cursor-pointer">
              <input type="checkbox" className="rounded border-gray-300 text-theme-primary focus:ring-theme-primary w-4 h-4" />
              Select all
            </label>
            <button className="text-sm font-medium text-theme-textMain hover:text-theme-textMain transition-colors">
              Delete
            </button>
            <button className="flex items-center gap-1 text-sm font-medium text-theme-textMain hover:text-theme-textMain transition-colors">
              Sort by: Date <ChevronDown size={14} className="text-gray-400" />
            </button>
          </div>
          
          <div className="flex items-center gap-4 text-sm font-medium text-theme-textMain">
            <span>1-10 of 200</span>
            <div className="flex gap-1">
              <button className="p-1 rounded-md text-gray-400 hover:bg-gray-100 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button className="p-1 rounded-md text-gray-400 hover:bg-gray-100 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scroll">
          <TicketList 
            tickets={sortedItems} 
            isLoading={isLoading} 
            onSort={handleSort}
          />
        </div>
      </div>

      {/* Right Filter Sidebar */}
      <div className="w-80 border-l border-theme-border bg-white flex flex-col">
        <div className="p-6 overflow-y-auto flex-1">
          <h2 className="text-lg font-semibold text-theme-textMain mb-6">Ticket Filters</h2>

          <div className="space-y-4">
            <FilterSelect label="Category" value={category} onChange={setCategory} options={['All categories', 'Technical Support', 'Billing', 'General']} />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={['All statuses', 'Open', 'In Progress', 'Resolved']} />
            <FilterSelect label="Priority" value={priority} onChange={setPriority} options={['All priorities', 'Urgent', 'High', 'Normal', 'Low']} />
            <FilterSelect label="Customer" value="All" onChange={() => {}} options={['All', 'Premium', 'Standard']} />
            <FilterSelect label="Agent" value="All" onChange={() => {}} options={['All', 'Me', 'Unassigned']} />
            
            {/* Created Date Filter / Calendar mock */}
            <div className="border border-theme-border rounded-lg overflow-hidden shadow-sm">
              <button className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors" onClick={() => setSelectedDate(null)}>
                <span className="text-sm font-medium text-theme-textMain text-left">
                  {selectedDate ? `Created: ${selectedDate} ${format(new Date(), 'MMM yyyy')}` : 'Created: All Time'}
                </span>
                <ChevronDown size={16} className="text-gray-400" />
              </button>
              <div className="p-4 border-t border-theme-border bg-white">
                <div className="flex items-center justify-between mb-4">
                  <ChevronLeft size={14} className="text-gray-400 cursor-pointer" />
                  <span className="text-sm font-medium text-theme-textMain">{format(new Date(), 'MMMM yyyy')}</span>
                  <ChevronRight size={14} className="text-gray-400 cursor-pointer" />
                </div>
                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center text-xs mb-2">
                  <div className="text-gray-400 font-medium">M</div><div className="text-gray-400 font-medium">T</div><div className="text-gray-400 font-medium">W</div><div className="text-gray-400 font-medium">T</div><div className="text-gray-400 font-medium">F</div><div className="text-gray-400 font-medium">S</div><div className="text-gray-400 font-medium">S</div>
                  <div className="text-gray-300">28</div><div className="text-gray-300">29</div><div className="text-gray-300">30</div><div className="text-gray-300">31</div>
                  {Array.from({length: 30}, (_, i) => i + 1).map(day => (
                    <div 
                      key={day} 
                      onClick={() => handleDateClick(day)}
                      className={`rounded-full w-6 h-6 flex items-center justify-center mx-auto cursor-pointer transition-colors ${selectedDate === day ? 'bg-theme-primary text-white font-bold shadow-md shadow-theme-primary/30' : 'text-theme-textMain hover:bg-gray-100'}`}
                    >
                      {day}
                    </div>
                  ))}
                  <div className="text-gray-300">1</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bottom Action */}
        <div className="p-4 border-t border-theme-border flex justify-end">
          <button onClick={() => { setCategory('All categories'); setStatus('All statuses'); setPriority('All priorities'); setSelectedDate(null); }} className="text-sm font-semibold text-theme-textMain hover:text-gray-600 transition-colors">Clear filters</button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="relative border border-theme-border rounded-lg overflow-hidden shadow-sm bg-white hover:bg-gray-50 transition-colors">
      <select 
        className="w-full appearance-none bg-transparent py-3 pl-4 pr-10 text-sm font-medium text-theme-textMain focus:outline-none cursor-pointer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{label}: {opt}</option>
        ))}
      </select>
      <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}
