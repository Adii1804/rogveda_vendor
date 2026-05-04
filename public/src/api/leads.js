import client from './client';

export const requestLeadOtp = (email) =>
    client.post('/public/leads', { email }).then((r) => r.data.data);

export const verifyLeadOtp = (email, otp) =>
    client.post('/public/leads/verify', { email, otp }).then((r) => r.data.data);
