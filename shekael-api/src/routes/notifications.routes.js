import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';

const router = Router({ strict: false });

// GET /notifications — Obtener notificaciones del usuario actual
router.get('/', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const currentUserId = req.user.id;
        const page = parseInt(req.query.page) || 0;
        const limit = 20;
        const offset = page * limit;

        const { data: notifications, error } = await supabase
            .from('notifications')
            .select(`
                *,
                actor:users!notifications_actor_id_fkey (display_name, avatar_url),
                post:posts!notifications_post_id_fkey (id, content, type)
            `)
            .eq('user_id', currentUserId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        // Formatear la respuesta para hacerla más fácil de consumir en el frontend
        const formattedNotifications = notifications.map(n => ({
            ...n,
            actor_name: n.actor?.display_name,
            actor_avatar: n.actor?.avatar_url,
            post_content: n.post?.content || null,
            post_type: n.post?.type || null
        }));

        res.json({ notifications: formattedNotifications, page, hasMore: notifications.length === limit });
    } catch (err) {
        console.error('Notifications error:', err);
        res.status(500).json({ message: 'Error al obtener notificaciones' });
    }
});

// GET /notifications/unread-count — Obtener contador de no leídas
router.get('/unread-count', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const currentUserId = req.user.id;

        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUserId)
            .eq('is_read', false);

        if (error) throw error;

        res.json({ unreadCount: count || 0 });
    } catch (err) {
        console.error('Unread count error:', err);
        res.status(500).json({ message: 'Error al obtener el contador de notificaciones' });
    }
});

// PUT /notifications/:id/read — Marcar como leída
router.put('/:id/read', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const notificationId = req.params.id;
        const currentUserId = req.user.id;

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('user_id', currentUserId);

        if (error) throw error;

        res.json({ message: 'Notificación marcada como leída' });
    } catch (err) {
        console.error('Read notification error:', err);
        res.status(500).json({ message: 'Error al marcar la notificación como leída' });
    }
});

// PUT /notifications/read-all — Marcar todas como leídas
router.put('/read-all', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const currentUserId = req.user.id;

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', currentUserId)
            .eq('is_read', false);

        if (error) throw error;

        res.json({ message: 'Todas las notificaciones marcadas como leídas' });
    } catch (err) {
        console.error('Read all notifications error:', err);
        res.status(500).json({ message: 'Error al marcar notificaciones como leídas' });
    }
});


// POST / — Crear notificación propia (feedback de procesos en curso, ej. registro de comercio)
router.post('/', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const { type, post_id } = req.body;

        if (!type) return res.status(400).json({ message: 'type es requerido' });

        const { data, error } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                actor_id: userId,
                type,
                post_id: post_id || null,
                is_read: false,
            })
            .select()
            .single();
        if (error) throw error;

        res.status(201).json({ notification: data });
    } catch (err) {
        console.error('Create notification error:', err);
        res.status(500).json({ message: 'Error al crear notificación' });
    }
});

export default router;
