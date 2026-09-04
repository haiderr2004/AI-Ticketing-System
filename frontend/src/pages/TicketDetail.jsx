import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { getTicket, updateTicket, retriageTicket, sendTicketReply } from '../api/client';
import DirectoryActionPanel from '../components/DirectoryActionPanel';
import { getReadableTriageReasoning } from '../lib/directoryActionProposal';
import {
  Mail, Monitor, MessageSquare, Code, AlertTriangle,
  Sparkles, ChevronLeft, Bot, Clock3, RefreshCw, Send, CheckCircle2
} from 'lucide-react';

const SOURCE_ICON = {
  email:    <Mail size={13} className="text-gray-400" />,
  web_form: <Monitor size={13} className="text-gray-400" />,
  slack:    <MessageSquare size={13} className="text-gray-400" />,
  api:      <Code size={13} className="text-gray-400" />,
};

const PRIORITY_SLA = {
  critical: 'Within 1 hour',
  high:     'Within 4 hours',
  medium:   'Same business day',
  low:      'Within 2 business days',
};

const PRIORITY_TONE = {
  critical: 'bg-red-50 text-red-700 border-red-100',
  high:     'bg-amber-50 text-amber-700 border-amber-100',
  medium:   'bg-blue-50 text-blue-700 border-blue-100',
  low:      'bg-slate-100 text-slate-600 border-slate-200',
};

function fmt(val) {
  return String(val || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getNextStep(ticket) {
  const p = String(ticket.priority || '').toLowerCase();
  const c = String(ticket.category || '').toLowerCase();
  if (p === 'critical') return 'Escalate immediately, assign an owner, and notify stakeholders.';
  if (c === 'access_request') return 'Validate the user account, confirm identity, and restore access or reset credentials.';
  if (c === 'security') return 'Preserve evidence, review for suspicious activity, and escalate to the security team.';
  if (c === 'infrastructure' || c === 'networking') return 'Check service health, confirm impact scope, and begin troubleshooting with the assigned team.';
  if (c === 'hardware') return 'Confirm the device details, arrange remote or on-site diagnostics, and log the hardware issue.';
  if (c === 'printing') return 'Check printer status and connectivity, clear any queued jobs, and confirm driver installation.';
  return 'Review ticket details, confirm the assigned owner, and proceed with the recommended response.';
}

export default function TicketDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [draftReply, setDraftReply]   = useState('');
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

  const updateMutation  = useMutation({ mutationFn: (d) => updateTicket(id, d),  onSuccess: () => queryClient.invalidateQueries(['ticket', id]) });
  const retriageMutation = useMutation({ mutationFn: () => retriageTicket(id),   onSuccess: () => queryClient.invalidateQueries(['ticket', id]) });
  const replyMutation    = useMutation({ mutationFn: () => sendTicketReply(id),  onSuccess: () => queryClient.invalidateQueries(['ticket', id]) });

  if (isLoading) return (
    <div className="h-full p-6 flex flex-col gap-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
    </div>
  );
  if (error)  return <div className="p-8 text-red-500 bg-red-50 rounded-2xl m-6 border border-red-200 text-sm">Failed to load ticket #{id}.</div>;
  if (!ticket) return null;

  const isDirty = draftReply !== (ticket.ai_draft_reply || '');
  const assigneeChanged = localAssignee !== (ticket.assigned_to || 'Unassigned');
  const statusChanged   = localStatus   !== ticket.status;
  const confidencePct   = ticket.ai_confidence_score != null ? Math.round(ticket.ai_confidence_score * 100) : null;

  return (
    <div className="h-full overflow-hidden flex flex-col">

      {/* ── Header bar ── */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-gray-100">
        <Link to="/tickets" className="inline-flex items-center gap-1.5 text-xs font-medium text-theme-textMuted hover:text-theme-textMain transition-colors mb-3">
          <ChevronLeft size={14} /> Back to Tickets
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-theme-sidebar text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
              {(ticket.submitter_name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-theme-textMain leading-tight truncate max-w-[640px]">{ticket.title}</h1>
              <div className="flex items-center gap-2 text-xs text-theme-textMuted mt-0.5 flex-wrap">
                <span>{ticket.submitter_name || 'Unknown'}</span>
                <span className="text-gray-300">·</span>
                <span>{formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}</span>
                <span className="text-gray-300">·</span>
                <span className="flex items-center gap-1 capitalize">
                  {SOURCE_ICON[ticket.source] || <Monitor size={13} className="text-gray-400" />}
                  {ticket.source?.replace('_', ' ')}
                </span>
                <span className="text-gray-300">·</span>
                <span className="font-medium text-gray-500">#{id}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`badge ${ticket.status}`}>{fmt(ticket.status)}</span>
            <span className={`badge ${ticket.priority}`}>{fmt(ticket.priority) || 'No priority'}</span>
            <span className={`badge ${ticket.category}`}>{fmt(ticket.category) || 'Unclassified'}</span>
            {ticket.is_duplicate && (
              <span className="badge bg-orange-100 text-orange-700">Duplicate</span>
            )}
          </div>
        </div>

        {ticket.is_duplicate && (
          <div className="mt-3 bg-orange-50 border border-orange-200 px-4 py-2.5 rounded-xl flex items-center gap-2 text-orange-800 text-xs">
            <AlertTriangle size={14} className="text-orange-500 flex-shrink-0" />
            Similar to ticket{' '}
            <Link to={`/tickets/${ticket.duplicate_of_id}`} className="underline font-semibold hover:text-orange-900">
              #{ticket.duplicate_of_id}
            </Link>
            {ticket.similarity_score && ` — ${(ticket.similarity_score * 100).toFixed(0)}% match`}
          </div>
        )}
      </div>

      {/* ── Main columns ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-0 divide-x divide-gray-100">

        {/* Left — Description + Draft reply */}
        <div className="lg:col-span-2 flex flex-col overflow-y-auto custom-scroll p-5 gap-4">

          {/* Description */}
          <div className="bg-gray-50 rounded-2xl border border-theme-border p-5">
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Description</h3>
            <p className="text-sm text-theme-textMain leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* AI Draft Reply */}
          <div className="bg-white rounded-2xl border border-theme-border shadow-soft flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles size={13} className="text-purple-400" /> AI Draft Reply
              </h3>
              {ticket.email_reply_sent && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={11} /> Sent
                </span>
              )}
            </div>
            <textarea
              className="flex-1 w-full text-sm text-theme-textMain resize-none outline-none p-5 leading-relaxed bg-transparent min-h-[140px]"
              value={draftReply}
              onChange={e => setDraftReply(e.target.value)}
              disabled={!ticket.triage_completed_at}
              placeholder={ticket.triage_completed_at ? 'No draft generated.' : 'AI is preparing a draft…'}
            />
            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2 bg-gray-50/50">
              <button
                onClick={() => replyMutation.mutate()}
                disabled={replyMutation.isPending || !ticket.submitter_email || !draftReply || ticket.email_reply_sent}
                className="flex items-center gap-1.5 bg-theme-primary hover:bg-theme-primaryHover text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
              >
                <Send size={13} />
                {ticket.email_reply_sent ? 'Reply Sent' : replyMutation.isPending ? 'Sending…' : 'Send Reply'}
              </button>
              {isDirty && (
                <button
                  onClick={() => updateMutation.mutate({ ai_draft_reply: draftReply })}
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-theme-textMain transition-colors disabled:opacity-40"
                >
                  Save Draft
                </button>
              )}
              {!ticket.submitter_email && (
                <span className="text-xs text-red-400 ml-1">No email on file — cannot send.</span>
              )}
            </div>
          </div>
        </div>

        {/* Right — Assignment + AI Triage */}
        <div className="flex flex-col overflow-y-scroll custom-scroll p-5 gap-4 pb-8">

          {/* Assignment */}
          <div className="bg-white rounded-2xl border border-theme-border shadow-soft p-4">
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Assignment</h3>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-theme-textMuted">Status</label>
                <select
                  className="w-full bg-gray-50 border border-theme-border rounded-lg px-3 py-2 text-sm text-theme-textMain outline-none focus:border-theme-primary transition-colors"
                  value={localStatus}
                  onChange={e => setLocalStatus(e.target.value)}
                  disabled={updateMutation.isPending}
                >
                  {['open','in_progress','resolved','closed','duplicate'].map(s => (
                    <option key={s} value={s}>{fmt(s)}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-theme-textMuted">Assigned To</label>
                <select
                  className="w-full bg-gray-50 border border-theme-border rounded-lg px-3 py-2 text-sm text-theme-textMain outline-none focus:border-theme-primary transition-colors"
                  value={localAssignee}
                  onChange={e => setLocalAssignee(e.target.value)}
                  disabled={updateMutation.isPending}
                >
                  {['Unassigned','Help Desk','Infrastructure Team','Security Team','Application Support','Database Team','Management'].map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => {
                  if (localStatus === 'resolved' && !window.confirm('Mark this ticket as resolved?')) return;
                  updateMutation.mutate({ status: localStatus, assigned_to: localAssignee === 'Unassigned' ? null : localAssignee });
                }}
                disabled={updateMutation.isPending || (!statusChanged && !assigneeChanged)}
                className="w-full bg-theme-sidebar hover:bg-theme-sidebarActive text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
              >
                {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* AI Triage Panel */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 rounded-2xl p-4 relative">
            {!ticket.triage_completed_at && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-10 rounded-2xl overflow-hidden">
                <div className="flex flex-col items-center gap-2 text-purple-600 text-sm font-medium">
                  <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  Running AI Analysis…
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mb-3">
              <Bot size={14} className="text-purple-500" />
              <h3 className="text-xs font-bold text-purple-800 uppercase tracking-widest">AI Triage</h3>
            </div>

            {/* Summary */}
            {ticket.ai_summary && (
              <div className="bg-white/80 rounded-xl p-3 border border-purple-100 mb-3">
                <div className="text-[10px] font-bold text-purple-500 uppercase tracking-wider mb-1">Summary</div>
                <p className="text-xs text-purple-900 leading-relaxed">{ticket.ai_summary}</p>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <StatPill label="Priority"  value={fmt(ticket.priority  || 'Pending')} tone={ticket.priority} />
              <StatPill label="Category"  value={fmt(ticket.category  || 'Pending')} />
              <StatPill
                label="Suggested Team"
                value={ticket.ai_suggested_assignee || 'Pending'}
                action={
                  ticket.ai_suggested_assignee && ticket.assigned_to !== ticket.ai_suggested_assignee
                    ? { label: 'Apply', onClick: () => { updateMutation.mutate({ assigned_to: ticket.ai_suggested_assignee }); setLocalAssignee(ticket.ai_suggested_assignee); }, disabled: updateMutation.isPending }
                    : null
                }
              />
              <StatPill label="SLA Target" value={PRIORITY_SLA[ticket.priority] || 'Manual review'} icon={<Clock3 size={11} />} />
            </div>

            {/* Next step */}
            <div className="bg-white/80 rounded-xl p-3 border border-purple-100 mb-3">
              <div className="text-[10px] font-bold text-purple-500 uppercase tracking-wider mb-1">Recommended Next Step</div>
              <p className="text-xs text-theme-textMain leading-relaxed">{getNextStep(ticket)}</p>
            </div>

            {/* Confidence */}
            {confidencePct !== null && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-[10px] font-bold text-purple-500 uppercase tracking-wider mb-1">
                  <span>Confidence</span><span>{confidencePct}%</span>
                </div>
                <div className="h-1.5 bg-purple-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${confidencePct}%` }} />
                </div>
              </div>
            )}

            {/* Reasoning */}
            {ticket.triage_reasoning && (
              <details className="mb-3 group">
                <summary className="text-[11px] text-purple-600 font-semibold cursor-pointer hover:text-purple-800 list-none flex items-center gap-1 outline-none">
                  <span className="group-open:rotate-90 transition-transform inline-block">▸</span> View reasoning
                </summary>
                <div className="mt-2 p-3 bg-white border border-purple-100 rounded-lg text-[11px] text-purple-800 leading-relaxed">
                  {getReadableTriageReasoning(ticket.triage_reasoning)}
                </div>
              </details>
            )}

            {/* Re-run */}
            <button
              onClick={() => {
                if (window.confirm('Re-run AI analysis on this ticket?')) retriageMutation.mutate();
              }}
              disabled={retriageMutation.isPending || !ticket.triage_completed_at}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-purple-600 hover:text-purple-800 border border-purple-200 bg-white/60 hover:bg-white py-2 rounded-lg transition-colors disabled:opacity-40"
            >
              <RefreshCw size={11} className={retriageMutation.isPending ? 'animate-spin' : ''} />
              {retriageMutation.isPending ? 'Processing…' : 'Re-run Analysis'}
            </button>
          </div>

          <DirectoryActionPanel ticket={ticket} ticketId={id} />

        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, tone, icon, action }) {
  const toneClass = PRIORITY_TONE[tone] || 'bg-white text-theme-textMain border-purple-100';
  return (
    <div className={`rounded-xl border p-2.5 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">{label}</div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold leading-snug flex items-center gap-1">{icon}{value}</span>
        {action && (
          <button
            onClick={action.onClick}
            disabled={action.disabled}
            className="text-[10px] font-bold bg-white/80 hover:bg-white px-2 py-0.5 rounded transition-colors"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
