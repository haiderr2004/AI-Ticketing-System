import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { getTicket, updateTicket, retriageTicket, sendTicketReply } from '../api/client';
import { Mail, Monitor, MessageSquare, Code, Github, AlertTriangle, Sparkles, ChevronLeft } from 'lucide-react';

const SourceIcon = ({ source }) => {
  switch (source) {
    case 'email': return <Mail size={16} className="text-gray-400" />;
    case 'web_form': return <Monitor size={16} className="text-gray-400" />;
    case 'slack': return <MessageSquare size={16} className="text-gray-400" />;
    case 'api': return <Code size={16} className="text-gray-400" />;
    case 'github': return <Github size={16} className="text-gray-400" />;
    default: return <Monitor size={16} className="text-gray-400" />;
  }
};

export default function TicketDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [draftReply, setDraftReply] = useState('');
  const [localStatus, setLocalStatus] = useState('');
  const [localAssignee, setLocalAssignee] = useState('');

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id),
    refetchInterval: (data) => (data?.triage_completed_at ? false : 3000),
  });

  useEffect(() => {
    if (ticket) {
      setDraftReply(ticket.ai_draft_reply || '');
      setLocalStatus(ticket.status);
      setLocalAssignee(ticket.assigned_to || 'Unassigned');
    }
  }, [ticket]);

  const updateMutation = useMutation({
    mutationFn: (data) => updateTicket(id, data),
    onSuccess: () => queryClient.invalidateQueries(['ticket', id]),
  });

  const retriageMutation = useMutation({
    mutationFn: () => retriageTicket(id),
    onSuccess: () => queryClient.invalidateQueries(['ticket', id]),
  });

  const replyMutation = useMutation({
    mutationFn: () => sendTicketReply(id),
    onSuccess: () => queryClient.invalidateQueries(['ticket', id]),
  });

  if (isLoading) return (
    <div className="p-8">
      <div className="animate-pulse flex space-x-4">
        <div className="flex-1 space-y-6 py-1">
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    </div>
  );

  if (error) return <div className="p-8 text-red-500 font-medium bg-red-50 rounded-2xl mx-8 mt-8 border border-red-200">Failed to load ticket #{id}.</div>;
  if (!ticket) return null;

  const handleStatusSave = () => {
    const isResolved = localStatus === 'resolved';
    if (isResolved && !window.confirm('Are you sure you want to mark this ticket as resolved?')) {
      return;
    }
    updateMutation.mutate({ status: localStatus, assigned_to: localAssignee === 'Unassigned' ? null : localAssignee });
  };

  const handleAcceptAssignee = () => {
    updateMutation.mutate({ assigned_to: ticket.ai_suggested_assignee });
    setLocalAssignee(ticket.ai_suggested_assignee);
  };

  const handleDraftSave = () => {
    updateMutation.mutate({ ai_draft_reply: draftReply });
  };

  return (
    <div className="flex flex-col min-h-0 h-full bg-white overflow-y-auto p-8 relative">
      <Link to="/tickets" className="inline-flex items-center gap-2 text-theme-textMuted hover:text-theme-textMain font-medium text-sm mb-6 w-max">
        <ChevronLeft size={16} /> Back to Tickets
      </Link>

      <div className="flex flex-col gap-8 max-w-5xl">
        <div className="flex items-start justify-between gap-4 flex-wrap border-b border-theme-border pb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-theme-sidebar text-white flex items-center justify-center text-xl font-bold">
              {ticket.submitter_name ? ticket.submitter_name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-theme-textMain">{ticket.title}</h1>
              <div className="flex items-center gap-2 text-sm text-theme-textMuted mt-1">
                <span>{ticket.submitter_name || 'Unknown User'}</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}</span>
                <span>•</span>
                <span className="flex items-center gap-1.5"><SourceIcon source={ticket.source} /> <span className="capitalize">{ticket.source.replace('_', ' ')}</span></span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge ${ticket.status}`}>{ticket.status.replace('_', ' ')}</span>
            <span className={`badge ${ticket.priority}`}>{ticket.priority || 'Unassigned'}</span>
            <span className={`badge ${ticket.category}`}>{ticket.category || 'Unclassified'}</span>
          </div>
        </div>

        {ticket.is_duplicate && (
          <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl flex items-center gap-3 text-orange-800 text-sm">
            <AlertTriangle size={18} className="text-orange-500" />
            <div>
              <strong>Duplicate detected</strong> — similar to ticket <Link to={`/tickets/${ticket.duplicate_of_id}`} className="underline font-medium hover:text-orange-900">#{ticket.duplicate_of_id}</Link> 
              {ticket.similarity_score && ` (${(ticket.similarity_score * 100).toFixed(0)}% match)`}.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Main Content Column */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            <div className="flex flex-col">
              <h3 className="text-sm font-semibold text-theme-textMain mb-3 uppercase tracking-wider text-gray-500">Description</h3>
              <div className="text-sm text-theme-textMain leading-relaxed whitespace-pre-wrap bg-gray-50 p-6 rounded-2xl border border-theme-border">
                {ticket.description}
              </div>
            </div>

            <div className="flex flex-col">
              <h3 className="text-sm font-semibold text-theme-textMain mb-3 flex items-center justify-between uppercase tracking-wider text-gray-500">
                <span className="flex items-center gap-2"><Sparkles size={16} className="text-purple-500" /> AI Draft Reply</span>
              </h3>
              <div className="bg-white border border-theme-border rounded-2xl p-4 shadow-sm relative focus-within:border-theme-primary transition-colors">
                <textarea 
                  className="w-full text-sm text-theme-textMain resize-y outline-none min-h-[120px] p-2 leading-relaxed bg-transparent"
                  value={draftReply}
                  onChange={(e) => setDraftReply(e.target.value)}
                  disabled={!ticket.triage_completed_at}
                  placeholder="AI is preparing a draft..."
                />
                <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <button 
                      className="bg-theme-primary hover:bg-theme-primaryHover text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                      onClick={() => replyMutation.mutate()}
                      disabled={replyMutation.isPending || !ticket.submitter_email || !draftReply || ticket.email_reply_sent}
                    >
                      {ticket.email_reply_sent ? 'Reply Sent' : replyMutation.isPending ? 'Sending...' : 'Send Reply'}
                    </button>
                    {draftReply !== ticket.ai_draft_reply && (
                      <button 
                        className="bg-gray-100 hover:bg-gray-200 text-theme-textMain px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                        onClick={handleDraftSave}
                        disabled={updateMutation.isPending}
                      >
                        Save Draft
                      </button>
                    )}
                  </div>
                  {!ticket.submitter_email && (
                    <span className="text-xs text-red-500 font-medium">Cannot send: Missing user email.</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar Column */}
          <div className="flex flex-col gap-6">
            <div className="bg-white border border-theme-border rounded-2xl p-5 shadow-soft">
              <h3 className="text-sm font-semibold text-theme-textMain mb-4 uppercase tracking-wider text-gray-500">Assignment</h3>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-theme-textMuted">Status</label>
                  <select 
                    className="w-full bg-gray-50 border border-theme-border rounded-lg px-3 py-2.5 text-sm text-theme-textMain outline-none focus:border-theme-primary transition-colors"
                    value={localStatus}
                    onChange={e => setLocalStatus(e.target.value)}
                    disabled={updateMutation.isPending}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                    <option value="duplicate">Duplicate</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-theme-textMuted">Assigned To</label>
                  <select 
                    className="w-full bg-gray-50 border border-theme-border rounded-lg px-3 py-2.5 text-sm text-theme-textMain outline-none focus:border-theme-primary transition-colors"
                    value={localAssignee}
                    onChange={e => setLocalAssignee(e.target.value)}
                    disabled={updateMutation.isPending}
                  >
                    <option value="Unassigned">Unassigned</option>
                    <option value="Infrastructure Team">Infrastructure Team</option>
                    <option value="Security Team">Security Team</option>
                    <option value="Application Support">Application Support</option>
                    <option value="Database Team">Database Team</option>
                    <option value="Help Desk">Help Desk</option>
                    <option value="Management">Management</option>
                  </select>
                </div>
                <button 
                  className="w-full bg-theme-sidebar hover:bg-theme-sidebarActive text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 mt-2"
                  onClick={handleStatusSave}
                  disabled={updateMutation.isPending || (localStatus === ticket.status && localAssignee === (ticket.assigned_to || 'Unassigned'))}
                >
                  {updateMutation.isPending ? 'Saving...' : 'Update Details'}
                </button>
              </div>
            </div>

            <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-5 relative overflow-hidden shadow-soft">
              {!ticket.triage_completed_at && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10">
                  <div className="flex flex-col items-center gap-2 text-purple-600 font-medium text-sm">
                    <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    Running AI Analysis...
                  </div>
                </div>
              )}
              
              <h3 className="text-sm font-semibold text-purple-900 mb-4 flex items-center gap-2">
                <Sparkles size={16} /> AI Intelligence
              </h3>
              
              <div className="flex flex-col gap-4">
                <div>
                  <div className="text-[11px] font-semibold text-purple-600 uppercase mb-1">Summary</div>
                  <div className="text-sm text-purple-900 leading-relaxed">{ticket.ai_summary || 'Pending...'}</div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-purple-600 uppercase mb-1">Routing Recommendation</div>
                  <div className="flex items-center justify-between bg-white border border-purple-100 px-3 py-2.5 rounded-lg text-sm text-purple-900 font-medium">
                    {ticket.ai_suggested_assignee || 'Pending...'}
                    {ticket.ai_suggested_assignee && ticket.assigned_to !== ticket.ai_suggested_assignee && (
                      <button 
                        className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 px-2.5 py-1 rounded hover:bg-purple-200 transition-colors"
                        onClick={handleAcceptAssignee}
                        disabled={updateMutation.isPending}
                      >
                        Apply
                      </button>
                    )}
                  </div>
                </div>

                {ticket.ai_confidence_score !== null && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-purple-600 uppercase mb-1.5">
                      <span>Confidence Score</span>
                      <span>{(ticket.ai_confidence_score * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-purple-100 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${ticket.ai_confidence_score * 100}%` }}></div>
                    </div>
                  </div>
                )}

                {ticket.triage_reasoning && (
                  <details className="mt-2 text-sm group">
                    <summary className="text-purple-600 font-medium cursor-pointer hover:text-purple-800 transition-colors outline-none list-none flex items-center gap-1.5 text-xs">
                      <span className="group-open:rotate-90 transition-transform">▸</span> View reasoning logic
                    </summary>
                    <div className="mt-2 p-3 bg-white border border-purple-100 rounded-lg text-xs text-purple-800 leading-relaxed">
                      {ticket.triage_reasoning}
                    </div>
                  </details>
                )}

                <div className="pt-4 border-t border-purple-100 mt-2">
                  <button 
                    className="w-full text-xs font-semibold text-purple-600 hover:text-purple-800 transition-colors flex justify-center items-center gap-1.5"
                    onClick={() => {
                      if(window.confirm('Re-run AI analysis on this ticket? This will update the summary and draft.')) {
                        retriageMutation.mutate();
                      }
                    }}
                    disabled={retriageMutation.isPending || !ticket.triage_completed_at}
                  >
                    {retriageMutation.isPending ? 'Processing...' : '↻ Re-run Analysis'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
