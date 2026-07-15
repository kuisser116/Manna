import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import getDB from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router({ strict: false });

// DELETE /moderation/analyze-pre-upload — Ruta eliminada (ya no hay IA de moderación)

// --- RUTAS DE ADMINISTRADOR ---

// GET /admin/queue — Obtiene cola de moderación (Reportes y Apelaciones)
router.get('/admin/queue', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { status } = req.query; // 'pending' | 'resolved' | 'appealed'

        let query = supabase
            .from('post_reports')
            .select('*')
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);

        const { data: reports, error: reportsError } = await query;
        void(`[GET /admin/queue] status: ${status}, count: ${reports?.length}`);
        if (reportsError) throw reportsError;

        // Unimos datos manualmente para evitar errores de Foreign Key (UUID vs TEXT)
        const postIds = [...new Set(reports.map(r => r.post_id))];
        const userIds = [...new Set(reports.map(r => r.reporter_user_id))];

        const { data: posts } = await supabase
            .from('posts')
            .select('*, author:users!posts_author_id_fkey(display_name, email)')
            .in('id', postIds);
        const { data: reporters } = await supabase.from('users').select('id, display_name, email').in('id', userIds);

        // Agrupar reportes por post_id
        const groupedReports = reports.reduce((acc, report) => {
            if (!acc[report.post_id]) {
                acc[report.post_id] = {
                    post_id: report.post_id,
                    post: posts?.find(p => p.id === report.post_id),
                    reports: [],
                    status: report.status,
                    created_at: report.created_at
                };
            }
            acc[report.post_id].reports.push({
                id: report.id,
                reason: report.reason,
                reporter: reporters?.find(u => u.id === report.reporter_user_id),
                created_at: report.created_at
            });
            return acc;
        }, {});
        
        const fullQueue = Object.values(groupedReports);

        res.json({ queue: fullQueue });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /admin/resolve — Resolver reporte/apelación manualmente por POST_ID
router.post('/admin/resolve', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { postId, action, reason } = req.body; 
        // action: 'confirm_ban' | 'restore' | 'ignore'

        if (action === 'confirm_ban') {
            const { data: pData, error: postError } = await supabase.from('posts').update({ is_banned: true }).eq('id', postId).select();
            if (postError) throw postError;

            const { data: rData, error: reportsError } = await supabase.from('post_reports').update({ status: 'resolved' }).eq('post_id', postId).select();
            if (reportsError) throw reportsError;
            void(`[RESOLVE] confirm_ban postId: ${postId}. Posts: ${pData?.length}, Reports: ${rData?.length}`);

        } else if (action === 'restore') {
            const { data: pData, error: postError } = await supabase.from('posts').update({ is_banned: false, reports_count: 0 }).eq('id', postId).select();
            if (postError) throw postError;

            const { data: rData, error: reportsError } = await supabase.from('post_reports').update({ status: 'resolved' }).eq('post_id', postId).select();
            if (reportsError) throw reportsError;
            void(`[RESOLVE] restore postId: ${postId}. Posts: ${pData?.length}, Reports: ${rData?.length}`);

        } else if (action === 'ignore') {
            const { data: rData, error: reportsError } = await supabase.from('post_reports').update({ status: 'resolved' }).eq('post_id', postId).select();
            if (reportsError) throw reportsError;
            void(`[RESOLVE] ignore postId: ${postId}. Reports: ${rData?.length}`);
        }

        res.json({ message: 'Acción procesada correctamente' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- RUTAS DE USUARIO ---

// --- RUTAS DE USUARIO ---

// POST /api/moderation/report — Reportar una publicación (sin IA, solo conteo)
router.post('/report', authMiddleware, async (req, res) => {
    try {
        const { postId, reason } = req.body;
        if (!postId || !reason) {
            return res.status(400).json({ message: 'postId y reason son requeridos' });
        }
        
        const supabase = getDB();
        const reportId = uuidv4();
        
        // 1. Crear el reporte
        const { error: insertError } = await supabase.from('post_reports').insert({
            id: reportId,
            post_id: postId,
            reporter_user_id: req.user.id,
            reason,
            status: 'pending'
        });
        if (insertError) throw insertError;
        
        // 2. Incrementar contador de reportes en el post
        const { data: post } = await supabase.from('posts').select('reports_count').eq('id', postId).single();
        const newCount = (post?.reports_count || 0) + 1;
        await supabase.from('posts').update({ reports_count: newCount }).eq('id', postId);
        
        // 3. Si llega a 10 reportes, banear automáticamente
        if (newCount >= 10) {
            await supabase.from('posts').update({ is_banned: true }).eq('id', postId);
            void(`[Moderation] Post ${postId} baneado automáticamente (${newCount} reportes)`);
        }
        
        res.json({ message: 'Reporte enviado. Gracias por ayudar a la comunidad.', reportId });
    } catch (err) {
        console.error('Report post error:', err);
        res.status(500).json({ message: 'Error al procesar el reporte' });
    }
});

// POST /api/moderation/appeal/:postId
router.post('/appeal/:postId', authMiddleware, async (req, res) => {
    try {
        const { postId } = req.params;
        const { reason } = req.body;
        const supabase = getDB();

        const { data: post } = await supabase
            .from('posts')
            .select('author_id, is_banned')
            .eq('id', postId)
            .single();

        if (!post || post.author_id !== req.user.id) {
            return res.status(403).json({ message: 'No tienes permiso para apelar esta publicación' });
        }

        if (!post.is_banned) {
            return res.status(400).json({ message: 'Esta publicación no está baneada' });
        }

        await supabase.from('post_reports').insert({
            id: uuidv4(),
            post_id: postId,
            reporter_user_id: req.user.id,
            reason: `APELACIÓN: ${reason}`,
            status: 'appealed'
        });

        res.json({ message: 'Apelación enviada correctamente. Será revisada pronto.' });
    } catch (err) {
        console.error('Appeal error:', err);
        res.status(500).json({ message: 'Error al enviar la apelación' });
    }
});

// GET /api/moderation/status/:postId
router.get('/status/:postId', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { data: report } = await supabase
            .from('post_reports')
            .select('status, created_at')
            .eq('post_id', req.params.postId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (!report) {
            return res.json({ message: 'No hay reportes para este post' });
        }
        
        res.json({ report });
    } catch (err) {
        console.error('Report status error:', err);
        res.status(500).json({ message: 'Error al obtener estado del reporte' });
    }
});

export default router;
