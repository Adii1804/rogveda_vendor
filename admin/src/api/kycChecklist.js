import client from './client';

export const getKycChecklist = (category_id) =>
    client.get('/admin/kyc-checklist', { params: { category_id } }).then((r) => r.data.data);

export const createKycChecklistItem = (data) =>
    client.post('/admin/kyc-checklist', data).then((r) => r.data.data);

export const updateKycChecklistItem = (id, data) =>
    client.patch(`/admin/kyc-checklist/${id}`, data).then((r) => r.data.data);

export const deleteKycChecklistItem = (id) =>
    client.delete(`/admin/kyc-checklist/${id}`).then((r) => r.data.data);
