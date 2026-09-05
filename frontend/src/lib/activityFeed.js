const SAM_ACCOUNT_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const SAFE_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;
const RESULT_VALUES = new Set(['success', 'failed', 'rejected', 'in_progress', 'unknown', 'informational']);

export const sourceLabels = {
  ad_security: 'AD Security Log',
  portal_audit: 'Portal Audit',
  ticketing: 'Ticketing',
};

export const resultLabels = {
  success: 'Success', failed: 'Failed', rejected: 'Rejected', in_progress: 'In progress',
  unknown: 'Unknown outcome', informational: 'Informational',
};

function safeAccount(value) {
  return typeof value === 'string' && SAM_ACCOUNT_PATTERN.test(value) ? value : null;
}

function safeCode(value, fallback) {
  return typeof value === 'string' && SAFE_CODE_PATTERN.test(value) ? value : fallback;
}

function safeTicketId(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function redactMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = new Set(['ticket_id', 'action', 'domain_controller', 'event_record_id', 'event_id']);
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => {
    if (!allowed.has(key)) return false;
    return typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null;
  }));
}

export function descriptionFor(entry) {
  const account = entry.targetAccount || entry.actor || 'the selected account';
  if (entry.source === 'ad_security') {
    const controller = entry.safeMetadata.domain_controller || 'the domain controller';
    const native = {
      4720: `AD account was created for ${account} on ${controller}.`,
      4722: `AD account was enabled for ${account} on ${controller}.`,
      4725: `AD account was disabled for ${account} on ${controller}.`,
      4726: `AD account was deleted for ${account} on ${controller}.`,
      4723: `Password change was recorded for ${account} on ${controller}.`,
      4724: `Password reset was recorded for ${account} on ${controller}.`,
      4740: `Account lockout was recorded for ${account} on ${controller}.`,
      4767: `Account unlock was recorded for ${account} on ${controller}.`,
      5136: `An AD directory object was modified on ${controller}.`,
    };
    if ([4728, 4729, 4732, 4733, 4756, 4757].includes(Number(entry.rawCode))) return `AD group membership changed for ${account} on ${controller}.`;
    return native[Number(entry.rawCode)] || `AD Security event ${entry.rawCode}.`;
  }
  if (entry.source === 'portal_audit') {
    const portal = {
      TICKET_RESET_PASSWORD: `Password reset completed for ${account}.`,
      RESET_PASSWORD: `Password reset completed for ${account}.`,
      TICKET_ADD_GROUP: `Access group assignment completed for ${account}.`,
      ADD_TO_GROUPS: `Access group assignment completed for ${account}.`,
      REMOVE_FROM_GROUPS: `Access group removal completed for ${account}.`,
      TICKET_UNLOCK_ACCOUNT: `Account unlocked for ${account}.`,
      UNLOCK_ACCOUNT: `Account unlocked for ${account}.`,
      TICKET_ENABLE_ACCOUNT: `Account enabled for ${account}.`,
      TICKET_DISABLE_ACCOUNT: `Account disabled for ${account}.`,
      DISABLE_ACCOUNT: `Account disabled for ${account}.`,
      CREATE_USER: `AD account was created for ${account}.`,
      UPDATE_PROFILE: `Profile details updated for ${account}.`,
      TRANSFER_OU: `Directory location updated for ${account}.`,
      VIEW_USER: `Directory details viewed for ${account}.`,
      VIEW_GROUPS: `Directory groups viewed for ${account}.`,
      VIEW_AUTH_DETAILS: `Directory authentication details viewed for ${account}.`,
    };
    return portal[entry.rawCode] || `Portal audit event: ${entry.rawCode}.`;
  }
  const ticketing = {
    STATUS_CHANGED: `Ticket #${entry.ticketId || '—'} status changed.`,
    ASSIGNMENT_CHANGED: `Ticket #${entry.ticketId || '—'} assignment changed.`,
    DIRECTORY_ACTION_EXECUTED: `Approved directory action completed for ${account}.`,
    DIRECTORY_ACTION_FAILED: 'Approved directory action was rejected; no confirmed change was made.',
    DIRECTORY_ACTION_OUTCOME_UNKNOWN: 'Directory action outcome is unknown. Investigate before trying again.',
  };
  return ticketing[entry.rawCode] || `Ticket event: ${entry.rawCode}.`;
}

export function normalizeActivityEntry(raw, expectedSource) {
  const source = raw?.source === expectedSource ? expectedSource : expectedSource;
  const rawCode = source === 'ad_security'
    ? String(Number.isInteger(Number(raw?.raw_code)) ? Number(raw.raw_code) : 'UNAVAILABLE')
    : safeCode(raw?.raw_code, 'UNAVAILABLE');
  const result = RESULT_VALUES.has(raw?.result) ? raw.result : 'unknown';
  const entry = {
    source,
    sourceId: typeof raw?.source_id === 'string' && raw.source_id.length <= 256 ? raw.source_id : `${source}:unavailable`,
    occurredAt: typeof raw?.occurred_at === 'string' ? raw.occurred_at : null,
    collectedAt: source === 'ad_security' && typeof raw?.collected_at === 'string' ? raw.collected_at : null,
    category: typeof raw?.category === 'string' && raw.category.length <= 64 ? raw.category : 'unclassified',
    rawCode,
    result,
    actor: safeAccount(raw?.actor),
    targetAccount: safeAccount(raw?.target_account),
    ticketId: safeTicketId(raw?.ticket_id),
    safeMetadata: redactMetadata(raw?.safe_metadata),
  };
  return { ...entry, description: descriptionFor(entry) };
}

export function normalizeActivityResponse(payload, source) {
  const entries = Array.isArray(payload?.entries) ? payload.entries.map((entry) => normalizeActivityEntry(entry, source)) : [];
  return {
    entries,
    total: Number.isInteger(payload?.total) && payload.total >= 0 ? payload.total : 0,
    limit: Number.isInteger(payload?.limit) ? payload.limit : 25,
    offset: Number.isInteger(payload?.offset) ? payload.offset : 0,
    collector: source === 'ad_security' && payload?.collector && typeof payload.collector === 'object' ? payload.collector : null,
  };
}
