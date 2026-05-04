import client from './client';

export const getNotifications = () =>
    client.get('/vendor/notifications').then((r) => r.data.data);

export const markNotificationsRead = () =>
    client.post('/vendor/notifications/read-all').then((r) => r.data.data);
