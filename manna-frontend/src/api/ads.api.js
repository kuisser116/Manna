import axios from 'axios';

const adsAPI = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
    headers: { 'Content-Type': 'application/json' },
});

// Interceptor: agrega JWT automáticamente en cada request
adsAPI.interceptors.request.use((config) => {
    const token = localStorage.getItem('Ehise_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Interceptor de respuesta: manejo global de errores 401
adsAPI.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('Ehise_token');
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

// ── Feed ──────────────────────────────────────────
export const getActiveAd = (params = {}) => adsAPI.get('/ads/active', { params });
export const confirmAdView = (data) => adsAPI.post('/ads/view-confirmed', data);

// ── Portal de anunciantes ─────────────────────────
export const createAd = (adData) => adsAPI.post('/ads/create', adData);
export const getMyCampaigns = () => adsAPI.get('/ads/my-campaigns');
export const getAdStats = (adId) => adsAPI.get(`/ads/stats/${adId}`);
export const getAdvertiserDashboard = () => adsAPI.get('/ads/dashboard');
export const toggleAdStatus = (adId, status) => adsAPI.patch(`/ads/${adId}/status`, { status });
export const deleteAdCampaign = (adId) => adsAPI.delete(`/ads/${adId}`);

// ── Cuponera ──────────────────────────────────────
export const claimCoupon = (adId) => adsAPI.post(`/ads/${adId}/claim-coupon`);
export const getMyCoupons = () => adsAPI.get('/ads/my-coupons');

/** Sube el creative del anuncio (imagen o video) como multipart */
export const uploadAdMedia = (file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    return adsAPI.post('/ads/upload-media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
            if (onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
        },
    });
};

// ── Consentimiento de datos ───────────────────────
export const getConsentProfile = () => adsAPI.get('/ads/consent');
export const saveConsent = (data) => adsAPI.post('/ads/consent', data);
export const revokeConsent = () => adsAPI.delete('/ads/consent');

// ── Panel Admin ───────────────────────────────────
export const getPendingAds = () => adsAPI.get('/ads/admin/pending');
export const approveAd = (adId) => adsAPI.post(`/ads/admin/${adId}/approve`);
export const rejectAd = (adId, reason) => adsAPI.post(`/ads/admin/${adId}/reject`, { reason });

// ── Moderación ────────────────────────────────────
export const preValidateContent = (data) => adsAPI.post('/moderation/analyze-pre-upload', data);

export default adsAPI;