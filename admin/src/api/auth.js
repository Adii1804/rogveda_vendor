import client from './client';

export const login = (data) => client.post('/auth/login', data).then((r) => r.data);

export const logout = () => client.post('/auth/logout').then((r) => r.data);

export const changePassword = (data) =>
    client.post('/auth/change-password', data).then((r) => r.data);
