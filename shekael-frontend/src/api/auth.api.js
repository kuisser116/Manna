import axios from 'axios';

const authAPI = axios.create({
    baseURL: (import.meta.env.VITE_API_URL || location.origin),
    headers: { 'Content-Type': 'application/json' },
});

export const loginWithGoogle = (data) => authAPI.post('/auth/google', data);

export default authAPI;

