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
  const initialStatus = searchParams.get('status') || 'Open';
  const initialPriority = searchParams.get('priority') || 'Urgent';
  const initialCategory = searchParams.get('category') || 'Technical Support';
  
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState(initialPriority);
  const [category, setCategory] = useState(initialCategory);
  const [sortCol, setSortCol] = useState('created_at');
  const [sortDesc, setSortDesc] = useState(true);

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
      size: 10,
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

  const sortedItems = data?.items ? [...data.items].sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];
    
    if (valA == null) valA = '';
    if (valB == null) valB = '';
    
    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  }) : [];

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
            <FilterSelect label="Category" value={category} onChange={setCategory} options={['Technical Support', 'Billing', 'General']} />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={['Open', 'In Progress', 'Resolved']} />
            <FilterSelect label="Priority" value={priority} onChange={setPriority} options={['Urgent', 'High', 'Normal', 'Low']} />
            <FilterSelect label="Customer" value="All" onChange={() => {}} options={['All', 'Premium', 'Standard']} />
            <FilterSelect label="Agent" value="All" onChange={() => {}} options={['All', 'Me', 'Unassigned']} />
            
            {/* Created Date Filter / Calendar mock */}
            <div className="border border-theme-border rounded-lg overflow-hidden shadow-sm">
              <button className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
                <span className="text-sm font-medium text-theme-textMain text-left">Created: 1 Nov - 4 Nov</span>
                <ChevronDown size={16} className="text-gray-400" />
              </button>
              <div className="p-4 border-t border-theme-border bg-white">
                <div className="flex items-center justify-between mb-4">
                  <ChevronLeft size={14} className="text-gray-400 cursor-pointer" />
                  <span className="text-sm font-medium text-theme-textMain">November 2019</span>
                  <ChevronRight size={14} className="text-gray-400 cursor-pointer" />
                </div>
                {/* Calendar Grid Mock */}
                <div className="grid grid-cols-7 gap-y-2 text-center text-xs mb-2">
                  <div className="text-gray-400 font-medium">M</div><div className="text-gray-400 font-medium">T</div><div className="text-gray-400 font-medium">W</div><div className="text-gray-400 font-medium">T</div><div className="text-gray-400 font-medium">F</div><div className="text-gray-400 font-medium">S</div><div className="text-gray-400 font-medium">S</div>
                  <div className="text-gray-300">28</div><div className="text-gray-300">29</div><div className="text-gray-300">30</div><div className="text-gray-300">31</div>
                  <div className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto cursor-pointer">1</div>
                  <div className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto cursor-pointer">2</div>
                  <div className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto cursor-pointer">3</div>
                  <div className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto cursor-pointer">4</div>
                  <div className="bg-theme-sidebarActive text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto cursor-pointer">5</div>
                  <div className="text-theme-textMain hover:bg-gray-100 rounded-full w-6 h-6 flex items-center justify-center mx-auto cursor-pointer">6</div>
                  <div className="text-theme-textMain hover:bg-gray-100 rounded-full w-6 h-6 flex items-center justify-center mx-auto cursor-pointer">7</div>
                  <div className="text-theme-textMain hover:bg-gray-100 rounded-full w-6 h-6 flex items-center justify-center mx-auto cursor-pointer">8</div>
                  <div className="text-theme-textMain hover:bg-gray-100 rounded-full w-6 h-6 flex items-center justify-center mx-auto cursor-pointer">9</div>
                  <div className="text-theme-textMain hover:bg-gray-100 rounded-full w-6 h-6 flex items-center justify-center mx-auto cursor-pointer">10</div>
                  {/* Just fill a couple more rows to look like the mock */}
                  {[11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30].map(day => (
                    <div key={day} className="text-theme-textMain hover:bg-gray-100 rounded-full w-6 h-6 flex items-center justify-center mx-auto cursor-pointer">{day}</div>
                  ))}
                  <div className="text-gray-300">1</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bottom Action */}
        <div className="p-4 border-t border-theme-border flex justify-end">
          <button className="text-sm font-semibold text-theme-textMain hover:text-gray-600 transition-colors">Clear filters</button>
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
