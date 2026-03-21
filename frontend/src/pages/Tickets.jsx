import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getTickets } from '../api/client';
import TicketList from '../components/TicketList';

export default function Tickets() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const initialPage = parseInt(searchParams.get('page')) || 1;
  const initialSearch = searchParams.get('search') || '';
  const initialStatus = searchParams.get('status') || 'All statuses';
  const initialPriority = searchParams.get('priority') || 'All priorities';
  const initialCategory = searchParams.get('category') || 'All categories';
  const initialSource = searchParams.get('source') || 'All sources';
  
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState(initialPriority);
  const [category, setCategory] = useState(initialCategory);
  const [source, setSource] = useState(initialSource);
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
    if (source !== 'All sources') params.set('source', source);
    
    setSearchParams(params, { replace: true });
  }, [page, search, status, priority, category, source, setSearchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', { page, search, status, priority, category, source }],
    queryFn: () => getTickets({
      page,
      size: 20,
      search: search || undefined,
      status: status !== 'All statuses' ? status : undefined,
      priority: priority !== 'All priorities' ? priority : undefined,
      category: category !== 'All categories' ? category : undefined,
      source: source !== 'All sources' ? source : undefined,
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

  const totalPages = data ? Math.ceil(data.total / data.size) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="filter-row">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            className="search-input w-full pl-8" 
            placeholder="Search tickets by title, description, or AI summary..." 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        
        <select className="filter-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option>All statuses</option>
          <option>Open</option>
          <option>In progress</option>
          <option>Resolved</option>
          <option>Closed</option>
          <option>Duplicate</option>
        </select>
        
        <select className="filter-select" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
          <option>All priorities</option>
          <option>Critical</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        
        <select className="filter-select" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option>All categories</option>
          <option>Bug</option>
          <option>Feature request</option>
          <option>Support</option>
          <option>Infrastructure</option>
          <option>Security</option>
          <option>Access request</option>
          <option>Other</option>
        </select>
        
        <select className="filter-select" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
          <option>All sources</option>
          <option>Email</option>
          <option>Web form</option>
          <option>Slack</option>
          <option>API</option>
          <option>GitHub</option>
        </select>
      </div>

      <TicketList 
        tickets={sortedItems} 
        isLoading={isLoading} 
        onSort={handleSort}
      />

      {data && data.total > 0 && (
        <div className="flex justify-between items-center text-sm text-gray-500 mt-2 px-2">
          <div>
            Showing {((page - 1) * data.size) + 1} to {Math.min(page * data.size, data.total)} of {data.total} tickets
          </div>
          <div className="flex gap-2 items-center">
            <button 
              className="btn-ghost px-3 py-1"
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="px-2">Page {page} of {totalPages}</span>
            <button 
              className="btn-ghost px-3 py-1"
              disabled={page === totalPages || totalPages === 0}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
