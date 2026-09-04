import axios from 'axios';
import {
  isValidSamAccountName,
  resolveDirectoryServiceUrl,
} from '../lib/workspaceNavigation';

function directoryServiceUrl() {
  return resolveDirectoryServiceUrl(
    import.meta.env.VITE_DIRECTORY_SERVICE_URL,
    import.meta.env.BASE_URL,
    globalThis.window?.location?.origin || '',
  );
}

function sessionToken() {
  return globalThis.window?.localStorage?.getItem('auth_token') || '';
}

export async function getTicketDirectorySummary(samAccountName) {
  const target = String(samAccountName || '').trim();
  if (!isValidSamAccountName(target)) {
    const error = new Error('A valid account target is required.');
    error.code = 'invalid-target';
    throw error;
  }

  const token = sessionToken();
  if (!token) {
    const error = new Error('Your Directory session is unavailable.');
    error.code = 'unauthenticated';
    throw error;
  }

  const { data } = await axios.get(
    `${directoryServiceUrl()}/api/users/${encodeURIComponent(target)}/ticket-summary`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

export function directorySummaryErrorMessage(error) {
  if (error?.code === 'invalid-target') return 'Choose a valid account target to view directory context.';
  if (error?.code === 'unauthenticated' || error?.response?.status === 401) return 'Your Directory session has expired. Sign in again to view account context.';
  if (error?.response?.status === 403) return 'You do not have permission to view directory context for this ticket.';
  if (error?.response?.status === 404) return 'The referenced account was not found in Directory.';
  return 'Directory context is temporarily unavailable.';
}
