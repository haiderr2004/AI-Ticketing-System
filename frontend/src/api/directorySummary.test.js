import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import {
  directorySummaryErrorMessage,
  getTicketDirectorySummary,
} from './directorySummary';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

function createStorage(token = '') {
  return { getItem: vi.fn(() => token || null) };
}

describe('ticket directory summary client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DIRECTORY_SERVICE_URL', 'http://workspace.test');
    global.window = {
      location: { origin: 'http://workspace.test' },
      localStorage: createStorage('shared-session-token'),
    };
    vi.clearAllMocks();
  });

  it('uses the authenticated, minimal P2 summary route in a composed workspace', async () => {
    axios.get.mockResolvedValue({ data: { displayName: 'Jane Smith', samAccountName: 'jsmith' } });

    await expect(getTicketDirectorySummary('jsmith')).resolves.toEqual({ displayName: 'Jane Smith', samAccountName: 'jsmith' });
    expect(axios.get).toHaveBeenCalledWith(
      'http://workspace.test/api/users/jsmith/ticket-summary',
      { headers: { Authorization: 'Bearer shared-session-token' } },
    );
  });

  it('does not issue a directory request for malformed targets or a missing session', async () => {
    await expect(getTicketDirectorySummary('Jane Smith')).rejects.toMatchObject({ code: 'invalid-target' });
    expect(axios.get).not.toHaveBeenCalled();

    window.localStorage = createStorage();
    await expect(getTicketDirectorySummary('jsmith')).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('maps authorization and availability failures to non-sensitive messages', () => {
    expect(directorySummaryErrorMessage({ response: { status: 403 } })).toMatch(/permission/i);
    expect(directorySummaryErrorMessage({ response: { status: 404 } })).toMatch(/not found/i);
    expect(directorySummaryErrorMessage({ response: { status: 500 } })).toBe('Directory context is temporarily unavailable.');
  });
});
