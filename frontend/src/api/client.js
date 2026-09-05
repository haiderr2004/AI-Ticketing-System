import axios from 'axios';
import { resolveTicketApiBase } from '../lib/workspaceNavigation';

const api = axios.create({
  baseURL: resolveTicketApiBase(import.meta.env.VITE_API_URL, import.meta.env.BASE_URL),
});

// Reuse the Directory Service session; never create a ticket-only login.
api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor for error logging in development
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (import.meta.env.DEV) {
      console.error('API Error:', error.response?.data || error.message);
    }
    return Promise.reject(error);
  }
);

export const getTickets = async (params) => {
  const { data } = await api.get('/tickets/', { params });
  return data;
};

export const createTicket = async (ticketData) => {
  const { data } = await api.post('/tickets/', ticketData);
  return data;
};

export const getTicket = async (id) => {
  const { data } = await api.get(`/tickets/${id}`);
  return data;
};

export const updateTicket = async (id, ticketData) => {
  const { data } = await api.patch(`/tickets/${id}`, ticketData);
  return data;
};

export const approveDirectoryAction = async (id, approval) => {
  const { data } = await api.post(`/tickets/${id}/approve-directory-action`, approval);
  return data;
};

export const deleteTicket = async (id) => {
  await api.delete(`/tickets/${id}`);
};

export const retriageTicket = async (id) => {
  const { data } = await api.post(`/tickets/${id}/retriage`);
  return data;
};

export const retriageAllOther = async () => {
  const { data } = await api.post('/tickets/retriage-all');
  return data;
};

export const sendTicketReply = async (id) => {
  const { data } = await api.post(`/tickets/${id}/send-reply`);
  return data;
};

export const getMetrics = async () => {
  const { data } = await api.get('/analytics/metrics');
  return data;
};

export const getTrends = async () => {
  const { data } = await api.get('/analytics/trends');
  return data;
};

export const getWeeklyDigest = async () => {
  const { data } = await api.get('/analytics/weekly-digest');
  return data;
};

const directoryActivityApi = axios.create({ baseURL: window.location.origin });
directoryActivityApi.interceptors.request.use((config) => {
  const token = window.localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const getTicketActivityEvents = async (params) => {
  const { data } = await api.get('/tickets/activity/events', { params });
  return data;
};

export const getPortalAuditActivity = async (params) => {
  const { data } = await directoryActivityApi.get('/api/activity/portal-audit', { params });
  return data;
};

export const getNativeAdActivity = async (params) => {
  const { data } = await directoryActivityApi.get('/api/activity/ad-security', { params });
  return data;
};

export const getNativeAdActivityHealth = async () => {
  const { data } = await directoryActivityApi.get('/api/activity/ad-security/health');
  return data;
};

export const askTickets = async (question) => {
  const { data } = await api.post('/triage/ask', { question });
  return data;
};
