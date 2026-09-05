import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ChevronLeft, ChevronRight, Clock3, ExternalLink, RefreshCw, ShieldAlert } from 'lucide-react';
import { getNativeAdActivity, getNativeAdActivityHealth, getPortalAuditActivity, getTicketActivityEvents } from '../api/client';
import { normalizeActivityResponse, resultLabels, sourceLabels } from '../lib/activityFeed';

const PAGE_SIZE = 25;
const SOURCES = [
  ['all', 'All activity'], ['ad_security', 'AD Security Log'], ['portal_audit', 'Portal Audit'], ['ticketing', 'Tickets'],
];
const CATEGORIES = ['', 'account_access', 'group_access', 'profile', 'account_status', 'directory_view', 'ticket_workflow', 'directory_change'];
const OUTCOMES = ['', 'success', 'failed', 'rejected', 'in_progress', 'unknown', 'informational'];

function defaultFilters() {
  const end = new Date();
  const start = new Date(end.getTime() - (7 * 24 * 60 * 60 * 1000));
  const local = (value) => new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return { startAt: local(start), endAt: local(end), outcome: '', category: '', actor: '', account: '', ticketId: '', code: '' };
}

function toIso(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function sourceParams(filters, source, offset) {
  const common = { start_at: toIso(filters.startAt), end_at: toIso(filters.endAt), limit: PAGE_SIZE, offset };
  if (filters.outcome) common.result = filters.outcome;
  if (filters.category) common.category = filters.category;
  if (filters.actor) common.actor = filters.actor;
  if (filters.account) common.target = filters.account;
  if (filters.ticketId) common.ticket_id = filters.ticketId;
  if (source === 'portal_audit' && filters.code) common.action = filters.code;
  if (source === 'ticketing' && filters.code) common.event_type = filters.code;
  if (source === 'ad_security' && /^\d+$/.test(filters.code)) common.event_id = Number(filters.code);
  return common;
}

function timeLabel(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function ErrorNotice({ source, error }) {
  if (!error) return null;
  return <div role="status" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertCircle size={16} />{sourceLabels[source]} is unavailable. Other sources may still be shown.</div>;
}

function SourcePager({ source, page, onChange }) {
  const canPrevious = page.offset > 0;
  const canNext = page.offset + page.entries.length < page.total;
  return <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
    <span>{sourceLabels[source]}: {page.total ? `${page.offset + 1}–${Math.min(page.offset + page.entries.length, page.total)} of ${page.total}` : 'No matching entries'}</span>
    <div className="flex gap-2"><button disabled={!canPrevious} onClick={() => onChange(Math.max(0, page.offset - PAGE_SIZE))} className="rounded border border-slate-200 p-1.5 disabled:opacity-40" aria-label={`Previous ${sourceLabels[source]} page`}><ChevronLeft size={15} /></button><button disabled={!canNext} onClick={() => onChange(page.offset + PAGE_SIZE)} className="rounded border border-slate-200 p-1.5 disabled:opacity-40" aria-label={`Next ${sourceLabels[source]} page`}><ChevronRight size={15} /></button></div>
  </div>;
}

function ResultPill({ result }) {
  const palette = { success: 'border-emerald-200 bg-emerald-50 text-emerald-700', failed: 'border-rose-200 bg-rose-50 text-rose-700', rejected: 'border-amber-200 bg-amber-50 text-amber-800', in_progress: 'border-sky-200 bg-sky-50 text-sky-700', unknown: 'border-violet-200 bg-violet-50 text-violet-700', informational: 'border-slate-200 bg-slate-50 text-slate-700' };
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${palette[result] || palette.unknown}`}>{resultLabels[result] || resultLabels.unknown}</span>;
}

function DetailPanel({ entry, directoryWorkspaceUrl }) {
  if (!entry) return <aside className="hidden min-w-[260px] border-l border-slate-200 bg-slate-50 p-5 xl:block"><p className="text-sm font-semibold text-slate-700">Event details</p><p className="mt-2 text-sm leading-6 text-slate-500">Select an activity entry to review its sanitized context.</p></aside>;
  const viewAccountUrl = entry.targetAccount ? `${directoryWorkspaceUrl.replace(/\/$/, '') || ''}/#account=${encodeURIComponent(entry.targetAccount)}` : '';
  return <aside className="min-w-[280px] border-l border-slate-200 bg-slate-50 p-5" aria-label="Selected activity details"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{sourceLabels[entry.source]}</p><h2 className="mt-1 text-base font-semibold text-slate-950">Event details</h2></div><ResultPill result={entry.result} /></div><p className="mt-4 text-sm leading-6 text-slate-700">{entry.description}</p><dl className="mt-5 space-y-3 text-sm"><div><dt className="text-slate-500">Event time</dt><dd className="font-medium text-slate-800">{timeLabel(entry.occurredAt)}</dd></div>{entry.collectedAt && <div><dt className="text-slate-500">Collected</dt><dd className="font-medium text-slate-800">{timeLabel(entry.collectedAt)}</dd></div>}<div><dt className="text-slate-500">Category / code</dt><dd className="font-medium text-slate-800">{entry.category} · {entry.rawCode}</dd></div>{entry.actor && <div><dt className="text-slate-500">Actor</dt><dd className="font-medium text-slate-800">{entry.actor}</dd></div>}{entry.targetAccount && <div><dt className="text-slate-500">Account target</dt><dd className="font-medium text-slate-800">{entry.targetAccount}</dd></div>}{entry.ticketId && <div><dt className="text-slate-500">Ticket</dt><dd className="font-medium text-slate-800">#{entry.ticketId}</dd></div>}{entry.source === 'ad_security' && <><div><dt className="text-slate-500">Domain controller</dt><dd className="font-medium text-slate-800">{entry.safeMetadata.domain_controller || 'Unavailable'}</dd></div><div><dt className="text-slate-500">Native event / record ID</dt><dd className="font-medium text-slate-800">{entry.safeMetadata.event_id || entry.rawCode} / {entry.safeMetadata.event_record_id || 'Unavailable'}</dd></div></>}</dl><div className="mt-6 flex flex-wrap gap-2">{entry.ticketId && <Link to={`/tickets/${entry.ticketId}`} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700"><ExternalLink size={14} />Open ticket</Link>}{viewAccountUrl && <a href={viewAccountUrl} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700"><ExternalLink size={14} />View account</a>}</div></aside>;
}

export default function ActivityWorkspace({ directoryWorkspaceUrl }) {
  const [filters, setFilters] = useState(defaultFilters);
  const [source, setSource] = useState('all');
  const [offsets, setOffsets] = useState({ ad_security: 0, portal_audit: 0, ticketing: 0 });
  const [selected, setSelected] = useState(null);
  const setField = (field, value) => { setFilters((current) => ({ ...current, [field]: value })); setOffsets({ ad_security: 0, portal_audit: 0, ticketing: 0 }); setSelected(null); };
  const enabled = (name) => source === 'all' || source === name;
  const adQuery = useQuery({ queryKey: ['activity', 'ad_security', filters, offsets.ad_security], queryFn: () => getNativeAdActivity(sourceParams(filters, 'ad_security', offsets.ad_security)), enabled: enabled('ad_security'), retry: false });
  const portalQuery = useQuery({ queryKey: ['activity', 'portal_audit', filters, offsets.portal_audit], queryFn: () => getPortalAuditActivity(sourceParams(filters, 'portal_audit', offsets.portal_audit)), enabled: enabled('portal_audit'), retry: false });
  const ticketQuery = useQuery({ queryKey: ['activity', 'ticketing', filters, offsets.ticketing], queryFn: () => getTicketActivityEvents(sourceParams(filters, 'ticketing', offsets.ticketing)), enabled: enabled('ticketing'), retry: false });
  const healthQuery = useQuery({ queryKey: ['activity', 'ad-health'], queryFn: getNativeAdActivityHealth, retry: false });
  const pages = { ad_security: normalizeActivityResponse(adQuery.data, 'ad_security'), portal_audit: normalizeActivityResponse(portalQuery.data, 'portal_audit'), ticketing: normalizeActivityResponse(ticketQuery.data, 'ticketing') };
  const rows = useMemo(() => Object.entries(pages).filter(([name]) => enabled(name)).flatMap(([, page]) => page.entries).sort((a, b) => String(b.occurredAt || '').localeCompare(String(a.occurredAt || ''))), [adQuery.data, portalQuery.data, ticketQuery.data, source]);
  const sourceErrors = { ad_security: adQuery.error, portal_audit: portalQuery.error, ticketing: ticketQuery.error };
  const collector = pages.ad_security.collector || healthQuery.data;
  const loading = Object.entries({ ad_security: adQuery, portal_audit: portalQuery, ticketing: ticketQuery }).some(([name, query]) => enabled(name) && query.isLoading);

  return <div className="flex h-full min-w-0 overflow-hidden bg-white"><main className="min-w-0 flex-1 overflow-y-auto p-5 lg:p-6"><div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Read-only investigation</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Activity &amp; Troubleshooting</h1><p className="mt-2 text-sm text-slate-500">Investigate directory and ticket events without leaving the technician workspace.</p></div><span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">Export disabled in V1</span></div><div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Activity sources">{SOURCES.map(([value, label]) => <button key={value} onClick={() => { setSource(value); setSelected(null); }} className={`rounded-lg border px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${source === value ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`} role="tab" aria-selected={source === value}>{label}</button>)}</div><div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-semibold text-slate-600">From<input value={filters.startAt} onChange={(event) => setField('startAt', event.target.value)} type="datetime-local" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-600">To<input value={filters.endAt} onChange={(event) => setField('endAt', event.target.value)} type="datetime-local" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Outcome<select value={filters.outcome} onChange={(event) => setField('outcome', event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{OUTCOMES.map((value) => <option key={value} value={value}>{value ? resultLabels[value] : 'All outcomes'}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Category<select value={filters.category} onChange={(event) => setField('category', event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{CATEGORIES.map((value) => <option key={value} value={value}>{value ? value.replace(/_/g, ' ') : 'All categories'}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Actor<input value={filters.actor} onChange={(event) => setField('actor', event.target.value)} placeholder="sAMAccountName" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Account<input value={filters.account} onChange={(event) => setField('account', event.target.value)} placeholder="Explicit target" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Ticket ID<input value={filters.ticketId} onChange={(event) => setField('ticketId', event.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Known action / event<input value={filters.code} onChange={(event) => setField('code', event.target.value.toUpperCase())} placeholder="4724 or ACTION_CODE" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><div className="md:col-span-2 xl:col-span-4"><button onClick={() => { setFilters(defaultFilters()); setOffsets({ ad_security: 0, portal_audit: 0, ticketing: 0 }); setSelected(null); }} className="rounded-lg px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Clear filters</button></div></div>{collector && <div className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${collector.stale ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}><Clock3 size={16} />AD Security events {collector.status === 'healthy' ? 'last collected' : collector.status === 'stale' ? 'are stale; last collected' : 'are unavailable; last collection'} {collector.last_collected_at ? timeLabel(collector.last_collected_at) : 'has not been received'}.</div>}<div className="space-y-2">{Object.entries(sourceErrors).filter(([name, error]) => enabled(name) && error).map(([name, error]) => <ErrorNotice key={name} source={name} error={error} />)}</div><section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">What happened</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Result</th></tr></thead><tbody>{rows.map((entry) => <tr key={entry.sourceId} onClick={() => setSelected(entry)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelected(entry); }} tabIndex="0" className="cursor-pointer border-b border-slate-100 align-top hover:bg-indigo-50/40 focus:bg-indigo-50/60 focus:outline-none"><td className="whitespace-nowrap px-4 py-4 text-sm text-slate-500">{timeLabel(entry.occurredAt)}</td><td className="px-4 py-4"><p className="text-sm font-medium text-slate-900">{entry.description}</p>{entry.targetAccount && <p className="mt-1 text-xs text-slate-500">Account: {entry.targetAccount}</p>}</td><td className="px-4 py-4 text-sm font-medium text-slate-700">{sourceLabels[entry.source]}</td><td className="px-4 py-4"><ResultPill result={entry.result} /></td></tr>)}</tbody></table></div>{loading && <div role="status" className="flex items-center gap-2 px-4 py-5 text-sm text-slate-500"><RefreshCw size={16} className="animate-spin" />Loading available activity…</div>}{!loading && rows.length === 0 && <div className="px-5 py-10 text-center"><ShieldAlert className="mx-auto text-slate-400" size={26} /><p className="mt-3 text-sm font-semibold text-slate-700">No activity matches these filters</p><p className="mt-1 text-sm text-slate-500">Adjust the bounded filters or check the source status above.</p></div>}{Object.entries(pages).filter(([name]) => enabled(name)).map(([name, page]) => <SourcePager key={name} source={name} page={page} onChange={(offset) => setOffsets((current) => ({ ...current, [name]: offset }))} />)}</section></main><DetailPanel entry={selected} directoryWorkspaceUrl={directoryWorkspaceUrl} /></div>;
}
