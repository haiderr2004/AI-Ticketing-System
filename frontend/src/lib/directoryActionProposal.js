const PROPOSAL_MARKER = '\n\n[DIRECTORY_ACTION_PROPOSAL]\n';

export function getDirectoryActionProposal(reasoning) {
  const markerIndex = String(reasoning || '').indexOf(PROPOSAL_MARKER);
  if (markerIndex < 0) return null;
  try {
    const proposal = JSON.parse(String(reasoning).slice(markerIndex + PROPOSAL_MARKER.length));
    return proposal?.action && proposal?.target_sam_account_name ? proposal : null;
  } catch {
    return null;
  }
}

export function getReadableTriageReasoning(reasoning) {
  return String(reasoning || '').split(PROPOSAL_MARKER, 1)[0];
}
