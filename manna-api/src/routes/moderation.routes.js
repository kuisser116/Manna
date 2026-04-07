import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import getDB from '../database/db.js';
import { analyzeContentWithAI } from '../services/moderation.service.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * POST /analyze-pre-upload
 * Valida texto y una miniatura (Base64) antes de que el cliente suba el archivo pesado a R2/IPFS.
 */
router.post('/analyze-pre-upload', authMiddleware, async (req, res) => {
    try {
        const { text, type, thumbnailBase64 } = req.body;
        // Si hay thumbnail, usamos eso como contenido visual
        const contentForAI = thumbnailBase64 || text;
        
        console.log(`[AI Pre-Check] Type: ${type}, Thumbnail: ${!!thumbnailBase64}`);
        const aiCheck = await analyzeContentWithAI(contentForAI, type, text);
        
        res.json(aiCheck);
    } catch (err) {
        console.error('[AI Pre-Check Error]', err.message);
        res.status(500).json({ verdict: 'uncertain', reason: 'Error en validación previa' });
    }
});

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
        console.log(`[GET /admin/queue] status: ${status}, count: ${reports?.length}`);
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
                    ai_verdict: report.ai_verdict,
                    ai_confidence: report.ai_confidence,
                    ai_reason: report.ai_reason,
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
            console.log(`[RESOLVE] confirm_ban postId: ${postId}. Posts: ${pData?.length}, Reports: ${rData?.length}`);

        } else if (action === 'restore') {
            const { data: pData, error: postError } = await supabase.from('posts').update({ is_banned: false, reports_count: 0 }).eq('id', postId).select();
            if (postError) throw postError;

            const { data: rData, error: reportsError } = await supabase.from('post_reports').update({ status: 'resolved' }).eq('post_id', postId).select();
            if (reportsError) throw reportsError;
            console.log(`[RESOLVE] restore postId: ${postId}. Posts: ${pData?.length}, Reports: ${rData?.length}`);

        } else if (action === 'ignore') {
            const { data: rData, error: reportsError } = await supabase.from('post_reports').update({ status: 'resolved' }).eq('post_id', postId).select();
            if (reportsError) throw reportsError;
            console.log(`[RESOLVE] ignore postId: ${postId}. Reports: ${rData?.length}`);
        }

        res.json({ message: 'Acción procesada correctamente' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- RUTAS DE USUARIO ---

// POST /api/moderation/report
router.post('/report', authMiddleware, async (req, res) => {
    try {
        const { postId, reason } = req.body;
        if (!postId || !reason) {
            return res.status(400).json({ message: 'postId y reason son requeridos' });
        }
        
        const supabase = getDB();
        const reportId = uuidv4();
        
        // 1. Create the report
        await supabase.from('post_reports').insert({
            id: reportId,
            post_id: postId,
            reporter_user_id: req.user.id,
            reason,
            status: 'pending'
        });
        
        // 2. Initial AI Analysis
        const { data: post } = await supabase.from('posts').select('content, type, video_r2_url').eq('id', postId).single();
        const aiAnalysis = await analyzeContentWithAI(post.video_r2_url || post.content, post.type);
        
        await supabase.from('post_reports').update({
            ai_verdict: aiAnalysis.verdict,
            ai_confidence: aiAnalysis.confidence
        }).eq('id', reportId);
          
        // 3. Automated Verdict Processing & Thresholds
        if (aiAnalysis.verdict === 'rejected' && aiAnalysis.confidence > 0.8) {
            await supabase.from('posts').update({ is_banned: true }).eq('id', postId);
        } else {
            // Contar reportes totales de este post
            const { count } = await supabase
                .from('post_reports')
                .select('*', { count: 'exact', head: true })
                .eq('post_id', postId);
            
            await supabase.from('posts').update({ reports_count: count }).eq('id', postId);

            if (count >= 10) {
                // Umbral Crítico: Baneo Automático
                await supabase.from('posts').update({ is_banned: true }).eq('id', postId);
            } else if (count >= 5) {
                // Umbral Intermedio: Re-verificación estricta por IA
                console.log(`[AI] Re-verificando post ${postId} por acumulación de reportes (${count})...`);
                const strictCheck = await analyzeContentWithAI(
                    `ACTÚA CON MÁXIMO RIGOR. RE-EVALUACIÓN POR REPORTES: ${post.video_r2_url || post.content}`, 
                    post.type
                );
                if (strictCheck.verdict === 'rejected' && strictCheck.confidence > 0.6) {
                    await supabase.from('posts').update({ is_banned: true }).eq('id', postId);
                }
            }
        }
        
        res.json({ message: 'Reporte procesado correctamente', reportId });
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

        // Verificar que el post pertenece al usuario
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

        // Crear registro de apelación (reutilizando post_reports con un status especial o una nueva tabla)
        // Por ahora lo marcamos en post_reports como 'appealed'
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
            .select('status, ai_verdict, ai_confidence, created_at')
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

// POST /api/moderation/test-url — Prueba rápida de IA con una URL
router.post('/test-url', authMiddleware, async (req, res) => {
    try {
        const { url, type } = req.body;
        if (!url) return res.status(400).json({ message: 'URL requerida' });

        console.log(`[AI Test] Probando ${type || 'image'} desde URL: ${url}`);
        const result = await analyzeContentWithAI(url, type || 'image');
        
        res.json({ result });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
