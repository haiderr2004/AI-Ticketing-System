import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import {
  clearDirectorySession,
  getDirectorySession,
  signInWithDirectory,
} from './directoryAuth';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('Directory Service session', () => {
  beforeEach(() => {
    global.window = { localStorage: createStorage() };
    vi.clearAllMocks();
  });

  it('stores a token only after MissionControl confirms technician identity', async () => {
    axios.post.mockResolvedValue({ data: { access_token: 'issued-token' } });
    axios.get.mockResolvedValue({ data: { subject: 'jdoe', dn: 'CN=John Doe', exp_timestamp: 1 } });

    const identity = await signInWithDirectory({ username: 'jdoe', password: 'not-persisted' });

    expect(identity.subject).toBe('jdoe');
    expect(window.localStorage.getItem('auth_token')).toBe('issued-token');
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/me'),
      expect.objectContaining({ headers: { Authorization: 'Bearer issued-token' } }),
    );
  });

  it('clears an expired or invalid session', async () => {
    window.localStorage.setItem('auth_token', 'expired-token');
    axios.get.mockRejectedValue(new Error('Unauthorized'));

    expect(await getDirectorySession()).toBeNull();
    expect(window.localStorage.getItem('auth_token')).toBeNull();

    clearDirectorySession();
    expect(window.localStorage.getItem('auth_token')).toBeNull();
  });
});
