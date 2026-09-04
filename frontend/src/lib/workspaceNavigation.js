const DEFAULT_DIRECTORY_SERVICE_URL = 'http://localhost:8000';
const DEFAULT_DIRECTORY_WORKSPACE_URL = 'http://localhost:8000/';
const SAM_ACCOUNT_NAME = /^[A-Za-z0-9._-]{1,64}$/;
const TICKET_ID = /^[1-9][0-9]{0,8}$/;

export function normalizeAppBasePath(value = '/') {
  const trimmed = String(value || '/').trim();
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function isComposedWorkspace(appBasePath = '/') {
  return normalizeAppBasePath(appBasePath) !== '/';
}

export function routerBasename(appBasePath = '/') {
  const normalized = normalizeAppBasePath(appBasePath);
  return normalized === '/' ? '/' : normalized.slice(0, -1);
}

export function resolveTicketApiBase(configuredUrl, appBasePath = '/') {
  if (configuredUrl?.trim()) return configuredUrl.trim().replace(/\/$/, '');
  return isComposedWorkspace(appBasePath) ? '/ticket-api' : '/api';
}

export function resolveDirectoryServiceUrl(configuredUrl, appBasePath = '/', currentOrigin = '') {
  if (configuredUrl?.trim()) return configuredUrl.trim().replace(/\/$/, '');
  if (isComposedWorkspace(appBasePath) && currentOrigin) return currentOrigin.replace(/\/$/, '');
  return DEFAULT_DIRECTORY_SERVICE_URL;
}

export function resolveDirectoryWorkspaceUrl(configuredUrl, appBasePath = '/') {
  if (configuredUrl?.trim()) return configuredUrl.trim();
  return isComposedWorkspace(appBasePath) ? '/' : DEFAULT_DIRECTORY_WORKSPACE_URL;
}

export function isValidSamAccountName(value) {
  return SAM_ACCOUNT_NAME.test(String(value || '').trim());
}

export function buildDirectoryAccountUrl(directoryWorkspaceUrl, samAccountName, ticketId = '') {
  const target = String(samAccountName || '').trim();
  if (!isValidSamAccountName(target)) return null;
  const base = String(directoryWorkspaceUrl || '/').split('#', 1)[0];
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedTicketId = String(ticketId || '').trim();
  const ticketFragment = TICKET_ID.test(normalizedTicketId)
    ? `&ticket=${normalizedTicketId}`
    : '';
  return `${normalizedBase}#account=${encodeURIComponent(target)}${ticketFragment}`;
}
