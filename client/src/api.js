import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:3001/api' });

export const backorders = {
  list: (params) => api.get('/backorders', { params }),
  all: () => api.get('/backorders/all'),
  stats: () => api.get('/backorders/stats'),
  create: (data) => api.post('/backorders', data),
  update: (id, data) => api.put(`/backorders/${id}`, data),
  delete: (id) => api.delete(`/backorders/${id}`),
  resolveItem: (orderId, itemId, resolved_quantity) => api.put(`/backorders/${orderId}/items/${itemId}`, { resolved_quantity }),
  importCSV: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/backorders/import/csv', form);
  },
};

export const ai = {
  auditBackorders: () => api.post('/ai/audit-backorders'),
  restockSuggestions: () => api.post('/ai/restock-suggestions'),
};
