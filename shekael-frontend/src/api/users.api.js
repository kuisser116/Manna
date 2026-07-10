import axios from 'axios';

const api = axios.create({ baseURL: (import.meta.env.VITE_API_URL || location.origin) });

// Interceptor: agrega el JWT automÃ¡ticamente en cada request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('Shekael_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

/**
 * Obtiene la informaciÃ³n pÃºblica de un usuario (incluyendo si el usuario actual lo sigue)
 */
export const getUserProfile = (userId) => {
    return api.get(`/users/${userId}`);
};

/**
 * Activa o desactiva el seguimiento a un usuario
 */
export const toggleFollow = (userId) => {
    return api.post(`/users/${userId}/follow`);
};

/**
 * Actualiza la foto de perfil del usuario actual
 */
export const updateAvatar = (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return api.put('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};

/**
 * Actualiza la imagen de portada (banner) del usuario actual
 */
export const updateCover = (file) => {
    const formData = new FormData();
    formData.append('cover', file);
    return api.put('/users/me/cover', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};

/**
 * Actualiza la informaciÃ³n del perfil del usuario (nombre y bio)
 */
export const updateProfile = (data) => {
    return api.put('/users/me', data);
};

/**
 * Fuerza la verificaciÃ³n y reparaciÃ³n de la wallet del usuario actual
 */
export const verifyWallet = () => {
    return api.get('/users/me/verify-wallet');
};

export default api;

