import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, ShieldCheck } from 'lucide-react';
import { approveDirectoryAction } from '../api/client';
import { getDirectoryActionProposal } from '../lib/directoryActionProposal';
import TicketDirectorySummary from './TicketDirectorySummary';

const CLOSED_STATUSES = ['resolved', 'closed', 'duplicate'];

export default function DirectoryActionPanel({ ticket, ticketId }) {
  const queryClient = useQueryClient();
  const proposal = useMemo(() => getDirectoryActionProposal(ticket.triage_reasoning), [ticket.triage_reasoning]);
  const [action, setAction] = useState('reset_password');
  const [target, setTarget] = useState('');
  const [password, setPassword] = useState('');
  const [groupDn, setGroupDn] = useState('');
  const [error, setError] = useState('');
  const disabled = CLOSED_STATUSES.includes(ticket.status);

  useEffect(() => {
    if (!proposal) return;
    setAction(proposal.action);
    setTarget(proposal.target_sam_account_name);
    setGroupDn(proposal.group_dns?.[0] || '');
  }, [proposal]);

  const approvalMutation = useMutation({
    mutationFn: (approval) => approveDirectoryAction(ticketId, approval),
    onSuccess: () => {
      setPassword('');
      setError('');
      queryClient.invalidateQueries(['ticket', ticketId]);
    },
    onError: (requestError) => setError(requestError.response?.data?.detail || 'Directory action could not be completed.'),
  });

  function submitApproval() {
    const approval = {
      action,
      target_sam_account_name: target.trim(),
      ...(action === 'reset_password' ? { new_password: password } : { group_dns: [groupDn.trim()] }),
    };
    const label = action === 'reset_password' ? 'reset this password' : 'assign this group';
    if (window.confirm(`Approve and ${label} for ${approval.target_sam_account_name}?`)) approvalMutation.mutate(approval);
  }

  const formIncomplete = !target.trim() || (action === 'reset_password' ? password.length < 12 : !groupDn.trim());

  return (
    <section className="bg-white rounded-2xl border border-theme-border shadow-soft p-4">
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Directory Action</h3>
      <p className="text-xs text-theme-textMuted mb-3">A technician must review and approve every action. Passwords are never saved to the ticket.</p>
      {proposal && (
        <div className="mb-3 rounded-xl border border-purple-100 bg-purple-50 p-3 text-xs text-purple-900">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><Bot size={13} className="text-purple-600" /> AI proposal — review before executing</div>
          <p>{proposal.action === 'reset_password' ? `Reset the password for @${proposal.target_sam_account_name}.` : `Add @${proposal.target_sam_account_name} to the requested group.`}</p>
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        <select className="w-full bg-gray-50 border border-theme-border rounded-lg px-3 py-2 text-sm text-theme-textMain outline-none focus:border-theme-primary" disabled={approvalMutation.isPending || disabled} onChange={(event) => { setAction(event.target.value); setError(''); }} value={action}>
          <option value="reset_password">Reset password</option>
          <option value="add_group">Add to security group</option>
        </select>
        <input className="w-full bg-gray-50 border border-theme-border rounded-lg px-3 py-2 text-sm text-theme-textMain outline-none focus:border-theme-primary" disabled={approvalMutation.isPending || disabled} onChange={(event) => setTarget(event.target.value)} placeholder="Target sAMAccountName" value={target} />
        {action === 'reset_password' ? (
          <input autoComplete="new-password" className="w-full bg-gray-50 border border-theme-border rounded-lg px-3 py-2 text-sm text-theme-textMain outline-none focus:border-theme-primary" disabled={approvalMutation.isPending || disabled} onChange={(event) => setPassword(event.target.value)} placeholder="Temporary password (12+ characters)" type="password" value={password} />
        ) : (
          <input className="w-full bg-gray-50 border border-theme-border rounded-lg px-3 py-2 text-sm text-theme-textMain outline-none focus:border-theme-primary" disabled={approvalMutation.isPending || disabled} onChange={(event) => setGroupDn(event.target.value)} placeholder="Group distinguished name" value={groupDn} />
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <TicketDirectorySummary samAccountName={target} ticketId={ticketId} />
        <button className="flex w-full items-center justify-center gap-1.5 bg-theme-primary hover:bg-theme-primaryHover text-white py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40" disabled={approvalMutation.isPending || formIncomplete || disabled} onClick={submitApproval}>
          <ShieldCheck size={14} />{approvalMutation.isPending ? 'Executing…' : 'Approve & Execute'}
        </button>
      </div>
    </section>
  );
}
