import client from './client';

export const getDashboard = () => client.get('/admin/dashboard').then((r) => r.data.data);
