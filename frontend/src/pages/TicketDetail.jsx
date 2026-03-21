import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { getTicket, updateTicket, retriageTicket, sendTicketReply } from '../api/client';
import { Mail, Monitor, MessageSquare, Code, Github, AlertTriangle } from 'lucide-react';

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

export default function TicketDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [draftReply, setDraftReply] = useState('');
  const [localStatus, setLocalStatus] = useState('');
  const [localAssignee, setLocalAssignee] = useState('');

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id),
    refetchInterval: (data) => (data?.triage_completed_at ? false : 3000), // Auto-refresh if not triaged yet
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

  if (isLoading) return <div className="p-10 text-gray-500 text-center animate-pulse">Loading ticket #{id}...</div>;
  if (error) return <div className="p-10 text-red-500 text-center border border-red-200 bg-red-50 rounded-lg">Failed to load ticket #{id}. It may not exist.</div>;
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
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-sm text-gray-500">#{ticket.id}</span>
        <h2 className="text-lg font-semibold text-gray-900 tracking-tight">{ticket.title}</h2>
      </div>

      <div className="detail-meta">
        <span className={`badge ${ticket.priority}`}>{ticket.priority || 'unassigned'}</span>
        <span className={`badge ${ticket.category}`}>{ticket.category || 'unclassified'}</span>
        <span className={`badge ${ticket.status}`}>{ticket.status.replace('_', ' ')}</span>
        <span className="meta-note flex items-center gap-1">
          via <SourceIcon source={ticket.source} /> {ticket.source.replace('_', ' ')} &bull; 
          {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })} &bull; 
          {ticket.submitter_name || 'Unknown'} ({ticket.submitter_email || 'No email'})
        </span>
      </div>

      {ticket.is_duplicate && (
        <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex items-center gap-2 text-yellow-800 text-sm">
          <AlertTriangle size={16} />
          <strong>Duplicate detected</strong> — similar to ticket <Link to={`/tickets/${ticket.duplicate_of_id}`} className="underline">#{ticket.duplicate_of_id}</Link> 
          {ticket.similarity_score && ` (${(ticket.similarity_score * 100).toFixed(0)}% match)`}.
        </div>
      )}

      <div className="two-col items-start">
        {/* Left Column */}
        <div className="flex flex-col gap-4 w-full">
          <div>
            <div className="section-head">Description</div>
            <div className="desc-box whitespace-pre-wrap">{ticket.description}</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm mt-4">
            <div className="section-head">Status & assignment</div>
            <div className="status-row mt-2">
              <select 
                className="filter-select bg-gray-50 border-gray-300"
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
              
              <select 
                className="filter-select bg-gray-50 border-gray-300"
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
              
              <button 
                className="btn-primary ml-auto bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                onClick={handleStatusSave}
                disabled={updateMutation.isPending || (localStatus === ticket.status && localAssignee === (ticket.assigned_to || 'Unassigned'))}
              >
                {updateMutation.isPending ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (AI Triage) */}
        <div className="flex flex-col gap-4 w-full">
          <div className="section-head flex items-center justify-between">
            <span>AI Triage Results</span>
            {!ticket.triage_completed_at && <span className="text-blue-500 animate-pulse normal-case font-normal text-xs">Triaging...</span>}
          </div>

          <div className="ai-panel relative">
            {!ticket.triage_completed_at && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-md">
                <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            )}
            
            <div className="ai-label">Summary</div>
            <div className="ai-text mb-4">{ticket.ai_summary || 'Waiting for AI...'}</div>
            
            <div className="ai-label mt-4">Suggested assignee</div>
            <div className="ai-text flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-100">
              <span className="font-medium">{ticket.ai_suggested_assignee || 'Waiting for AI...'}</span>
              {ticket.ai_suggested_assignee && ticket.assigned_to !== ticket.ai_suggested_assignee && (
                <button 
                  className="btn-ghost text-[10px] py-1 px-2 h-auto"
                  onClick={handleAcceptAssignee}
                  disabled={updateMutation.isPending}
                >
                  Accept
                </button>
              )}
            </div>

            {ticket.ai_confidence_score !== null && (
              <div className="mt-4">
                <div className="ai-label flex justify-between">
                  <span>AI confidence</span>
                  <span>{(ticket.ai_confidence_score * 100).toFixed(0)}%</span>
                </div>
                <div className="confidence-bar">
                  <div 
                    className="confidence-fill bg-blue-500" 
                    style={{ width: `${ticket.ai_confidence_score * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {ticket.triage_reasoning && (
              <details className="mt-4 text-xs">
                <summary className="text-gray-500 cursor-pointer hover:text-gray-700 font-medium">View AI Reasoning</summary>
                <div className="mt-2 text-gray-600 bg-gray-50 p-2 rounded border border-gray-100 leading-relaxed">
                  {ticket.triage_reasoning}
                </div>
              </details>
            )}
          </div>

          <div className="section-head mt-2">AI draft reply</div>
          <textarea 
            className="draft-box w-full bg-yellow-50/30 border-yellow-200 focus:ring-yellow-500 focus:border-yellow-500 transition-colors"
            value={draftReply}
            onChange={(e) => setDraftReply(e.target.value)}
            disabled={!ticket.triage_completed_at}
          />
          
          <div className="action-row flex flex-wrap gap-2 items-center">
            <button 
              className="btn-primary bg-green-600 hover:bg-green-700 disabled:opacity-50"
              onClick={() => replyMutation.mutate()}
              disabled={replyMutation.isPending || !ticket.submitter_email || !draftReply || ticket.email_reply_sent}
            >
              {ticket.email_reply_sent ? 'Reply sent ✓' : replyMutation.isPending ? 'Sending...' : 'Send reply'}
            </button>
            
            {draftReply !== ticket.ai_draft_reply && (
              <button 
                className="btn-ghost"
                onClick={handleDraftSave}
                disabled={updateMutation.isPending}
              >
                Save draft changes
              </button>
            )}
            
            <button 
              className="btn-ghost ml-auto text-gray-500 hover:text-gray-900 border-gray-300"
              onClick={() => {
                if(window.confirm('This will overwrite current AI fields. Continue?')) {
                  retriageMutation.mutate();
                }
              }}
              disabled={retriageMutation.isPending || !ticket.triage_completed_at}
            >
              {retriageMutation.isPending ? 'Retriaging...' : 'Re-run triage'}
            </button>
          </div>
          {!ticket.submitter_email && (
            <div className="text-xs text-red-500 mt-1">Cannot send reply: No submitter email provided.</div>
          )}
        </div>
      </div>
    </div>
  );
}
