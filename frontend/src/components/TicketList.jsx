import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Mail, Monitor, MessageSquare, Code, Github } from 'lucide-react';

const SourceIcon = ({ source }) => {
  switch (source) {
    case 'email': return <Mail size={14} className="text-gray-500" />;
    case 'web_form': return <Monitor size={14} className="text-gray-500" />;
    case 'slack': return <MessageSquare size={14} className="text-gray-500" />;
    case 'api': return <Code size={14} className="text-gray-500" />;
    case 'github': return <Github size={14} className="text-gray-500" />;
    default: return <Monitor size={14} className="text-gray-500" />;
  }
};

export default function TicketList({ tickets, isLoading, onSort }) {
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="p-10 text-center text-gray-500">Loading tickets...</div>;
  }

  if (!tickets || tickets.length === 0) {
    return <div className="p-10 text-center text-gray-500">No tickets found.</div>;
  }

  return (
    <div className="table-wrap bg-white rounded-lg border border-gray-200">
      <table className="w-full text-left">
        <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
          <tr>
            <th className="font-semibold px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => onSort('id')}>ID</th>
            <th className="font-semibold px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => onSort('title')}>Title</th>
            <th className="font-semibold px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => onSort('priority')}>Priority</th>
            <th className="font-semibold px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => onSort('category')}>Category</th>
            <th className="font-semibold px-4 py-3">Source</th>
            <th className="font-semibold px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => onSort('status')}>Status</th>
            <th className="font-semibold px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => onSort('created_at')}>Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tickets.map((ticket) => (
            <tr 
              key={ticket.id} 
              onClick={() => navigate(`/tickets/${ticket.id}`)}
              className="hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 font-mono text-gray-400 text-xs">#{ticket.id}</td>
              <td className="px-4 py-3 font-medium text-gray-900 max-w-[240px] truncate" title={ticket.title}>
                {ticket.title}
              </td>
              <td className="px-4 py-3">
                <span className={`badge ${ticket.priority}`}>{ticket.priority || 'unassigned'}</span>
              </td>
              <td className="px-4 py-3">
                <span className={`badge ${ticket.category}`}>{ticket.category || 'unclassified'}</span>
              </td>
              <td className="px-4 py-3 flex items-center gap-1 text-xs text-gray-500">
                <SourceIcon source={ticket.source} /> 
                <span className="capitalize">{ticket.source.replace('_', ' ')}</span>
              </td>
              <td className="px-4 py-3">
                <span className={`badge ${ticket.status}`}>{ticket.status.replace('_', ' ')}</span>
              </td>
              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
