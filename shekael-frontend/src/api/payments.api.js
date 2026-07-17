import axios from 'axios';

const payAPI = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || location.origin),
  headers: { 'Content-Type': 'application/json' },
});

payAPI.interceptors.request.use((config) => {
  const token = localStorage.getItem('Shekael_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

payAPI.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('Shekael_token');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export const getBusinessQR = (businessId) => payAPI.get(`/payments/business/${businessId}/qr`);
export const payBusiness = (businessId, amount) => payAPI.post('/payments/pay', { businessId, amount });
export const getPaymentHistory = (params) => payAPI.get('/payments/history', { params });
export const requestWithdrawal = (data) => payAPI.post('/payments/withdraw', data);
export const getWithdrawals = (businessId) => payAPI.get(`/payments/withdrawals/${businessId}`);

export default payAPI;
