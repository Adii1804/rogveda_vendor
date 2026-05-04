import client from './client';

export const getProfile = () => client.get('/vendor/profile').then((r) => r.data.data);

export const updateProfile = (body) => client.put('/vendor/profile', body).then((r) => r.data.data);

export const uploadFacilityPhoto = (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return client
        .post('/vendor/profile/photo', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data.data);
};

export const submitProfile = () => client.post('/vendor/profile/submit').then((r) => r.data.data);
