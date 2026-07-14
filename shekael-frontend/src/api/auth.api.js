import axios from 'axios';

const authAPI = axios.create({
    baseURL: (import.meta.env.VITE_API_URL || location.origin),
    headers: { 'Content-Type': 'application/json' },
});

// Interceptor: agregar token automáticamente a requests autenticados
authAPI.interceptors.request.use((config) => {
  if (config.url === '/auth/google') return config;
  const token = localStorage.getItem('Shekael_token')?.replace(/"/g, '');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const loginWithGoogle = (data) => authAPI.post('/auth/google', data);

export const getPinStatus = () => authAPI.get('/auth/pin-status');
export const setPin = (pinHash, encryptedPrivateKey) => authAPI.post('/auth/set-pin', { pinHash, encryptedPrivateKey });
export const verifyPin = (pinHash) => authAPI.post('/auth/verify-pin', { pinHash });
export const clearPin = () => authAPI.post('/auth/clear-pin');

export default authAPI;
