import client from './client';

export const getKycChecklist = () =>
    client.get('/vendor/kyc/checklist').then((r) => r.data.data);

export const uploadKycDocument = (itemId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return client
        .post(`/vendor/kyc/documents/${itemId}/upload`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data.data);
};

export const submitKyc = () => client.post('/vendor/kyc/submit').then((r) => r.data.data);
