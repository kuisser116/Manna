import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || location.origin;
const chatAPI = axios.create({ baseURL: API_URL });

chatAPI.interceptors.request.use((config) => {
  const token = localStorage.getItem('Shekael_token')?.replace(/"/g, '');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Solicitudes
export const sendMessageRequest = (toUserId) => chatAPI.post('/chats/request', { toUserId });
export const getMessageRequests = () => chatAPI.get('/chats/requests');
export const acceptRequest = (requestId) => chatAPI.post(`/chats/requests/${requestId}/accept`);
export const rejectRequest = (requestId) => chatAPI.post(`/chats/requests/${requestId}/reject`);
export const blockRequester = (requestId) => chatAPI.post(`/chats/requests/${requestId}/block`);

// Conversaciones
export const getConversations = () => chatAPI.get('/chats/conversations');

// Mensajes
export const getMessages = (conversationId, page = 0) => chatAPI.get(`/chats/${conversationId}/messages?page=${page}`);
export const sendMessage = (conversationId, encryptedContent, nonce, msgIndex, senderEphemeralKey, preKeyUsedId, messageType, mediaUrl, mediaThumbUrl, fileName, fileSize, mimeType) =>
    chatAPI.post(`/chats/${conversationId}/messages`, { encryptedContent, nonce, msgIndex, senderEphemeralKey, preKeyUsedId, messageType, mediaUrl, mediaThumbUrl, fileName, fileSize, mimeType });

// Búsqueda de usuarios
export const searchUsers = (q) => chatAPI.get(`/chats/users/search?q=${encodeURIComponent(q)}`);

// Actualizar llave pública
export const updatePublicKey = (publicKey) => chatAPI.put('/users/me/public-key', { publicKey });

// Pre-keys (mensajes offline)
export const uploadPreKeys = (preKeys, signedPreKey) =>
    chatAPI.post('/chats/pre-keys', { preKeys, signedPreKey });
export const fetchPreKey = (userId) => chatAPI.get(`/chats/pre-keys/${userId}`);
export const preKeyCount = (userId) => chatAPI.get(`/chats/pre-keys/${userId}/count`);

// Archivos multimedia para chat
export const uploadChatFile = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return chatAPI.post('/chats/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};

export const getChatMedia = (conversationId, type = 'all') =>
    chatAPI.get(`/chats/${conversationId}/media?type=${type}`);

// Buscar en el chat
export const searchChatMessages = (conversationId, q) =>
    chatAPI.get(`/chats/${conversationId}/search?q=${encodeURIComponent(q)}`);

// Eliminar mensaje
export const deleteMessage = (messageId) =>
    chatAPI.delete(`/chats/messages/${messageId}`);

// Reenviar mensaje
export const forwardMessage = (messageId, toConversationId) =>
    chatAPI.post(`/chats/messages/${messageId}/forward`, { toConversationId });

// Fijar conversación
export const togglePinConversation = (conversationId) =>
    chatAPI.post(`/chats/${conversationId}/pin`);

// Nickname
export const setChatNickname = (conversationId, nickname) =>
    chatAPI.put(`/chats/${conversationId}/nickname`, { nickname });

// Fondo de chat
export const setChatBackground = (conversationId, backgroundUrl) =>
    chatAPI.put(`/chats/${conversationId}/background`, { backgroundUrl });

// Mensaje fijado
export const togglePinMessage = (conversationId, messageId) =>
    chatAPI.post(`/chats/${conversationId}/pin-message`, { messageId });
export const getPinnedMessage = (conversationId) =>
    chatAPI.get(`/chats/${conversationId}/pinned-message`);



// Stickers
export const getStickers = () => chatAPI.get('/chats/stickers');
export const uploadSticker = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return chatAPI.post('/chats/stickers', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};
export const toggleStickerFav = (stickerId) => chatAPI.patch(`/chats/stickers/${stickerId}/fav`);

// Encuestas
export const createPoll = (conversationId, question, options) =>
    chatAPI.post('/chats/polls', { conversationId, question, options });
export const votePoll = (pollId, optionId) =>
    chatAPI.post(`/chats/polls/${pollId}/vote`, { optionId });
export const getPoll = (pollId) => chatAPI.get(`/chats/polls/${pollId}`);

// Grupos
export const createGroup = (name, description, memberIds) =>
    chatAPI.post('/chats/groups', { name, description, memberIds });
export const generateInvite = (conversationId) =>
    chatAPI.post(`/chats/${conversationId}/invite`);
export const getInviteInfo = (code) => chatAPI.get(`/chats/join/${code}`);
export const joinGroup = (code) => chatAPI.post(`/chats/join/${code}`);
export const leaveGroup = (conversationId) =>
    chatAPI.post(`/chats/${conversationId}/leave`);
export const uploadGroupPhoto = (conversationId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return chatAPI.post(`/chats/${conversationId}/group-photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};

// Notificaciones SSE
export const getEventStream = () => {
    const token = localStorage.getItem('Shekael_token')?.replace(/"/g, '');
    const API_URL = import.meta.env.VITE_API_URL || location.origin;
    return new EventSource(`${API_URL}/chats/events?token=${encodeURIComponent(token)}`);
};

// Mensajes guardados
export const toggleSaveMessage = (messageId) =>
    chatAPI.post(`/chats/messages/${messageId}/save`);
export const getSavedMessages = () => chatAPI.get('/chats/saved-messages');

export default chatAPI;
