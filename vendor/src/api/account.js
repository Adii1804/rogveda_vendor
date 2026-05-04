import client from './client';

export const requestDeactivation = (body) =>
    client.post('/vendor/deactivation-request', body).then((r) => r.data.data);
