import client from './client';

export const getKycQueue = () => client.get('/admin/kyc/queue').then((r) => r.data.data);

export const reviewKycDocument = (id, data) =>
    client.put(`/admin/kyc/documents/${id}`, data).then((r) => r.data.data);

export const getChecklists = (categoryId) =>
    client.get('/admin/kyc/checklists', { params: { category_id: categoryId } }).then((r) => r.data.data);

export const addChecklistItem = (data) =>
    client.post('/admin/kyc/checklists', data).then((r) => r.data.data);

export const updateChecklistItem = (id, data) =>
    client.put(`/admin/kyc/checklists/${id}`, data).then((r) => r.data.data);
