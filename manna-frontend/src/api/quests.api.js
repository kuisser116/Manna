import axios from 'axios';

const questsAPI = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
    headers: { 'Content-Type': 'application/json' },
});

questsAPI.interceptors.request.use((config) => {
    const token = localStorage.getItem('manna_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// /quests/heartbeat: Envia latidos de watch_time
export const sendHeartbeat = (seconds, postId) => questsAPI.post('/quests/heartbeat', { seconds, postId });

// /quests/status: Obtiene el progreso general (0-100%)
export const getQuestStatus = () => questsAPI.get('/quests/status');

// /users/:id/follow ya estaba, agregamos like
export const likePostCounter = (postId) => questsAPI.post(`/posts/${postId}/like`);
export const unlikePost = (postId) => questsAPI.post(`/posts/${postId}/unlike`);

export default questsAPI;
