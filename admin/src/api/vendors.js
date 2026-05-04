import client from './client';

export const getVendors = (params) =>
    client.get('/admin/vendors', { params }).then((r) => r.data.data);

export const getVendor = (id) => client.get(`/admin/vendors/${id}`).then((r) => r.data.data);

export const createVendor = (data) =>
    client.post('/admin/vendors', data).then((r) => r.data.data);

export const activateVendor = (id) =>
    client.put(`/admin/vendors/${id}/activate`).then((r) => r.data.data);

export const deactivateVendor = (id, data) =>
    client.put(`/admin/vendors/${id}/deactivate`, data).then((r) => r.data.data);

export const reviewVendorProfile = (id, data) =>
    client.put(`/admin/vendors/${id}/profile`, data).then((r) => r.data.data);

export const getDeactivationRequests = () =>
    client.get('/admin/vendors/deactivation-requests').then((r) => r.data.data);

export const reviewDeactivationRequest = (vendorId, data) =>
    client
        .post(`/admin/vendors/deactivation-requests/${vendorId}/review`, data)
        .then((r) => r.data.data);

export const sendVendorCredentials = (id) =>
    client.post(`/admin/vendors/${id}/send-credentials`).then((r) => r.data.data);

export const getExpiringDocuments = (params) =>
    client.get('/admin/kyc/expiring', { params }).then((r) => r.data.data);
