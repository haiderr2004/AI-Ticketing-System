export default function TicketGuidance({ guidance, isLoading, error }) {
  if (isLoading) {
    return <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs text-indigo-700">Loading cited technician guidance…</div>;
  }
  if (error) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">Guidance is temporarily unavailable. Continue with the documented support process.</div>;
  }
  if (!guidance) return null;

  const statusTone = guidance.evidence_status === 'supported'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-amber-50 text-amber-800 border-amber-200';

  return (
    <section aria-labelledby="technician-guidance-heading" className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-soft">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 id="technician-guidance-heading" className="text-xs font-bold uppercase tracking-widest text-indigo-900">Technician guidance</h3>
          <p className="mt-1 text-xs text-slate-600">Ticket-scoped, approved knowledge. It cannot execute changes.</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${statusTone}`}>{guidance.evidence_status}</span>
      </div>
      <ol className="space-y-2">
        {guidance.recommended_checks.map((check, index) => (
          <li key={`${check.citation.article_id}-${index}`} className="rounded-xl border border-indigo-100 bg-white/80 p-3 text-xs text-slate-700">
            <span className="font-semibold text-indigo-900">{index + 1}. </span>{check.step}
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">{check.citation.article_id} · {check.citation.title} v{check.citation.version}</div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-600">{guidance.notice}</p>
    </section>
  );
}
