import axios from 'axios';

const notifAPI = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
    headers: { 'Content-Type': 'application/json' },
});

notifAPI.interceptors.request.use((config) => {
    const token = localStorage.getItem('manna_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

notifAPI.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('manna_token');
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

export const getNotifications = (page = 0) => notifAPI.get(`/notifications?page=${page}`);
export const getUnreadNotificationsCount = () => notifAPI.get('/notifications/unread-count');
export const markNotificationAsRead = (id) => notifAPI.put(`/notifications/${id}/read`);
export const markAllNotificationsAsRead = () => notifAPI.put('/notifications/read-all');

export default notifAPI;
