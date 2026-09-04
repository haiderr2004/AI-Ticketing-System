import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, LoaderCircle, ShieldCheck } from 'lucide-react';
import {
  directorySummaryErrorMessage,
  getTicketDirectorySummary,
} from '../api/directorySummary';
import {
  buildDirectoryAccountUrl,
  isValidSamAccountName,
  resolveDirectoryWorkspaceUrl,
} from '../lib/workspaceNavigation';

function accountState(summary) {
  if (!summary.accountEnabled) return 'Disabled';
  return summary.lockedOut ? 'Locked' : 'Enabled';
}

export default function TicketDirectorySummary({ samAccountName, ticketId }) {
  const target = String(samAccountName || '').trim();
  const validTarget = isValidSamAccountName(target) ? target : '';
  const [chosenTarget, setChosenTarget] = useState('');
  const requestedTarget = chosenTarget === validTarget ? chosenTarget : '';
  const directoryWorkspaceUrl = resolveDirectoryWorkspaceUrl(
    import.meta.env.VITE_DIRECTORY_APP_URL,
    import.meta.env.BASE_URL,
  );
  const directoryAccountUrl = buildDirectoryAccountUrl(directoryWorkspaceUrl, validTarget, ticketId);
  const summaryQuery = useQuery({
    queryKey: ['ticket-directory-summary', requestedTarget],
    queryFn: () => getTicketDirectorySummary(requestedTarget),
    enabled: Boolean(requestedTarget),
    retry: false,
  });

  if (!validTarget) return null;

  return (
    <section className="rounded-xl border border-sky-100 bg-sky-50/70 p-3" aria-labelledby="ticket-directory-context-heading">
      <h4 id="ticket-directory-context-heading" className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Directory context</h4>
      {!requestedTarget && (
        <button
          type="button"
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-800 transition-colors hover:border-sky-400 hover:text-sky-900"
          onClick={() => setChosenTarget(validTarget)}
        >
          <ShieldCheck size={13} /> View permitted account context
        </button>
      )}
      {summaryQuery.isLoading && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-sky-800" role="status">
          <LoaderCircle size={13} className="animate-spin" /> Loading permitted directory context…
        </p>
      )}
      {summaryQuery.isError && (
        <p className="mt-2 text-xs text-rose-700" role="alert">{directorySummaryErrorMessage(summaryQuery.error)}</p>
      )}
      {summaryQuery.data && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-slate-900">{summaryQuery.data.displayName}</p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-600">@{summaryQuery.data.samAccountName}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-slate-700">
            <div><dt className="text-slate-500">Account</dt><dd className="font-medium">{accountState(summaryQuery.data)}</dd></div>
            {summaryQuery.data.department && <div><dt className="text-slate-500">Department</dt><dd className="font-medium">{summaryQuery.data.department}</dd></div>}
            {summaryQuery.data.title && <div className="col-span-2"><dt className="text-slate-500">Title</dt><dd className="font-medium">{summaryQuery.data.title}</dd></div>}
          </dl>
          {directoryAccountUrl && (
            <a className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-white py-2 text-xs font-semibold text-sky-800 transition-colors hover:border-sky-400 hover:text-sky-900" href={directoryAccountUrl}>
              <ExternalLink size={13} /> View in Directory
            </a>
          )}
        </div>
      )}
    </section>
  );
}
