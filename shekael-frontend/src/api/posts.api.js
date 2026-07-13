import axios from 'axios';

const postsAPI = axios.create({
    baseURL: (import.meta.env.VITE_API_URL || location.origin),
    headers: { 'Content-Type': 'application/json' },
});

// Interceptor: agrega JWT automÃ¡ticamente en cada request
postsAPI.interceptors.request.use((config) => {
    const token = localStorage.getItem('Shekael_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Interceptor de respuesta: manejo global de errores 401
postsAPI.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('Shekael_token');
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

export const getFeed = (page = 0) => postsAPI.get(`/posts/feed?page=${page}`);
export const createPost = (data) => postsAPI.post('/posts/create', data);
export const getUserPosts = (userId) => postsAPI.get(`/posts/user/${userId}`);
export const uploadPost = (formData) =>
    postsAPI.post('/posts/create', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
export const getPostDetail = (id) => postsAPI.get(`/posts/${id}`);
export const createComment = (id, content) => postsAPI.post(`/posts/${id}/comments`, { content });
export const getLikedPosts = (userId) => postsAPI.get(`/posts/liked/${userId}`);
export const getSavedPosts = () => postsAPI.get('/posts/bookmarks/me');
export const toggleSavePost = (postId) => postsAPI.post(`/posts/${postId}/save`);
export const deletePost = (postId) => postsAPI.delete(`/posts/${postId}`);

// ── Seen tracking ──
export const markPostAsSeen = (postId) => postsAPI.post(`/posts/${postId}/seen`);

// ── Moderación ──
export const preValidateContent = (data) => postsAPI.post('/moderation/analyze-pre-upload', data);

export default postsAPI;


