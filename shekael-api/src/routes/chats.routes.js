import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { uploadToR2 } from '../services/ipfs.service.js';
import * as chatService from '../services/chat.service.js';
import { emitToConversation, emitToUser } from '../services/socket.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router({ strict: false });

// ── Solicitudes de mensaje ──

// POST /chats/request — Enviar solicitud de mensaje a un usuario
router.post('/request', authMiddleware, async (req, res) => {
    try {
        const result = await chatService.sendMessageRequest(req.user.id, req.body.toUserId);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ message: err.message || 'Error al enviar solicitud' });
    }
});

// GET /chats/requests — Solicitudes pendientes para el usuario actual
router.get('/requests', authMiddleware, async (req, res) => {
    try {
        const data = await chatService.getMessageRequests(req.user.id);
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /chats/requests/:id/accept — Aceptar solicitud y crear conversación
router.post('/requests/:id/accept', authMiddleware, async (req, res) => {
    try {
        const result = await chatService.acceptMessageRequest(req.params.id, req.user.id);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ message: err.message || 'Error al aceptar' });
    }
});

// POST /chats/requests/:id/reject — Rechazar solicitud
router.post('/requests/:id/reject', authMiddleware, async (req, res) => {
    try {
        const result = await chatService.rejectMessageRequest(req.params.id, req.user.id);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});

// POST /chats/requests/:id/block — Bloquear usuario
router.post('/requests/:id/block', authMiddleware, async (req, res) => {
    try {
        const result = await chatService.blockMessageRequest(req.params.id, req.user.id);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});

// ── Conversaciones ──

// POST /chats/business/start — Cliente inicia conversación con un COMERCIO.
// La conversación se marca con group_name='biz:<businessId>' para separarla
// del chat personal (clientes vs contactos). Sin solicitud de amistad:
// el dueño la recibe directo en su sección "Comercios".
router.post('/business/start', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const { businessId } = req.body;

        if (!businessId) return res.status(400).json({ message: 'businessId requerido' });

        const { data: biz, error: bizErr } = await supabase
            .from('businesses')
            .select('id, name, owner_id, avatar_url, is_active')
            .eq('id', businessId)
            .maybeSingle();
        if (bizErr) throw bizErr;
        if (!biz) return res.status(404).json({ message: 'Comercio no encontrado' });
        if (!biz.is_active) return res.status(400).json({ message: 'Este comercio está desactivado' });
        if (biz.owner_id === userId) {
            return res.status(400).json({ message: 'Eres el dueño de este comercio' });
        }

        const bizTag = `biz:${biz.id}`;

        // ¿Ya existe conversación con el comercio entre estos dos?
        const { data: myConvs } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId)
            .eq('accepted', true);
        const myConvIds = myConvs?.map(c => c.conversation_id) || [];

        if (myConvIds.length > 0) {
            const { data: tagged } = await supabase
                .from('conversations')
                .select('id')
                .in('id', myConvIds)
                .eq('group_name', bizTag)
                .limit(1);
            if (tagged?.length > 0) {
                // Asegurar que el dueño también participa
                const { data: ownerPart } = await supabase
                    .from('conversation_participants')
                    .select('id')
                    .eq('conversation_id', tagged[0].id)
                    .eq('user_id', biz.owner_id);
                if (ownerPart?.length > 0) {
                    return res.json({ conversationId: tagged[0].id, business: { id: biz.id, name: biz.name, avatarUrl: biz.avatar_url } });
                }
            }
        }

        // Crear conversación marcada como de comercio
        const conversationId = (await import('uuid')).v4();
        const now = new Date().toISOString();

        const { error: convErr } = await supabase
            .from('conversations')
            .insert({
                id: conversationId,
                created_at: now,
                updated_at: now,
                is_group: false,
                group_name: bizTag,
                group_created_by: biz.owner_id,
            });
        if (convErr) throw convErr;

        const { error: partErr } = await supabase
            .from('conversation_participants')
            .insert([
                { conversation_id: conversationId, user_id: userId, accepted: true, joined_at: now },
                { conversation_id: conversationId, user_id: biz.owner_id, accepted: true, joined_at: now },
            ]);
        if (partErr) throw partErr;

        res.status(201).json({ conversationId, business: { id: biz.id, name: biz.name, avatarUrl: biz.avatar_url } });
    } catch (err) {
        console.error('[Business Chat Start Error]:', err);
        res.status(500).json({ message: err.message || 'Error al iniciar chat con el comercio' });
    }
});

// GET /chats/conversations — Listar conversaciones activas
router.get('/conversations', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;

        const { data: participants, error } = await supabase
            .from('conversation_participants')
            .select(`
                conversation_id, last_read_at, is_pinned, nickname, custom_bg_url,
                conversation:conversations (id, updated_at, group_name)
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
                conversation_id, last_read_at, is_pinned, nickname, custom_bg_url,
                user:users!conversation_participants_user_id_fkey (id, display_name, avatar_url, public_key)
            `)
            .in('conversation_id', convIds)
            .neq('user_id', userId);

        // Nombres de comercios para conversaciones biz:<id>
        const bizTagMap = {};
        for (const p of participants) {
          const g = p.conversation?.group_name || '';
          if (g.startsWith('biz:')) bizTagMap[g.slice(4)] = true;
        }
        const bizIds = Object.keys(bizTagMap);
        let businessNames = {};
        if (bizIds.length > 0) {
          const { data: bizRows } = await supabase
            .from('businesses')
            .select('id, name, avatar_url')
            .in('id', bizIds);
          (bizRows || []).forEach(b => { businessNames[b.id] = b; });
        }

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

        // Contar mensajes no leídos por conversación
        const unreadCountMap = {};
        const { data: unreadData } = await supabase
            .from('chat_messages')
            .select('conversation_id, count')
            .in('conversation_id', convIds)
            .neq('sender_id', userId)
            .is('deleted_at', null);
        if (unreadData) {
            unreadData.forEach(row => {
                if (!unreadCountMap[row.conversation_id]) unreadCountMap[row.conversation_id] = 0;
                unreadCountMap[row.conversation_id]++;
            });
        }

        // Ajustar según last_read_at
        // Traer todos los mensajes no leídos de este usuario y filtrar por fecha
        const unreadCounts = {};
        const { data: userUnreadMsgs } = await supabase
            .from('chat_messages')
            .select('conversation_id, created_at')
            .in('conversation_id', convIds)
            .neq('sender_id', userId)
            .is('deleted_at', null)
            .gte('created_at', new Date(0).toISOString());
        if (userUnreadMsgs) {
            for (const p of participants) {
                if (!p.last_read_at) {
                    // Si nunca leyó, todos los mensajes son no leídos
                    unreadCounts[p.conversation_id] = userUnreadMsgs.filter(m => m.conversation_id === p.conversation_id).length;
                } else {
                    unreadCounts[p.conversation_id] = userUnreadMsgs.filter(m => 
                        m.conversation_id === p.conversation_id && new Date(m.created_at) > new Date(p.last_read_at)
                    ).length;
                }
            }
        }

        const conversations = participants.map(p => {
            const other = otherParticipants?.find(op => op.conversation_id === p.conversation_id);
            const lastMsg = lastMessageMap[p.conversation_id];
            const otherUser = other?.user || { id: 'unknown' };
            // Si hay nickname del otro participante, se lo asignamos
            if (other?.nickname) {
                otherUser.nickname = other.nickname;
            }
            if (other?.custom_bg_url) {
                otherUser.custom_bg_url = other.custom_bg_url;
            }
            const groupName = p.conversation?.group_name || '';
            const isBusinessChat = groupName.startsWith('biz:');
            const businessId = isBusinessChat ? groupName.slice(4) : null;
            return {
                id: p.conversation_id,
                updatedAt: p.conversation?.updated_at,
                otherUser,
                lastMessage: lastMsg || null,
                lastReadAt: p.last_read_at,
                unreadCount: unreadCounts[p.conversation_id] || 0,
                isPinned: !!p.is_pinned,
                pinnedAt: p.pinned_at,
                myNickname: p.nickname,
                customBgUrl: p.custom_bg_url,
                isBusinessChat,
                businessId,
                businessName: isBusinessChat ? businessNames[businessId]?.name : null,
                businessAvatarUrl: isBusinessChat ? businessNames[businessId]?.avatar_url : null
            };
        });

        // Pinned primero, luego por último mensaje
        conversations.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
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
        const limit = parseInt(req.query.limit) || 100;
        const offset = page * limit;

        const { data: messages, error } = await supabase
            .from('chat_messages')
            .select('id, sender_id, encrypted_content, nonce, msg_index, sender_ephemeral_key, pre_key_used_id, message_type, media_url, media_thumb_url, file_name, file_size, mime_type, duration, reply_to_id, reply_preview, deleted_at, created_at, delivered_at, read_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        // Marcar como entregados los mensajes donde el usuario actual es receptor
        if (messages?.length) {
          const undeliveredIds = messages
            .filter(m => m.sender_id !== userId && !m.delivered_at)
            .map(m => m.id);
          if (undeliveredIds.length > 0) {
            await supabase
              .from('chat_messages')
              .update({ delivered_at: new Date().toISOString() })
              .in('id', undeliveredIds);
          }
        }

        // Actualizar last_read_at
        await supabase
            .from('conversation_participants')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        // Re-fetch para incluir delivered_at actualizado
        const { data: refreshed } = await supabase
            .from('chat_messages')
            .select('id, sender_id, encrypted_content, nonce, msg_index, sender_ephemeral_key, pre_key_used_id, message_type, media_url, media_thumb_url, file_name, file_size, mime_type, duration, reply_to_id, reply_preview, deleted_at, created_at, delivered_at, read_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        res.json({
            messages: refreshed?.reverse() || [],
            hasMore: (refreshed?.length || 0) === limit
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
        const {
            encryptedContent, nonce, msgIndex, senderEphemeralKey, preKeyUsedId,
            messageType, mediaUrl, mediaThumbUrl, fileName, fileSize, mimeType, duration, pollId
        } = req.body;

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
                pre_key_used_id: preKeyUsedId || null,
                message_type: messageType || 'text',
                media_url: mediaUrl || null,
                media_thumb_url: mediaThumbUrl || null,
                file_name: fileName || null,
                file_size: fileSize || null,
                mime_type: mimeType || null,
                duration: duration || null,
                poll_id: pollId || null
            })
            .select('id, conversation_id, sender_id, encrypted_content, nonce, msg_index, sender_ephemeral_key, pre_key_used_id, message_type, media_url, media_thumb_url, file_name, file_size, mime_type, duration, poll_id, created_at')
            .single();

        if (error) throw error;

        // Actualizar updated_at de la conversación
        await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        // Notificar via WebSocket a la sala
        emitToConversation(conversationId, 'message:sent', msg);

        // Notificar directamente a cada participante (sidebar + badge)
        const { data: participants } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .eq('accepted', true)
            .neq('user_id', userId);

        const convNotif = { conversationId, lastMessage: msg };
        // Al emisor también (para actualizar sidebar)
        emitToUser(userId, 'conversation:updated', convNotif);
        if (participants) {
            // Notificar en tiempo real y crear notificación en BD
            const notifRows = [];
            participants.forEach(p => {
                emitToUser(p.user_id, 'conversation:updated', convNotif);
                emitToUser(p.user_id, 'message:sent', msg);
                notifRows.push({
                    id: uuidv4(),
                    user_id: p.user_id,
                    actor_id: userId,
                    type: 'message',
                    post_id: conversationId,
                    is_read: false
                });
            });
            if (notifRows.length > 0) {
                supabase.from('notifications').insert(notifRows).then().catch(() => {});
            }
        }

    res.json({ message: msg });
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ message: 'Error al enviar mensaje' });
    }
});

// PATCH /chats/messages/:id — Actualizar metadatos de mensaje (media fields)
router.patch('/messages/:id', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const messageId = req.params.id;
        const {
            message_type, media_url, media_thumb_url,
            file_name, file_size, mime_type,
            reply_to_id, reply_preview
        } = req.body;

        // Verificar que el mensaje pertenece al usuario
        const { data: msg } = await supabase
            .from('chat_messages')
            .select('id, sender_id')
            .eq('id', messageId)
            .single();

        if (!msg || msg.sender_id !== userId) {
            return res.status(403).json({ message: 'No puedes modificar este mensaje' });
        }

        const { error } = await supabase
            .from('chat_messages')
            .update({
                message_type: message_type || 'text',
                media_url: media_url || null,
                media_thumb_url: media_thumb_url || null,
                file_name: file_name || null,
                file_size: file_size || null,
                mime_type: mime_type || null,
                reply_to_id: reply_to_id || null,
                reply_preview: reply_preview || null
            })
            .eq('id', messageId);

        if (error) throw error;

        res.json({ updated: true });
    } catch (err) {
        console.error('Error updating message:', err);
        res.status(500).json({ message: 'Error al actualizar mensaje' });
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

// ── Subida de archivos para chat ──

// POST /chats/upload — Subir imagen/archivo para adjuntar en mensaje
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file' });

        const file = req.file;
        const ext = file.originalname?.split('.').pop()?.toLowerCase() || 'bin';
        const type = file.mimetype?.startsWith('image/') ? 'image' :
                     file.mimetype?.startsWith('audio/') ? 'audio' : 'file';
        const filename = `chat-${uuidv4()}.${ext}`;

        // ── Fix WebM duration header (Chrome escribe metadata incorrecta) ──
        let uploadBuffer = file.buffer;
        let correctedDuration = null;
        if (type === 'audio' && file.mimetype?.includes('webm')) {
            try {
                const { execSync } = await import('child_process');
                const { writeFileSync, unlinkSync } = await import('fs');
                const tmpIn = `/tmp/audio-fix-${uuidv4()}.webm`;
                const tmpOut = `/tmp/audio-fixed-${uuidv4()}.webm`;
                writeFileSync(tmpIn, file.buffer);
                // Re-encode completo para arreglar el header de duración que Chrome escribe mal
                execSync(`ffmpeg -y -i ${tmpIn} -c:a libopus -b:a 32k -vn ${tmpOut}`, { timeout: 30000, stdio: 'pipe' });
                const { readFileSync } = await import('fs');
                uploadBuffer = readFileSync(tmpOut);
                // Obtener duración real con ffprobe
                try {
                    const durOut = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${tmpOut}`, { timeout: 10000, encoding: 'utf8' }).trim();
                    if (durOut) correctedDuration = Math.round(parseFloat(durOut));
                } catch {}
                unlinkSync(tmpIn);
                unlinkSync(tmpOut);
            } catch (e) {
                console.warn('[Chat Upload] ffmpeg fix failed:', e.message);
                // Seguir con el buffer original si falla
            }
        }

        let fileUrl, thumbUrl;
        try {
            fileUrl = await uploadToR2(uploadBuffer, filename, file.mimetype);
        } catch {
            // Fallback a local
            const { writeFileSync, mkdirSync, existsSync } = await import('fs');
            const { join, dirname } = await import('path');
            const { fileURLToPath } = await import('url');
            const __dir = dirname(fileURLToPath(import.meta.url));
            const upDir = join(__dir, '..', 'uploads');
            if (!existsSync(upDir)) mkdirSync(upDir, { recursive: true });
            writeFileSync(join(upDir, filename), file.buffer);
            fileUrl = `/uploads/${filename}`;
        }

        // Thumbnail para imágenes
        if (type === 'image') {
            thumbUrl = fileUrl;
        }

        res.json({
            url: fileUrl,
            thumbUrl,
            type,
            name: file.originalname,
            size: file.size,
            mime: file.mimetype,
            duration: correctedDuration
        });
    } catch (err) {
        console.error('[Chat Upload Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// GET /chats/:id/media — Listar archivos multimedia de una conversación
router.get('/:id/media', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const conversationId = req.params.id;

        // Verificar participación
        const { data: membership } = await supabase
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .eq('accepted', true)
            .single();

        if (!membership) {
            return res.status(403).json({ message: 'No eres participante' });
        }

        const type = req.query.type || ''; // image, audio, file, all
        let query = supabase
            .from('chat_messages')
            .select('id, sender_id, message_type, media_url, media_thumb_url, file_name, file_size, mime_type, created_at')
            .eq('conversation_id', conversationId)
            .not('media_url', 'is', null);

        if (type && type !== 'all') {
            query = query.eq('message_type', type);
        }

        const { data: media, error } = await query.order('created_at', { ascending: false }).limit(100);
        if (error) throw error;

        res.json({ media: media || [] });
    } catch (err) {
        console.error('[Chat Media Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// ── Buscar en el chat ──

// GET /chats/:id/search?q= — Buscar mensajes en una conversación
router.get('/:id/search', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const conversationId = req.params.id;
        const q = req.query.q || '';

        if (!q.trim()) return res.json({ messages: [] });

        // Verificar participación
        const { data: membership } = await supabase
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .eq('accepted', true)
            .single();

        if (!membership) return res.status(403).json({ message: 'No eres participante' });

        // Buscar en encrypted_content (solo podemos buscar texto plano en la BD)
        // Como está cifrado E2EE, solo buscamos metadata visible (file_name, etc.)
        const { data: messages, error } = await supabase
            .from('chat_messages')
            .select('id, sender_id, encrypted_content, nonce, msg_index, message_type, media_url, media_thumb_url, file_name, created_at')
            .eq('conversation_id', conversationId)
            .or(`file_name.ilike.%${q}%,message_type.eq.text`)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        res.json({ messages: messages || [] });
    } catch (err) {
        console.error('[Chat Search Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// ── Eliminar mensaje ──

// DELETE /chats/messages/:id — Eliminar mensaje (soft delete, sin rastro)
router.delete('/messages/:id', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const messageId = req.params.id;

        const { data: msg } = await supabase
            .from('chat_messages')
            .select('id, sender_id, conversation_id')
            .eq('id', messageId)
            .single();

        if (!msg || msg.sender_id !== userId) {
            return res.status(403).json({ message: 'No puedes eliminar este mensaje' });
        }

        const { error } = await supabase
            .from('chat_messages')
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: userId
            })
            .eq('id', messageId);

        if (error) throw error;

        emitToConversation(msg.conversation_id, 'message:deleted', { messageId });

        res.json({ deleted: true });
    } catch (err) {
        console.error('[Chat Delete Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// DELETE /chats/:conversationId/messages — Eliminar todos los mensajes del chat (solo para el usuario)
router.delete('/:conversationId/messages', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const conversationId = req.params.conversationId;

        // Verificar que el usuario pertenece a la conversación
        const { data: participant } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (!participant) {
            return res.status(403).json({ message: 'No eres parte de esta conversación' });
        }

        // Soft delete todos los mensajes del usuario en esta conversación
        const { error } = await supabase
            .from('chat_messages')
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: userId
            })
            .eq('conversation_id', conversationId)
            .eq('sender_id', userId)
            .is('deleted_at', null);

        if (error) throw error;

        emitToConversation(conversationId, 'conversation:updated', { conversationId });

        res.json({ deleted: true });
    } catch (err) {
        console.error('[Chat Delete All Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// PUT /chats/messages/:id/edit — Editar mensaje (ventana de 15 min)
router.put('/messages/:id/edit', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const messageId = req.params.id;
        const { encryptedContent, nonce } = req.body;

        if (!encryptedContent || !nonce) {
            return res.status(400).json({ message: 'Contenido cifrado y nonce requeridos' });
        }

        // Verificar que el mensaje pertenece al usuario
        const { data: msg } = await supabase
            .from('chat_messages')
            .select('id, sender_id, conversation_id, created_at')
            .eq('id', messageId)
            .single();

        if (!msg) {
            return res.status(404).json({ message: 'Mensaje no encontrado' });
        }

        if (msg.sender_id !== userId) {
            return res.status(403).json({ message: 'No puedes editar este mensaje' });
        }

        // Verificar ventana de 15 minutos
        const now = new Date();
        const createdAt = new Date(msg.created_at);
        const diffMinutes = (now - createdAt) / (1000 * 60);

        if (diffMinutes > 15) {
            return res.status(403).json({ message: 'Solo puedes editar mensajes dentro de los primeros 15 minutos' });
        }

        const editedAt = now.toISOString();

        const { error } = await supabase
            .from('chat_messages')
            .update({
                encrypted_content: encryptedContent,
                nonce: nonce,
                edited_at: editedAt
            })
            .eq('id', messageId);

        if (error) throw error;

        // Notificar via WebSocket
        emitToConversation(msg.conversation_id, 'message:edited', {
            messageId,
            conversation_id: msg.conversation_id,
            encrypted_content: encryptedContent,
            nonce: nonce,
            msg_index: msg.msg_index,
            sender_ephemeral_key: msg.sender_ephemeral_key,
            edited_at: editedAt
        });

        res.json({ edited: true, edited_at: editedAt });
    } catch (err) {
        console.error('[Edit Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// ── Reenviar mensaje ──

// POST /chats/messages/:id/forward — Reenviar mensaje a otra conversación
router.post('/messages/:id/forward', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const messageId = req.params.id;
        const { toConversationId } = req.body;

        if (!toConversationId) return res.status(400).json({ message: 'Conversación destino requerida' });

        // Verificar que eres participante en AMBAS conversaciones
        // Obtener mensaje original
        const { data: originalMsg } = await supabase
            .from('chat_messages')
            .select('encrypted_content, nonce, msg_index, sender_ephemeral_key, pre_key_used_id, message_type, media_url, media_thumb_url, file_name, file_size, mime_type, duration')
            .eq('id', messageId)
            .single();

        if (!originalMsg) return res.status(404).json({ message: 'Mensaje no encontrado' });

        // Verificar participación en destino
        const { data: destMembership } = await supabase
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', toConversationId)
            .eq('user_id', userId)
            .eq('accepted', true)
            .single();

        if (!destMembership) return res.status(403).json({ message: 'No participas en la conversación destino' });

        // Insertar copia cifrada del mensaje (mismo encrypted_content — el destinatario
        // podrá descifrarlo si tiene la misma shared secret)
        const { data: newMsg, error } = await supabase
            .from('chat_messages')
            .insert({
                conversation_id: toConversationId,
                sender_id: userId,
                encrypted_content: originalMsg.encrypted_content,
                nonce: originalMsg.nonce,
                msg_index: null, // se re-asignará al descifrar o se usa null para legacy
                sender_ephemeral_key: originalMsg.sender_ephemeral_key,
                pre_key_used_id: originalMsg.pre_key_used_id,
                message_type: originalMsg.message_type || 'text',
                media_url: originalMsg.media_url,
                media_thumb_url: originalMsg.media_thumb_url,
                file_name: originalMsg.file_name,
                file_size: originalMsg.file_size,
                mime_type: originalMsg.mime_type,
                forwarded_from: userId,
                forwarded_at: new Date().toISOString()
            })
            .select('id, created_at')
            .single();

        if (error) throw error;

        // Actualizar updated_at de destino
        await supabase.from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', toConversationId);

        res.json({ forwarded: true, message: newMsg });
    } catch (err) {
        console.error('[Chat Forward Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST /chats/:id/read — Marcar mensajes como leídos
router.post('/:id/read', authMiddleware, async (req, res) => {
    try {
        const result = await chatService.markAsRead(req.params.id, req.user.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── Conversaciones: pin, nickname, background ──

// POST /chats/:id/pin — Fijar/desfijar conversación
router.post('/:id/pin', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const conversationId = req.params.id;

        const { data: participant } = await supabase
            .from('conversation_participants')
            .select('is_pinned')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (!participant) return res.status(404).json({ message: 'No eres participante' });

        const newPinned = !participant.is_pinned;
        const { error } = await supabase
            .from('conversation_participants')
            .update({
                is_pinned: newPinned,
                pinned_at: newPinned ? new Date().toISOString() : null
            })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        if (error) throw error;

        res.json({ pinned: newPinned });
    } catch (err) {
        console.error('[Chat Pin Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// PUT /chats/:id/nickname — Cambiar apodo
router.put('/:id/nickname', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const conversationId = req.params.id;
        const { nickname } = req.body;

        const { error } = await supabase
            .from('conversation_participants')
            .update({ nickname: nickname || null })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        if (error) throw error;

        res.json({ nickname: nickname || null });
    } catch (err) {
        console.error('[Chat Nickname Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// PUT /chats/:id/background — Cambiar fondo de chat
router.put('/:id/background', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const conversationId = req.params.id;
        const { backgroundUrl } = req.body;

        const { error } = await supabase
            .from('conversation_participants')
            .update({ custom_bg_url: backgroundUrl || null })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        if (error) throw error;

        res.json({ backgroundUrl: backgroundUrl || null });
    } catch (err) {
        console.error('[Chat Background Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// ── Mensaje fijado ──

// POST /chats/:id/pin-message — Fijar/desfijar mensaje
router.post('/:id/pin-message', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const conversationId = req.params.id;
        const { messageId } = req.body;

        if (!messageId) {
            // Desfijar: eliminar pinned message
            const { error } = await supabase
                .from('chat_pinned_messages')
                .delete()
                .eq('conversation_id', conversationId);
            if (error) throw error;
            return res.json({ pinned: false });
        }

        // Verificar que existe en la conversación
        const { data: msg } = await supabase
            .from('chat_messages')
            .select('id')
            .eq('id', messageId)
            .eq('conversation_id', conversationId)
            .single();

        if (!msg) return res.status(404).json({ message: 'Mensaje no encontrado' });

        // Eliminar pin anterior si existe
        await supabase
            .from('chat_pinned_messages')
            .delete()
            .eq('conversation_id', conversationId);

        // Fijar nuevo
        const { error } = await supabase
            .from('chat_pinned_messages')
            .insert({
                conversation_id: conversationId,
                message_id: messageId,
                pinned_by: userId
            });

        if (error) throw error;

        res.json({ pinned: true, messageId });
    } catch (err) {
        console.error('[Chat Pin Message Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// GET /chats/:id/pinned-message — Obtener mensaje fijado
router.get('/:id/pinned-message', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const conversationId = req.params.id;

        const { data: pin } = await supabase
            .from('chat_pinned_messages')
            .select('message_id, pinned_by, pinned_at')
            .eq('conversation_id', conversationId)
            .maybeSingle();

        if (!pin) return res.json({ pinnedMessage: null });

        const { data: msg } = await supabase
            .from('chat_messages')
            .select('id, sender_id, encrypted_content, nonce, msg_index, message_type, media_url, created_at')
            .eq('id', pin.message_id)
            .single();

        res.json({ pinnedMessage: msg || null });
    } catch (err) {
        console.error('[Chat Get Pinned Error]:', err);
        res.status(500).json({ message: err.message });
    }
});



// ── Stickers ──

// GET /chats/stickers — Obtener stickers del usuario + defaults
router.get('/stickers', authMiddleware, async (req, res) => {
    try {
        const data = await chatService.getStickers(req.user.id);
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /chats/stickers — Subir sticker propio
router.post('/stickers', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file' });
        const supabase = getDB();
        const userId = req.user.id;
        const file = req.file;

        const ext = file.originalname?.split('.').pop()?.toLowerCase() || 'png';
        const filename = `sticker-${uuidv4()}.${ext}`;
        let imageUrl;
        try {
            const { uploadToR2 } = await import('../services/ipfs.service.js');
            imageUrl = await uploadToR2(file.buffer, filename, file.mimetype);
        } catch {
            const { writeFileSync, mkdirSync, existsSync } = await import('fs');
            const { join, dirname } = await import('path');
            const { fileURLToPath } = await import('url');
            const __dir = dirname(fileURLToPath(import.meta.url));
            const upDir = join(__dir, '..', 'uploads');
            if (!existsSync(upDir)) mkdirSync(upDir, { recursive: true });
            writeFileSync(join(upDir, filename), file.buffer);
            imageUrl = '/uploads/' + filename;
        }

        const { data: sticker, error } = await supabase
            .from('chat_stickers')
            .insert({ user_id: userId, image_url: imageUrl, is_default: false })
            .select()
            .single();

        if (error) throw error;
        res.json({ sticker });
    } catch (err) {
        console.error('[Stickers Upload Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// PATCH /chats/stickers/:id/fav — Marcar/desmarcar favorito
router.patch('/stickers/:id/fav', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const stickerId = req.params.id;

        const { data: sticker } = await supabase
            .from('chat_stickers')
            .select('is_favorite')
            .eq('id', stickerId)
            .eq('user_id', userId)
            .single();

        if (!sticker) return res.status(404).json({ message: 'Sticker no encontrado' });

        const newFav = !sticker.is_favorite;
        await supabase.from('chat_stickers')
            .update({ is_favorite: newFav })
            .eq('id', stickerId);

        res.json({ favorited: newFav });
    } catch (err) {
        console.error('[Stickers Fav Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// ── Encuestas ──

// POST /chats/polls — Crear encuesta en una conversación
router.post('/polls', authMiddleware, async (req, res) => {
    try {
        const result = await chatService.createPoll(req.params.id, req.body, req.user.id);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});

// POST /chats/polls/:id/vote — Votar
router.post('/polls/:id/vote', authMiddleware, async (req, res) => {
    try {
        const result = await chatService.votePoll(req.params.id, req.body.optionIndex, req.user.id);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});

// GET /chats/polls/:id — Resultados
router.get('/polls/:id', authMiddleware, async (req, res) => {
    try {
        const data = await chatService.getPoll(req.params.id);
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── Grupos ──

// POST /chats/groups — Crear grupo
router.post('/groups', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const { name, description, memberIds } = req.body;

        if (!name) return res.status(400).json({ message: 'Nombre del grupo requerido' });

        const conversationId = uuidv4();

        const { error: convErr } = await supabase
            .from('conversations')
            .insert({
                id: conversationId,
                is_group: true,
                group_name: name,
                group_description: description || null,
                group_created_by: userId
            });

        if (convErr) throw convErr;

        // Insertar creador como admin
        const participants = [{ conversation_id: conversationId, user_id: userId, accepted: true, is_admin: true }];
        // Insertar miembros (sin aceptar aún, aceptan al unirse o al ser agregados)
        if (memberIds?.length) {
            memberIds.forEach(mid => {
                if (mid !== userId) {
                    participants.push({ conversation_id: conversationId, user_id: mid, accepted: true, is_admin: false });
                }
            });
        }

        const { error: partErr } = await supabase
            .from('conversation_participants')
            .insert(participants);

        if (partErr) throw partErr;

        res.json({ conversationId });
    } catch (err) {
        console.error('[Groups Create Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST /chats/:id/invite — Generar link de invitación
router.post('/:id/invite', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const conversationId = req.params.id;

        // Verificar que es admin del grupo
        const { data: membership } = await supabase
            .from('conversation_participants')
            .select('is_admin')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (!membership?.is_admin) {
            return res.status(403).json({ message: 'Solo admins pueden generar invitaciones' });
        }

        const code = uuidv4().replace(/-/g, '').substring(0, 12);
        const { data: link, error } = await supabase
            .from('group_invite_links')
            .insert({
                conversation_id: conversationId,
                code,
                created_by: userId
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ inviteLink: link, url: `/chats/join/${code}` });
    } catch (err) {
        console.error('[Invite Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// GET /chats/join/:code — Info del link de invitación
router.get('/join/:code', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { code } = req.params;

        const { data: link } = await supabase
            .from('group_invite_links')
            .select('*, conversation:conversations(id, group_name, group_photo_url, group_description)')
            .eq('code', code)
            .single();

        if (!link) return res.status(404).json({ message: 'Link inválido o expirado' });

        if (link.expires_at && new Date(link.expires_at) < new Date()) {
            return res.status(410).json({ message: 'Link expirado' });
        }
        if (link.max_uses > 0 && link.use_count >= link.max_uses) {
            return res.status(410).json({ message: 'Link agotado' });
        }

        res.json({
            groupName: link.conversation?.group_name,
            groupPhoto: link.conversation?.group_photo_url,
            groupDescription: link.conversation?.group_description,
            conversationId: link.conversation_id
        });
    } catch (err) {
        console.error('[Join Info Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST /chats/join/:code — Unirse al grupo
router.post('/join/:code', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const { code } = req.params;

        const { data: link } = await supabase
            .from('group_invite_links')
            .select('*')
            .eq('code', code)
            .single();

        if (!link) return res.status(404).json({ message: 'Link inválido' });

        // Verificar si ya es miembro
        const { data: existing } = await supabase
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', link.conversation_id)
            .eq('user_id', userId)
            .maybeSingle();

        if (existing) {
            return res.json({ alreadyMember: true, conversationId: link.conversation_id });
        }

        // Unirse
        const { error } = await supabase
            .from('conversation_participants')
            .insert({
                conversation_id: link.conversation_id,
                user_id: userId,
                accepted: true,
                is_admin: false
            });

        if (error) throw error;

        // Incrementar use_count
        await supabase
            .from('group_invite_links')
            .update({ use_count: (link.use_count || 0) + 1 })
            .eq('id', link.id);

        res.json({ joined: true, conversationId: link.conversation_id });
    } catch (err) {
        console.error('[Join Group Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST /chats/:id/leave — Salir de un grupo
router.post('/:id/leave', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const conversationId = req.params.id;

        const { error } = await supabase
            .from('conversation_participants')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        if (error) throw error;

        res.json({ left: true });
    } catch (err) {
        console.error('[Leave Group Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST /chats/:id/group-photo — Actualizar foto de grupo
router.post('/:id/group-photo', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file' });
        const supabase = getDB();
        const userId = req.user.id;
        const conversationId = req.params.id;

        // Solo admin puede cambiar foto
        const { data: membership } = await supabase
            .from('conversation_participants')
            .select('is_admin')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (!membership?.is_admin) return res.status(403).json({ message: 'Solo admins' });

        const file = req.file;
        const ext = file.originalname?.split('.').pop()?.toLowerCase() || 'jpg';
        const filename = `group-${uuidv4()}.${ext}`;

        let photoUrl;
        try {
            const { uploadToR2 } = await import('../services/ipfs.service.js');
            photoUrl = await uploadToR2(file.buffer, filename, file.mimetype);
        } catch {
            const { writeFileSync, mkdirSync, existsSync } = await import('fs');
            const { join, dirname } = await import('path');
            const { fileURLToPath } = await import('url');
            const __dir = dirname(fileURLToPath(import.meta.url));
            const upDir = join(__dir, '..', 'uploads');
            if (!existsSync(upDir)) mkdirSync(upDir, { recursive: true });
            writeFileSync(join(upDir, filename), file.buffer);
            photoUrl = '/uploads/' + filename;
        }

        await supabase.from('conversations')
            .update({ group_photo_url: photoUrl })
            .eq('id', conversationId);

        res.json({ photoUrl });
    } catch (err) {
        console.error('[Group Photo Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// ── Notificaciones ──

// GET /chats/events — SSE para notificaciones en tiempo real
router.get('/events', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        res.write('data: {"type":"connected"}\n\n');

        // Polling simple cada 5s para detectar nuevos mensajes
        let lastCheck = new Date().toISOString();
        const interval = setInterval(async () => {
            try {
                // Nuevos mensajes en conversaciones del usuario
                const { data: convs } = await supabase
                    .from('conversation_participants')
                    .select('conversation_id, last_read_at')
                    .eq('user_id', userId);

                if (!convs?.length) return;

                const convIds = convs.map(c => c.conversation_id);
                const { data: newMsgs } = await supabase
                    .from('chat_messages')
                    .select('conversation_id, sender_id, message_type, created_at')
                    .in('conversation_id', convIds)
                    .neq('sender_id', userId)
                    .gt('created_at', lastCheck)
                    .limit(5);

                if (newMsgs?.length > 0) {
                    res.write(`data: ${JSON.stringify({type:'new_messages', messages: newMsgs})}\n\n`);
                    lastCheck = new Date().toISOString();
                }

                // Nuevas solicitudes de mensaje
                const { data: newRequests } = await supabase
                    .from('message_requests')
                    .select('id, from_user_id, created_at')
                    .eq('to_user_id', userId)
                    .eq('status', 'pending')
                    .gt('created_at', lastCheck)
                    .limit(5);

                if (newRequests?.length > 0) {
                    res.write(`data: ${JSON.stringify({type:'new_requests', requests: newRequests})}\n\n`);
                }
            } catch {}
        }, 5000);

        req.on('close', () => clearInterval(interval));
    } catch (err) {
        console.error('[SSE Error]:', err);
        if (!res.headersSent) res.status(500).json({ message: err.message });
    }
});

// ── Mensajes guardados ──

// POST /chats/messages/:id/save — Guardar/quitar de favoritos
router.post('/messages/:id/save', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const messageId = req.params.id;

        const { data: existing } = await supabase
            .from('chat_saved_messages')
            .select('id')
            .eq('user_id', userId)
            .eq('message_id', messageId)
            .maybeSingle();

        if (existing) {
            await supabase.from('chat_saved_messages').delete().eq('id', existing.id);
            return res.json({ saved: false });
        }

        await supabase.from('chat_saved_messages').insert({ user_id: userId, message_id: messageId });
        res.json({ saved: true });
    } catch (err) {
        console.error('[Save Message Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

// GET /chats/saved-messages — Listar guardados
router.get('/saved-messages', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;

        const { data: saved, error } = await supabase
            .from('chat_saved_messages')
            .select('*, message:chat_messages(*)')
            .eq('user_id', userId)
            .order('saved_at', { ascending: false });

        if (error) throw error;

        res.json({ saved: saved || [] });
    } catch (err) {
        console.error('[Saved Messages Error]:', err);
        res.status(500).json({ message: err.message });
    }
});

export default router;
