import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
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

export const deleteTicket = async (id) => {
  await api.delete(`/tickets/${id}`);
};

export const retriageTicket = async (id) => {
  const { data } = await api.post(`/tickets/${id}/retriage`);
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

export const askTickets = async (question) => {
  const { data } = await api.post('/triage/ask', { question });
  return data;
};
