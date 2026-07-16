// ═══════════════════════════════════════════
// chat.service.js — Lógica de negocio del chat
// Separada de chats.routes.js (capa de rutas)
// ═══════════════════════════════════════════

import { v4 as uuidv4 } from 'uuid';
import getDB from '../database/db.js';
import { uploadToR2 } from './ipfs.service.js';
import { emitToConversation, emitToUser } from './socket.js';

// ─── Helper ───
function error(msg, status = 400) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

// ═══════════════════════════════════════════
// SOLICITUDES DE MENSAJE
// ═══════════════════════════════════════════

export async function sendMessageRequest(fromUserId, toUserId) {
  const supabase = getDB();
  if (!toUserId) throw error('Destinatario requerido');
  if (toUserId === fromUserId) throw error('No puedes enviarte solicitud a ti mismo');

  // Revisar si ya comparten conversación
  const { data: fromParts } = await supabase
    .from('conversation_participants').select('conversation_id').eq('user_id', fromUserId);
  const fromConvIds = fromParts?.map(c => c.conversation_id) || [];

  if (fromConvIds.length > 0) {
    const { data: shared } = await supabase
      .from('conversation_participants').select('conversation_id')
      .in('conversation_id', fromConvIds).eq('user_id', toUserId);

    if (shared?.length > 0) {
      const keepId = shared[0].conversation_id;
      if (shared.length > 1) {
        for (const dupId of shared.slice(1).map(c => c.conversation_id)) {
          await supabase.from('conversation_participants').delete().eq('conversation_id', dupId);
          await supabase.from('messages').update({ conversation_id: keepId }).eq('conversation_id', dupId);
          await supabase.from('conversations').delete().eq('id', dupId);
        }
      }
      return { alreadyHaveConversation: true, conversationId: keepId };
    }
  }

  const { data: [sender, recipient] } = await supabase
    .from('users').select('username, display_name, avatar_url').eq('id', fromUserId)
    .then(() => supabase.from('users').select('message_request_pin, display_name').eq('id', toUserId));

  // Verificar solicitud pendiente existente
  const { data: existing } = await supabase.from('message_requests')
    .select('id, status').eq('from_user_id', fromUserId).eq('to_user_id', toUserId)
    .order('created_at', { ascending: false }).limit(1);

  if (existing?.length > 0 && existing[0].status === 'pending') {
    return { alreadySent: true, requestId: existing[0].id };
  }

  const requestId = uuidv4();
  const { error: insertErr } = await supabase.from('message_requests').insert({
    id: requestId, from_user_id: fromUserId, to_user_id: toUserId,
    status: 'pending', created_at: new Date().toISOString(),
  });
  if (insertErr) throw insertErr;

  emitToUser(toUserId, 'message_request', {
    id: requestId, fromUserId,
    username: sender?.username || 'Usuario',
    displayName: sender?.display_name,
    avatarUrl: sender?.avatar_url,
  });

  return { requestId };
}

export async function getMessageRequests(userId) {
  const supabase = getDB();
  const { data } = await supabase.from('message_requests')
    .select('*, from:from_user_id(id, username, display_name, avatar_url)')
    .eq('to_user_id', userId).order('created_at', { ascending: false });
  return data || [];
}

export async function acceptMessageRequest(requestId, userId) {
  const supabase = getDB();
  const { data: request } = await supabase.from('message_requests')
    .select('*').eq('id', requestId).single();

  if (!request) throw error('Solicitud no encontrada', 404);
  if (request.to_user_id !== userId) throw error('No autorizado', 403);
  if (request.status !== 'pending') throw error('La solicitud ya fue procesada');

  // Crear conversación
  const convId = uuidv4();
  const now = new Date().toISOString();

  await supabase.from('conversations').insert({
    id: convId, created_at: now, updated_at: now,
    is_group: false, created_by: userId,
  });

  await supabase.from('conversation_participants').insert([
    { conversation_id: convId, user_id: request.from_user_id, joined_at: now },
    { conversation_id: convId, user_id: request.to_user_id, joined_at: now },
  ]);

  await supabase.from('message_requests').update({ status: 'accepted' }).eq('id', requestId);

  // Notificar
  emitToUser(request.from_user_id, 'conversation_created', { conversationId: convId });

  return { conversationId: convId };
}

export async function rejectMessageRequest(requestId, userId) {
  const supabase = getDB();
  await supabase.from('message_requests').update({ status: 'rejected' }).eq('id', requestId).eq('to_user_id', userId);
  return { success: true };
}

export async function blockMessageRequest(requestId, userId) {
  const supabase = getDB();
  await supabase.from('message_requests').update({ status: 'rejected' }).eq('id', requestId).eq('to_user_id', userId);
  // Also block future requests from this user
  // ... (block logic)
  return { success: true };
}

// ═══════════════════════════════════════════
// CONVERSACIONES
// ═══════════════════════════════════════════

export async function getConversations(userId) {
  const supabase = getDB();
  const { data: participations } = await supabase
    .from('conversation_participants').select('conversation_id').eq('user_id', userId);

  if (!participations?.length) return [];

  const convIds = participations.map(p => p.conversation_id);
  const { data: convs } = await supabase
    .from('conversations').select('*').in('id', convIds).order('updated_at', { ascending: false });

  const enriched = await Promise.all((convs || []).map(async (conv) => {
    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('user_id, nickname, users:user_id(id, username, display_name, avatar_url)')
      .eq('conversation_id', conv.id);

    // Último mensaje
    const { data: lastMsg } = await supabase
      .from('messages').select('content, created_at, sender_id, message_type')
      .eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(1);

    return {
      ...conv,
      participants,
      lastMessage: lastMsg?.[0] || null,
    };
  }));

  return enriched;
}

export async function getConversationMessages(conversationId, userId, page = 0, limit = 50) {
  const supabase = getDB();
  // Verify participant
  const { data: part } = await supabase.from('conversation_participants')
    .select('id').eq('conversation_id', conversationId).eq('user_id', userId);
  if (!part?.length) throw error('No eres participante', 403);

  const offset = page * limit;
  const { data: messages, error } = await supabase
    .from('messages').select('*, sender:sender_id(id, username, display_name, avatar_url)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return { messages: (messages || []).reverse(), hasMore: (messages?.length || 0) >= limit };
}

// ═══════════════════════════════════════════
// MENSAJES
// ═══════════════════════════════════════════

export async function sendMessage(conversationId, userId, { content, message_type, reply_to, metadata }) {
  const supabase = getDB();

  // Verificar participante
  const { data: part } = await supabase.from('conversation_participants')
    .select('id').eq('conversation_id', conversationId).eq('user_id', userId);
  if (!part?.length) throw error('No eres participante', 403);

  // Moderar contenido
  const { moderate } = await import('./moderation.service.js');
  const modResult = await moderate(content || '');
  if (modResult.isBlocked) throw error('Contenido no permitido');

  const messageId = uuidv4();
  const now = new Date().toISOString();

  const { data: message, error } = await supabase.from('messages').insert({
    id: messageId,
    conversation_id: conversationId,
    sender_id: userId,
    content: content || '',
    message_type: message_type || 'text',
    reply_to: reply_to || null,
    metadata: metadata ? JSON.stringify(metadata) : null,
    created_at: now,
  }).select('*, sender:sender_id(id, username, display_name, avatar_url)').single();

  if (error) throw error;

  // Actualizar conversación
  await supabase.from('conversations').update({ updated_at: now }).eq('id', conversationId);

  // Emitir WebSocket
  emitToConversation(conversationId, 'new_message', message);

  return message;
}

export async function editMessage(messageId, userId, newContent) {
  const supabase = getDB();
  const { data: msg } = await supabase.from('messages').select('*').eq('id', messageId).single();
  if (!msg) throw error('Mensaje no encontrado', 404);
  if (msg.sender_id !== userId) throw error('No puedes editar mensajes de otro', 403);

  const { data, error } = await supabase.from('messages')
    .update({ content: newContent, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select('*, sender:sender_id(id, username, display_name, avatar_url)').single();

  if (error) throw error;
  emitToConversation(msg.conversation_id, 'message_updated', data);
  return data;
}

export async function deleteMessage(messageId, userId) {
  const supabase = getDB();
  const { data: msg } = await supabase.from('messages').select('*').eq('id', messageId).single();
  if (!msg) throw error('Mensaje no encontrado', 404);
  if (msg.sender_id !== userId) throw error('No autorizado', 403);

  await supabase.from('messages').update({ content: '[mensaje eliminado]', deleted_at: new Date().toISOString() }).eq('id', messageId);
  emitToConversation(msg.conversation_id, 'message_deleted', { messageId, conversationId: msg.conversation_id });
  return { success: true };
}

export async function markAsRead(conversationId, userId) {
  const supabase = getDB();
  await supabase.from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId).eq('user_id', userId);
  return { success: true };
}

export async function uploadFile(file, userId) {
  if (!file) throw error('Archivo requerido');
  const result = await uploadToR2(file.buffer, file.originalname, file.mimetype);
  return { url: result.url, name: file.originalname, type: file.mimetype, size: file.size };
}

// ═══════════════════════════════════════════
// GRUPOS
// ═══════════════════════════════════════════

export async function createGroup({ name, description, memberIds }, userId) {
  const supabase = getDB();
  const convId = uuidv4();
  const now = new Date().toISOString();
  const code = Math.random().toString(36).substring(2, 10);

  const allMembers = [...new Set([userId, ...(memberIds || [])])];

  await supabase.from('conversations').insert({
    id: convId, created_at: now, updated_at: now,
    is_group: true, created_by: userId,
    group_name: name, group_description: description || '',
    invite_code: code,
  });

  await supabase.from('conversation_participants').insert(
    allMembers.map(uid => ({ conversation_id: convId, user_id: uid, joined_at: now }))
  );

  return { conversationId: convId, inviteCode: code };
}

// ═══════════════════════════════════════════
// STICKERS
// ═══════════════════════════════════════════

export async function getStickers(userId) {
  const supabase = getDB();
  const { data } = await supabase.from('stickers')
    .select('*').eq('owner_id', userId).order('created_at', { ascending: false });
  return data || [];
}

export async function uploadSticker(file, userId) {
  if (!file) throw error('Archivo requerido');
  const result = await uploadToR2(file.buffer, `sticker_${Date.now()}.webp`, file.mimetype);
  const supabase = getDB();
  const { data } = await supabase.from('stickers').insert({
    id: uuidv4(), owner_id: userId, image_url: result.url, created_at: new Date().toISOString(),
  }).select().single();
  return data;
}

export async function toggleFavoriteSticker(stickerId, userId) {
  const supabase = getDB();
  const { data: sticker } = await supabase.from('stickers').select('is_favorite').eq('id').eq('id', stickerId).single();
  const newFav = !sticker?.is_favorite;
  await supabase.from('stickers').update({ is_favorite: newFav }).eq('id', stickerId);
  return { id: stickerId, is_favorite: newFav };
}

// ═══════════════════════════════════════════
// POLLS
// ═══════════════════════════════════════════

export async function createPoll(conversationId, { question, options }, userId) {
  const supabase = getDB();
  const pollId = uuidv4();
  await supabase.from('polls').insert({
    id: pollId, conversation_id: conversationId, question, created_by: userId,
    options: options || [], created_at: new Date().toISOString(),
  });
  return { pollId };
}

export async function votePoll(pollId, optionIndex, userId) {
  const supabase = getDB();
  const { data: poll } = await supabase.from('polls').select('*').eq('id', pollId).single();
  if (!poll) throw error('Encuesta no encontrada', 404);

  const options = poll.options || [];
  if (optionIndex < 0 || optionIndex >= options.length) throw error('Opción inválida');

  // Remove previous vote
  const { data: existing } = await supabase.from('poll_votes')
    .select('*').eq('poll_id', pollId).eq('user_id', userId);
  if (existing?.length) {
    await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', userId);
    const prevOpt = options[existing[0].option_index];
    if (prevOpt) prevOpt.votes = Math.max(0, (prevOpt.votes || 0) - 1);
  }

  options[optionIndex].votes = (options[optionIndex].votes || 0) + 1;
  await supabase.from('polls').update({ options }).eq('id', pollId);
  await supabase.from('poll_votes').insert({
    id: uuidv4(), poll_id: pollId, user_id: userId, option_index: optionIndex,
  });

  return { pollId, options };
}

export async function getPoll(pollId) {
  const supabase = getDB();
  const { data } = await supabase.from('polls').select('*').eq('id', pollId).single();
  return data;
}
