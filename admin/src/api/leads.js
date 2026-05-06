import client from './client';

export const getLeads = (params) =>
    client.get('/admin/leads', { params }).then((r) => r.data.data);

export const getLead = (id) => client.get(`/admin/leads/${id}`).then((r) => r.data.data);

export const updateLead = (id, data) =>
    client.put(`/admin/leads/${id}`, data).then((r) => r.data.data);

export const getLeadNotes = (id) =>
    client.get(`/admin/leads/${id}/notes`).then((r) => r.data.data);

export const addLeadNote = (id, data) =>
    client.post(`/admin/leads/${id}/notes`, data).then((r) => r.data.data);
