import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { checkAndFundQuest } from '../services/quest.service.js';

const router = Router({ strict: false });

// POST /quests/heartbeat
router.post('/heartbeat', authMiddleware, async (req, res) => {
    try {
        const { seconds = 10, postId } = req.body;
        const currentUserId = req.user.id;
        const supabase = getDB();

        const validSeconds = Math.min(Number(seconds) || 10, 15);

        // Actualizar el current_watch_seconds (RPC)
        const { error: rpcError } = await supabase.rpc('increment_user_watch_seconds', { 
            user_uuid: currentUserId, 
            seconds: validSeconds 
        });
        if (rpcError) console.error('[RPC Error] increment_user_watch_seconds:', rpcError);

        // Si hay un postId, registrar estos segundos en video_views para evitar pérdida en sync_stats
        if (postId) {
            const { error: viewError } = await supabase
                .from('video_views')
                .insert({
                    id: uuidv4(),
                    post_id: postId,
                    user_id: currentUserId,
                    watched_seconds: validSeconds
                });
            if (viewError) console.error('[Heartbeat] Error registrando en video_views:', viewError);
        }

        const justFunded = await checkAndFundQuest(currentUserId);
        res.json({ success: true, missionCompleted: justFunded });
    } catch (err) {
        console.error('Heartbeat error:', err);
        res.status(500).json({ message: 'Error procesando latido' });
    }
});

// GET /quests/status
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const currentUserId = req.user.id;

        const { data: user, error } = await supabase
            .from('users')
            .select('target_watch_seconds, target_likes, target_follows, current_watch_seconds, current_likes, current_follows, bonus_claimed')
            .eq('id', currentUserId)
            .single();

        if (!user || error) return res.status(404).json({ message: 'Usuario no encontrado' });

        const watchPct = Math.min(user.target_watch_seconds > 0 ? (user.current_watch_seconds / user.target_watch_seconds) : 1, 1);
        const likesPct = Math.min(user.target_likes > 0 ? (user.current_likes / user.target_likes) : 1, 1);
        const followsPct = Math.min(user.target_follows > 0 ? (user.current_follows / user.target_follows) : 1, 1);

        const totalProgress = Math.min(((watchPct + likesPct + followsPct) / 3) * 100, 100);

        const remaining = [];
        if (watchPct < 1) {
            const secLeft = Math.max(0, user.target_watch_seconds - user.current_watch_seconds);
            remaining.push(`📺 Ve ${Math.ceil(secLeft / 60)} minuto(s) más de videos`);
        }
        if (likesPct < 1) {
            const likesLeft = user.target_likes - user.current_likes;
            remaining.push(`❤️ Dale Like a ${likesLeft} publicación(es) más`);
        }
        if (followsPct < 1) {
            const followsLeft = user.target_follows - user.current_follows;
            remaining.push(`👤 Sigue a ${followsLeft} creador(es) más`);
        }

        res.json({
            status: user.bonus_claimed ? 'completed' : 'pending',
            progress: Math.round(totalProgress),
            hints: remaining,                          // ← Array completo de tareas restantes
            tasks: {                                   // ← Desglose por tarea
                watch:   { current: user.current_watch_seconds,  target: user.target_watch_seconds,  pct: Math.round(watchPct * 100)   },
                likes:   { current: user.current_likes,          target: user.target_likes,          pct: Math.round(likesPct * 100)   },
                follows: { current: user.current_follows,        target: user.target_follows,        pct: Math.round(followsPct * 100) },
            }
        });
    } catch (err) {
        console.error('Quest status error:', err);
        res.status(500).json({ message: 'Error obteniendo estado de misiones' });
    }
});

export default router;
