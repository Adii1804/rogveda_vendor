import client from './client';

export const login = (body) => client.post('/auth/login', body).then((r) => r.data.data);

export const changePassword = (body) =>
    client.post('/auth/change-password', body).then((r) => r.data.data);

export const logout = () => client.post('/auth/logout').then((r) => r.data.data);
