import axios from 'axios';
import { resolveDirectoryServiceUrl } from '../lib/workspaceNavigation';

const TOKEN_KEY = 'auth_token';

function directoryBaseUrl() {
  return resolveDirectoryServiceUrl(
    import.meta.env.VITE_DIRECTORY_SERVICE_URL,
    import.meta.env.BASE_URL,
    globalThis.window?.location?.origin || '',
  );
}

function authorizationHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export function clearDirectorySession() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export async function getDirectorySession() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return null;

  try {
    const { data } = await axios.get(`${directoryBaseUrl()}/api/auth/me`, {
      headers: authorizationHeaders(token),
    });
    return data;
  } catch {
    clearDirectorySession();
    return null;
  }
}

export async function signInWithDirectory({ username, password }) {
  const { data } = await axios.post(`${directoryBaseUrl()}/api/auth/login`, {
    username,
    password,
  });

  try {
    const { data: identity } = await axios.get(`${directoryBaseUrl()}/api/auth/me`, {
      headers: authorizationHeaders(data.access_token),
    });
    window.localStorage.setItem(TOKEN_KEY, data.access_token);
    return identity;
  } catch (error) {
    clearDirectorySession();
    throw error;
  }
}
