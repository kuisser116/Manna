import axios from 'axios';

const transAPI = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
    headers: { 'Content-Type': 'application/json' },
});

transAPI.interceptors.request.use((config) => {
    const token = localStorage.getItem('Ehise_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export const sendSupport = (data) => transAPI.post('/transactions/support', data);
export const getWalletBalance = () => transAPI.get('/wallet/balance');
export const getRegionalFund = () => transAPI.get('/regional-fund/balance');
export const getRegionalCauses = () => transAPI.get('/regional-fund/balance');
export const updateUserState = (state) => transAPI.post('/regional-fund/update-state', { state });
export const simulateAd = () => transAPI.post('/admin/simulate-ad');
export const payQR = (toPublicKey, amount, assetCode) => transAPI.post('/regional-fund/pay', { toPublicKey, amount, assetCode });

export default transAPI;
