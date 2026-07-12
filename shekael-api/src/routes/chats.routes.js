import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';

const router = Router({ strict: false });

// ── Solicitudes de mensaje ──

// POST /chats/request — Enviar solicitud de mensaje a un usuario
router.post('/request', authMiddleware, async (req, res) => {
    try {
        const { toUserId } = req.body;
        const fromUserId = req.user.id;
        const supabase = getDB();

        if (!toUserId) return res.status(400).json({ message: 'Destinatario requerido' });

        if (toUserId === fromUserId) {
            return res.status(400).json({ message: 'No puedes enviarte solicitud a ti mismo' });
        }

        // Verificar si ya existe solicitud
        const { data: existing } = await supabase
            .from('message_requests')
            .select('id, status')
            .eq('from_user_id', fromUserId)
            .eq('to_user_id', toUserId)
            .maybeSingle();

        if (existing) {
            if (existing.status === 'blocked') {
                return res.status(403).json({ message: 'No puedes enviar solicitud a este usuario' });
            }
            if (existing.status === 'pending') {
                return res.json({ requested: true, message: 'Solicitud ya enviada' });
            }
            if (existing.status === 'rejected') {
                return res.status(403).json({ message: 'No puedes enviar otra solicitud' });
            }
            // Si ya está aceptado, redirigir a la conversación
            if (existing.status === 'accepted') {
                const { data: convParts } = await supabase
                    .from('conversation_participants')
                    .select('conversation_id')
                    .eq('user_id', fromUserId)
                    .eq('accepted', true);
                const otherUserConversations = convParts?.map(c => c.conversation_id) || [];
                if (otherUserConversations.length > 0) {
                    const { data: sharedConv } = await supabase
                        .from('conversation_participants')
                        .select('conversation_id')
                        .in('conversation_id', otherUserConversations)
                        .eq('user_id', toUserId);
                    if (sharedConv?.length > 0) {
                        return res.json({ alreadyConnected: true, conversationId: sharedConv[0].conversation_id });
                    }
                }
            }
        }

        // Crear solicitud
        const { error } = await supabase
            .from('message_requests')
            .insert({ from_user_id: fromUserId, to_user_id: toUserId, status: 'pending' });

        if (error) throw error;

        res.json({ requested: true, message: 'Solicitud enviada' });
    } catch (err) {
        console.error('Error sending request:', err);
        if (err.code === '23505') {
            return res.json({ requested: true, message: 'Solicitud ya enviada' });
        }
        res.status(500).json({ message: 'Error al enviar solicitud' });
    }
});

// GET /chats/requests — Solicitudes pendientes para el usuario actual
router.get('/requests', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;

        const { data: requests, error } = await supabase
            .from('message_requests')
            .select(`
                id, from_user_id, status, created_at,
                from_user:users!message_requests_from_user_id_fkey (id, display_name, avatar_url, public_key)
            `)
            .eq('to_user_id', userId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ requests: requests || [] });
    } catch (err) {
        console.error('Error fetching requests:', err);
        res.status(500).json({ message: 'Error al cargar solicitudes' });
    }
});

// POST /chats/requests/:id/accept — Aceptar solicitud y crear conversación
router.post('/requests/:id/accept', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const requestId = req.params.id;

        // Obtener solicitud
        const { data: request, error: reqError } = await supabase
            .from('message_requests')
            .select('*')
            .eq('id', requestId)
            .eq('to_user_id', userId)
            .single();

        if (reqError || !request) {
            return res.status(404).json({ message: 'Solicitud no encontrada' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Esta solicitud ya fue procesada' });
        }

        // Crear conversación
        const conversationId = uuidv4();

        const { error: convError } = await supabase
            .from('conversations')
            .insert({ id: conversationId });

        if (convError) throw convError;

        // Agregar ambos participantes como aceptados
        const { error: partError } = await supabase
            .from('conversation_participants')
            .insert([
                { conversation_id: conversationId, user_id: request.from_user_id, accepted: true },
                { conversation_id: conversationId, user_id: userId, accepted: true }
            ]);

        if (partError) throw partError;

        // Actualizar solicitud
        await supabase
            .from('message_requests')
            .update({ status: 'accepted', updated_at: new Date().toISOString() })
            .eq('id', requestId);

        // Obtener datos del otro usuario (para el chat)
        const { data: otherUser } = await supabase
            .from('users')
            .select('id, display_name, avatar_url, public_key')
            .eq('id', request.from_user_id)
            .single();

        res.json({
            accepted: true,
            conversationId,
            otherUser: otherUser || { id: request.from_user_id }
        });
    } catch (err) {
        console.error('Error accepting request:', err);
        res.status(500).json({ message: 'Error al aceptar solicitud' });
    }
});

// POST /chats/requests/:id/reject — Rechazar solicitud
router.post('/requests/:id/reject', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;

        const { data: request, error: reqError } = await supabase
            .from('message_requests')
            .select('*')
            .eq('id', req.params.id)
            .eq('to_user_id', userId)
            .single();

        if (reqError || !request) {
            return res.status(404).json({ message: 'Solicitud no encontrada' });
        }

        await supabase
            .from('message_requests')
            .update({ status: 'rejected', updated_at: new Date().toISOString() })
            .eq('id', req.params.id);

        res.json({ rejected: true });
    } catch (err) {
        console.error('Error rejecting request:', err);
        res.status(500).json({ message: 'Error al rechazar solicitud' });
    }
});

// POST /chats/requests/:id/block — Bloquear usuario
router.post('/requests/:id/block', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;

        const { data: request } = await supabase
            .from('message_requests')
            .select('from_user_id, to_user_id')
            .eq('id', req.params.id)
            .eq('to_user_id', userId)
            .single();

        if (!request) {
            return res.status(404).json({ message: 'Solicitud no encontrada' });
        }

        // Bloquear en ambas direcciones (no puede enviarte ni tú a él)
        await supabase
            .from('message_requests')
            .upsert([
                { from_user_id: request.from_user_id, to_user_id: userId, status: 'blocked', updated_at: new Date().toISOString() },
                { from_user_id: userId, to_user_id: request.from_user_id, status: 'blocked', updated_at: new Date().toISOString() }
            ], { onConflict: 'from_user_id,to_user_id' });

        res.json({ blocked: true });
    } catch (err) {
        console.error('Error blocking user:', err);
        res.status(500).json({ message: 'Error al bloquear usuario' });
    }
});

// ── Conversaciones ──

// GET /chats/conversations — Listar conversaciones activas
router.get('/conversations', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;

        const { data: participants, error } = await supabase
            .from('conversation_participants')
            .select(`
                conversation_id, last_read_at,
                conversation:conversations (id, updated_at)
            `)
            .eq('user_id', userId)
            .eq('accepted', true)
            .order('conversation(updated_at)', { ascending: false });

        if (error) throw error;

        if (!participants?.length) return res.json({ conversations: [] });

        // Obtener el otro participante de cada conversación
        const convIds = participants.map(p => p.conversation_id);

        const { data: otherParticipants } = await supabase
            .from('conversation_participants')
            .select(`
                conversation_id, last_read_at,
                user:users!conversation_participants_user_id_fkey (id, display_name, avatar_url, public_key)
            `)
            .in('conversation_id', convIds)
            .neq('user_id', userId);

        // Último mensaje de cada conversación
        const { data: lastMessages } = await supabase
            .from('chat_messages')
            .select('conversation_id, encrypted_content, created_at')
            .in('conversation_id', convIds)
            .order('created_at', { ascending: false });

        const lastMessageMap = {};
        if (lastMessages) {
            // Supabase no soporta DISTINCT ON, así que tomamos el primero de cada grupo
            // Ya ordenamos por created_at DESC, iteramos y solo guardamos el primero de cada conv
            const seen = new Set();
            for (const msg of lastMessages) {
                if (!seen.has(msg.conversation_id)) {
                    seen.add(msg.conversation_id);
                    lastMessageMap[msg.conversation_id] = msg;
                }
            }
        }

        const conversations = participants.map(p => {
            const other = otherParticipants?.find(op => op.conversation_id === p.conversation_id);
            const lastMsg = lastMessageMap[p.conversation_id];
            return {
                id: p.conversation_id,
                updatedAt: p.conversation?.updated_at,
                otherUser: other?.user || { id: 'unknown' },
                lastMessage: lastMsg || null,
                lastReadAt: p.last_read_at
            };
        });

        // Ordenar por último mensaje o updated_at
        conversations.sort((a, b) => {
            const aTime = a.lastMessage?.created_at || a.updatedAt || '';
            const bTime = b.lastMessage?.created_at || b.updatedAt || '';
            return bTime.localeCompare(aTime);
        });

        res.json({ conversations });
    } catch (err) {
        console.error('Error fetching conversations:', err);
        res.status(500).json({ message: 'Error al cargar conversaciones' });
    }
});

// ── Mensajes ──

// GET /chats/:id/messages — Obtener mensajes de una conversación
router.get('/:id/messages', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const conversationId = req.params.id;

        // Verificar que el usuario es participante
        const { data: membership } = await supabase
            .from('conversation_participants')
            .select('id, accepted')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (!membership || !membership.accepted) {
            return res.status(403).json({ message: 'No eres participante de esta conversación' });
        }

        const page = parseInt(req.query.page) || 0;
        const limit = 50;
        const offset = page * limit;

        const { data: messages, error } = await supabase
            .from('chat_messages')
            .select('id, sender_id, encrypted_content, nonce, msg_index, sender_ephemeral_key, pre_key_used_id, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        // Actualizar last_read_at
        await supabase
            .from('conversation_participants')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        res.json({
            messages: messages?.reverse() || [],
            hasMore: (messages?.length || 0) === limit
        });
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ message: 'Error al cargar mensajes' });
    }
});

// POST /chats/:id/messages — Enviar mensaje cifrado
router.post('/:id/messages', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const conversationId = req.params.id;
        const { encryptedContent, nonce, msgIndex, senderEphemeralKey, preKeyUsedId } = req.body;

        if (!encryptedContent || !nonce) {
            return res.status(400).json({ message: 'Contenido cifrado y nonce requeridos' });
        }

        // Verificar que es participante aceptado
        const { data: membership } = await supabase
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .eq('accepted', true)
            .single();

        if (!membership) {
            return res.status(403).json({ message: 'No eres participante de esta conversación' });
        }

        // Guardar mensaje cifrado
        const { data: msg, error } = await supabase
            .from('chat_messages')
            .insert({
                conversation_id: conversationId,
                sender_id: userId,
                encrypted_content: encryptedContent,
                nonce,
                msg_index: msgIndex || 1,
                sender_ephemeral_key: senderEphemeralKey || null,
                pre_key_used_id: preKeyUsedId || null
            })
            .select('id, sender_id, encrypted_content, nonce, msg_index, sender_ephemeral_key, pre_key_used_id, created_at')
            .single();

        if (error) throw error;

        // Actualizar updated_at de la conversación
        await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        res.json({ message: msg });
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ message: 'Error al enviar mensaje' });
    }
});

// ── Utilidades ──

// GET /chats/users/search — Buscar usuarios para iniciar chat
router.get('/users/search', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const q = req.query.q || '';

        if (!q || q.length < 2) return res.json({ users: [] });

        const { data: users, error } = await supabase
            .from('users')
            .select('id, display_name, avatar_url, public_key')
            .neq('id', userId)
            .ilike('display_name', `%${q}%`)
            .limit(10);

        if (error) throw error;

        // Marcar si ya hay solicitud pendiente
        const { data: requests } = await supabase
            .from('message_requests')
            .select('from_user_id, to_user_id, status')
            .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);

        const enrichedUsers = (users || []).map(u => {
            const reqTo = requests?.find(r => r.from_user_id === userId && r.to_user_id === u.id);
            const reqFrom = requests?.find(r => r.from_user_id === u.id && r.to_user_id === userId);
            return {
                ...u,
                requestStatus: reqTo?.status || reqFrom?.status || null,
                isRequester: !!reqTo
            };
        });

        res.json({ users: enrichedUsers });
    } catch (err) {
        console.error('Error searching users:', err);
        res.status(500).json({ message: 'Error al buscar usuarios' });
    }
});

// ── Pre-keys (mensajes offline / X3DH) ──

// POST /chats/pre-keys — Subir lote de pre-keys
router.post('/pre-keys', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const { preKeys, signedPreKey } = req.body;

        if (signedPreKey) {
            // Upsert signed pre-key (solo una por usuario)
            const { error } = await supabase
                .from('pre_keys')
                .upsert({
                    user_id: userId,
                    key_id: 0,
                    public_key: signedPreKey.publicKey,
                    signature: signedPreKey.signature,
                    is_signed_pre_key: true,
                    used: false
                }, { onConflict: 'user_id,key_id' });
            if (error) throw error;
        }

        if (preKeys?.length > 0) {
            const rows = preKeys.map(pk => ({
                user_id: userId,
                key_id: pk.keyId,
                public_key: pk.publicKey,
                signature: pk.signature,
                is_signed_pre_key: false,
                used: false
            }));
            const { error } = await supabase.from('pre_keys').insert(rows);
            if (error) throw error;
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error uploading pre-keys:', err);
        res.status(500).json({ message: 'Error al subir pre-keys' });
    }
});

// GET /chats/pre-keys/:userId — Obtener una pre-key disponible y consumirla
router.get('/pre-keys/:userId', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const targetUserId = req.params.userId;

        // Buscar una one-time pre-key no usada
        const { data: otpk } = await supabase
            .from('pre_keys')
            .select('id, key_id, public_key, signature, is_signed_pre_key')
            .eq('user_id', targetUserId)
            .eq('is_signed_pre_key', false)
            .eq('used', false)
            .limit(1)
            .maybeSingle();

        if (otpk) {
            // Marcar como usada
            await supabase.from('pre_keys')
                .update({ used: true })
                .eq('id', otpk.id);
            return res.json({ preKey: otpk, type: 'one-time' });
        }

        // Fallback: signed pre-key (reutilizable)
        const { data: spk } = await supabase
            .from('pre_keys')
            .select('key_id, public_key, signature, is_signed_pre_key')
            .eq('user_id', targetUserId)
            .eq('is_signed_pre_key', true)
            .maybeSingle();

        if (spk) {
            return res.json({ preKey: spk, type: 'signed' });
        }

        // Sin pre-keys disponibles — devolver identity key del usuario
        const { data: user } = await supabase
            .from('users')
            .select('public_key')
            .eq('id', targetUserId)
            .maybeSingle();

        if (user?.public_key) {
            return res.json({ identityKey: user.public_key, type: 'identity' });
        }

        res.status(404).json({ message: 'No hay pre-keys ni llave pública para este usuario' });
    } catch (err) {
        console.error('Error fetching pre-key:', err);
        res.status(500).json({ message: 'Error al obtener pre-key' });
    }
});

// GET /chats/pre-keys/:userId/count — Saber cuántas pre-keys quedan
router.get('/pre-keys/:userId/count', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const targetUserId = req.params.userId;

        const { count: otpkCount } = await supabase
            .from('pre_keys')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', targetUserId)
            .eq('is_signed_pre_key', false)
            .eq('used', false);

        const { data: spk } = await supabase
            .from('pre_keys')
            .select('key_id')
            .eq('user_id', targetUserId)
            .eq('is_signed_pre_key', true)
            .maybeSingle();

        res.json({
            oneTimeCount: otpkCount || 0,
            hasSignedPreKey: !!spk
        });
    } catch (err) {
        console.error('Error counting pre-keys:', err);
        res.status(500).json({ message: 'Error al contar pre-keys' });
    }
});

export default router;
