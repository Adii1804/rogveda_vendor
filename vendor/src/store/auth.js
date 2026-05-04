import { create } from 'zustand';

const getStoredUser = () => {
    try {
        return JSON.parse(localStorage.getItem('user'));
    } catch {
        return null;
    }
};

export const useAuthStore = create((set) => ({
    token: localStorage.getItem('token') || null,
    user: getStoredUser(),

    setAuth: (token, user) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        set({ token, user });
    },

    patchUser: (partial) => {
        set((s) => {
            const user = { ...s.user, ...partial };
            localStorage.setItem('user', JSON.stringify(user));
            return { user };
        });
    },

    clearAuth: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        set({ token: null, user: null });
    },
}));
