import axios from 'axios';

const transAPI = axios.create({
    baseURL: (import.meta.env.VITE_API_URL || location.origin),
    headers: { 'Content-Type': 'application/json' },
});

transAPI.interceptors.request.use((config) => {
    const token = localStorage.getItem('Shekael_token');
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

// Swap endpoints eliminados (USDC directo, sin pool de intercambio)
export const withdrawToExchange = (to, amount) => transAPI.post('/wallet/withdraw-exchange', { to, amount });

export default transAPI;

