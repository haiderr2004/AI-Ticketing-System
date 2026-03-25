import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTickets } from '../api/client';
import { User, Mail, Calendar, ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import TicketList from '../components/TicketList';

export default function Customers() {
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // We'll use the unique submitter_emails from tickets to construct a mock customer list
  const { data, isLoading } = useQuery({
    queryKey: ['tickets', { page: 1, size: 100 }],
    queryFn: () => getTickets({ page: 1, size: 100 }),
  });

  const customers = React.useMemo(() => {
    if (!data?.items) return [];
    
    const uniqueMap = new Map();
    data.items.forEach(t => {
      if (t.submitter_email && !uniqueMap.has(t.submitter_email)) {
        uniqueMap.set(t.submitter_email, {
          name: t.submitter_name || 'Unknown',
          email: t.submitter_email,
          lastActive: t.created_at,
          ticketCount: 1
        });
      } else if (t.submitter_email) {
        uniqueMap.get(t.submitter_email).ticketCount += 1;
        if (new Date(t.created_at) > new Date(uniqueMap.get(t.submitter_email).lastActive)) {
          uniqueMap.get(t.submitter_email).lastActive = t.created_at;
        }
      }
    });

    return Array.from(uniqueMap.values());
  }, [data]);

  // If a customer is selected, show their specific details and tickets
  if (selectedCustomer) {
    const customerTickets = data?.items?.filter(t => t.submitter_email === selectedCustomer.email) || [];

    return (
      <div className="flex flex-col h-full w-full bg-white">
        <div className="p-8 pb-4 border-b border-theme-border">
          <button 
            onClick={() => setSelectedCustomer(null)}
            className="flex items-center gap-2 text-theme-textMuted hover:text-theme-textMain font-medium text-sm mb-4 transition-colors w-max"
          >
            <ChevronLeft size={16} /> Back to Directory
          </button>
          
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-theme-primary/10 text-theme-primary flex items-center justify-center font-bold text-2xl">
              {selectedCustomer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-theme-textMain tracking-tight">{selectedCustomer.name}</h2>
              <div className="flex items-center gap-2 text-sm text-theme-textMuted mt-1">
                <Mail size={14} /> {selectedCustomer.email}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex-1 p-8 overflow-y-auto bg-gray-50/30">
          <h3 className="text-lg font-semibold text-theme-textMain mb-4">Submitted Tickets</h3>
          <div className="bg-white border border-theme-border rounded-xl shadow-sm overflow-hidden">
            <TicketList 
              tickets={customerTickets}
              isLoading={isLoading}
              selectedTickets={[]}
              onToggleSelect={() => {}}
            />
          </div>
        </div>
      </div>
    );
  }

  // Otherwise, show the directory grid
  return (
    <div className="flex h-full w-full bg-white p-8">
      <div className="flex-1 flex flex-col min-w-0 max-w-6xl mx-auto">
        
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-theme-textMain tracking-tight">Customer Directory</h2>
          <p className="text-theme-textMuted mt-2 text-sm">Manage users who have submitted tickets to the system.</p>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse h-24 bg-gray-50 border border-theme-border rounded-2xl"></div>
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-gray-300 rounded-3xl text-theme-textMuted flex flex-col items-center">
             <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
               <User size={24} className="text-gray-400" />
             </div>
             <p>No customers found yet.</p>
             <p className="text-xs mt-1 text-gray-400">Customers will appear here automatically when they submit tickets.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {customers.map(c => (
              <div 
                key={c.email} 
                className="bg-white border border-theme-border rounded-2xl p-6 shadow-soft hover:shadow-md hover:border-theme-primary/30 transition-all group cursor-pointer"
                onClick={() => setSelectedCustomer(c)}
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-theme-primary/10 text-theme-primary flex items-center justify-center font-bold text-lg">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-base font-semibold text-theme-textMain truncate group-hover:text-theme-primary transition-colors">{c.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-theme-textMuted mt-0.5 truncate">
                      <Mail size={12} /> {c.email}
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Tickets</span>
                    <span className="text-sm font-semibold text-theme-textMain">{c.ticketCount}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Last Active</span>
                    <span className="text-sm font-medium text-theme-textMain flex items-center gap-1.5">
                      <Calendar size={12} className="text-gray-400" />
                      {format(new Date(c.lastActive), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
