import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import * as adsService from '../services/ads.service.js';
import * as consentService from '../services/consent.service.js';
import { getDB } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { uploadToR2 } from '../services/ipfs.service.js';
import { analyzeContentWithAI } from '../services/moderation.service.js';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
});

// GET /api/ads/active
router.get('/active', authMiddleware, async (req, res) => {
    try {
        // Prevenir cache del navegador para asegurar rotación
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const { context = 'feed', creatorId = null } = req.query;
        const limit = parseInt(req.query.limit) || 1;
        const result = await adsService.getActiveAd(req.user.id, limit);
        
        if (!result) return res.json({ ad: null, ads: [] });

        if (Array.isArray(result)) {
            return res.json({ 
                ads: result, 
                ad: result[0]?.ad || null, 
                sessionToken: result[0]?.sessionToken || null,
                context, 
                creatorId 
            });
        }

        res.json({ ...result, context, creatorId });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /view-confirmed
router.post('/view-confirmed', authMiddleware, async (req, res) => {
    const { adId, postId, viewSeconds, proofToken, context = 'feed', creatorId = null } = req.body;
    const sessionToken = proofToken || req.body.sessionToken;

    if (!adId || !viewSeconds || !sessionToken) {
        return res.status(400).json({ message: 'Missing parameters' });
    }

    try {
        await adsService.validateProofOfView(req.user.id, adId, sessionToken, context);
        const result = await adsService.triggerDistribution(
            req.user.id, adId, postId || null, viewSeconds, sessionToken, context, creatorId, req.body.status || 'completed'
        );
        res.json({ message: 'ok', viewId: result.viewId });
    } catch (err) {
        console.error('Ad check failed:', err.message, err.stack);
        res.status(400).json({ message: err.message });
    }
});

// POST /ads/upload-media
router.post('/upload-media', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file received' });
        console.log(`[R2] Recibido archivo de ${req.file.size} bytes. Transfiriendo a Cloudflare R2...`);
        const fileUrl = await uploadToR2(req.file.buffer, `ad-${uuidv4().substring(0, 8)}`, req.file.mimetype);
        console.log(`[R2] ¡Éxito! Archivo guardado en: ${fileUrl}`);
        res.status(200).json({ mediaUrl: fileUrl });
    } catch (err) {
        console.error('[R2] Error crítico al subir:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST /ads/create
router.post('/create', authMiddleware, async (req, res) => {
    const { title, description, mediaUrl, mediaType, budget_mxne, budgetUsdc, cpm, targetAudience, startDate, endDate, altText, ctaLabel, ctaUrl } = req.body;
    const finalBudget = budget_mxne || budgetUsdc;
    const supabase = getDB();
    const adId = uuidv4();

    if (!title || !mediaUrl || !finalBudget) {
        return res.status(400).json({ message: 'Missing fields' });
    }

    try {
        // --- Moderación Automática por IA ---
        const combinedContent = `Título: ${title}\nDescripción: ${description || ''}\nPromoción: ${req.body.promoText || ''}\nMedia: ${mediaUrl}`;
        const aiCheck = await analyzeContentWithAI(combinedContent, mediaType || 'banner');
        if (aiCheck.verdict === 'rejected' && aiCheck.confidence > 0.8) {
            return res.status(400).json({ 
                message: 'El anuncio fue rechazado automáticamente por infringir políticas de publicidad.',
                reason: aiCheck.reason 
            });
        }

        const { data: advertiser } = await supabase.from('users').select('stellar_public_key, stellar_secret_key_encrypted').eq('id', req.user.id).single();
        const ESCROW_WALLET = process.env.MANNA_DEV_WALLET;
        let escrowTxHash = null;

        if (advertiser?.stellar_secret_key_encrypted && advertiser.stellar_secret_key_encrypted !== 'enc-placeholder' && ESCROW_WALLET) {
            const { decrypt } = await import('../services/crypto.service.js');
            const secretKey = decrypt(advertiser.stellar_secret_key_encrypted);
            const stellarService = await import('../services/stellar.service.js');
            escrowTxHash = await stellarService.sendPayment({
                fromSecretKey: secretKey,
                toPublicKey: ESCROW_WALLET,
                amount: parseFloat(finalBudget).toFixed(7),
                assetCode: 'MXNe',
                memo: `manna:ad:escrow`
            });
        }

        const { error: insertError } = await supabase.from('ads').insert({
            id: adId,
            advertiser_id: req.user.id,
            title,
            description,
            media_url: mediaUrl,
            media_type: mediaType || 'banner',
            budget_usdc: finalBudget, // Seguir usando la columna existente internamente
            cpm: cpm || 1.0,
            status: 'pending_review',
            target_audience: targetAudience || 'all',
            start_date: startDate,
            end_date: endDate,
            alt_text: altText,
            stellar_escrow_tx: escrowTxHash,
            cta_label: ctaLabel || 'Conoce más',
            cta_url: ctaUrl,
            promo_text: req.body.promoText || null,
            promo_code: req.body.promoCode || null
        });
        if (insertError) throw new Error(insertError.message);

        // Notificar a todos los admins
        try {
            const { createNotification } = await import('../services/notifications.service.js');
            const { data: admins } = await supabase.from('users').select('id').eq('is_admin', true);
            if (admins) {
                for (const admin of admins) {
                    await createNotification({ userId: admin.id, actorId: req.user.id, type: 'ad_pending_review', postId: null });
                }
            }
        } catch (errAdmins) {
            console.error('[Admin Notification Error]', errAdmins.message);
        }

        res.status(201).json({ message: 'Campaign pending review', adId, escrowTxHash });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /ads/my-campaigns
router.get('/my-campaigns', authMiddleware, async (req, res) => {
    const supabase = getDB();
    try {
        const { data: campaigns } = await supabase
            .from('ads')
            .select('*')
            .eq('advertiser_id', req.user.id)
            .order('created_at', { ascending: false });
        res.json({ campaigns });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /ads/:id/status
router.patch('/:id/status', authMiddleware, async (req, res) => {
    const supabase = getDB();
    const { id } = req.params;
    const { status } = req.body; // 'active' o 'paused'

    if (!['active', 'paused'].includes(status)) {
        return res.status(400).json({ message: 'Estado inválido. Use active o paused.' });
    }

    try {
        // Verificar propiedad
        const { data: ad, error: adError } = await supabase.from('ads').select('advertiser_id, status').eq('id', id).single();
        if (adError || !ad) return res.status(404).json({ message: 'Anuncio no encontrado' });
        if (ad.advertiser_id !== req.user.id) return res.status(403).json({ message: 'No Autorizado' });

        // No permitir reactivar algo rechazado, pendiente o terminado por esta vía
        if (!['active', 'paused'].includes(ad.status)) {
            return res.status(400).json({ message: 'Solo se pueden pausar/reanudar campañas que ya están activas o pausadas.' });
        }

        const { error: updateError } = await supabase.from('ads').update({ status }).eq('id', id);
        if (updateError) throw updateError;

        res.json({ message: `Campaña actualizada a ${status}` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE /ads/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    const supabase = getDB();
    const { id } = req.params;

    try {
        // 1. Obtener detalles del anuncio y del anunciante
        const { data: ad, error: adError } = await supabase
            .from('ads')
            .select('*, advertiser:users(stellar_public_key, id)')
            .eq('id', id)
            .single();

        if (adError || !ad) return res.status(404).json({ message: 'Anuncio no encontrado' });
        if (ad.advertiser_id !== req.user.id) return res.status(403).json({ message: 'No Autorizado' });

        // 2. Calcular presupuesto restante
        const remainingBudget = (ad.budget_usdc || 0) - (ad.spent_usdc || 0);

        // 3. Procesar reembolso si queda saldo en Escrow
        if (remainingBudget > 0.01 && ad.advertiser?.stellar_public_key && process.env.MANNA_DEV_WALLET_SECRET) {
            try {
                const stellarService = await import('../services/stellar.service.js');
                await stellarService.sendPayment({
                    fromSecretKey: process.env.MANNA_DEV_WALLET_SECRET, // Sale de la wallet de sistema
                    toPublicKey: ad.advertiser.stellar_public_key,
                    amount: remainingBudget.toFixed(7),
                    assetCode: 'MXNe',
                    memo: 'Reembolso Ad Aseria'
                });
                console.log(`[Refund] Reembolsado ${remainingBudget} MXNe al usuario ${ad.advertiser_id}`);
            } catch (refundErr) {
                console.error('[Refund Error]:', refundErr.message);
                // Opcional: Podríamos fallar el borrado si el reembolso falla, 
                // pero a veces es mejor dejar borrar si es un error de red y loguear.
            }
        }

        // 4. Borrado definitivo
        const { error: deleteError } = await supabase.from('ads').delete().eq('id', id);
        if (deleteError) throw deleteError;

        res.json({ message: 'Campaña eliminada y presupuesto restante reembolsado' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /ads/stats/:id
router.get('/stats/:id', authMiddleware, async (req, res) => {
    try {
        const stats = await adsService.getAdStats(req.params.id, req.user.id);
        res.json(stats);
    } catch (err) {
        res.status(404).json({ message: err.message });
    }
});

// PANEL DE ADMINISTRACIÓN
router.get('/admin/pending', authMiddleware, adminMiddleware, async (req, res) => {
    const supabase = getDB();
    try {
        const { data: pending } = await supabase
            .from('ads')
            .select('*, advertiser:users(display_name, email)')
            .eq('status', 'pending_review')
            .order('created_at', { ascending: true });
        res.json({ pending });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/admin/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
    const supabase = getDB();
    const { id } = req.params;
    
    try {
        const { data: ad, error: adError } = await supabase.from('ads').select('advertiser_id').eq('id', id).single();
        if (adError || !ad) return res.status(404).json({ message: 'Anuncio no encontrado' });

        const { error } = await supabase.from('ads').update({ status: 'active' }).eq('id', id);
        if (error) throw error;

        // Notificar al anunciante
        try {
            const { createNotification } = await import('../services/notifications.service.js');
            await createNotification({
                userId: ad.advertiser_id,
                actorId: req.user.id,
                type: 'ad_approved'
            });
        } catch (notiErr) {
            console.error('[Notification Error]:', notiErr.message);
        }

        res.json({ message: 'Anuncio aprobado' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/admin/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
    const supabase = getDB();
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason) return res.status(400).json({ message: 'Razón de rechazo requerida' });

    try {
        // 1. Obtener detalles del anuncio y del anunciante
        const { data: ad, error: adError } = await supabase
            .from('ads')
            .select('*, advertiser:users(stellar_public_key, id)')
            .eq('id', id)
            .single();

        if (adError || !ad) return res.status(404).json({ message: 'Anuncio no encontrado' });

        // 2. Calcular presupuesto restante
        const remainingBudget = (ad.budget_usdc || 0) - (ad.spent_usdc || 0);

        // 3. Procesar reembolso si hay saldo (Escrow)
        if (remainingBudget > 0.01 && ad.advertiser?.stellar_public_key && process.env.MANNA_DEV_WALLET_SECRET) {
            try {
                const stellarService = await import('../services/stellar.service.js');
                await stellarService.sendPayment({
                    fromSecretKey: process.env.MANNA_DEV_WALLET_SECRET, // Sale de la wallet de sistema
                    toPublicKey: ad.advertiser.stellar_public_key,
                    amount: remainingBudget.toFixed(7),
                    assetCode: 'MXNe',
                    memo: 'Reembolso Ad Aseria'
                });
            } catch (refundErr) {
                console.error('[Refund Error]:', refundErr.message);
            }
        }

        // 3. Crear notificación para el anunciante
        try {
            const { createNotification } = await import('../services/notifications.service.js');
            await createNotification({
                userId: ad.advertiser_id,
                actorId: req.user.id,
                type: 'ad_rejected',
                postId: null 
            });
        } catch (notiErr) {
            console.error('[Notification Error]:', notiErr.message);
        }

        // 4. Actualizar estado en DB
        const { error: updError } = await supabase.from('ads').update({ 
            status: 'rejected',
            rejection_reason: reason 
        }).eq('id', id);

        if (updError) throw updError;

        res.json({ message: 'Anuncio rechazado y reembolsado' });
    } catch (err) {
        console.error('[Reject Error]:', err.message);
        res.status(500).json({ message: 'Error al procesar el rechazo: ' + err.message });
    }
});

// POST /ads/create-local
router.post('/create-local', authMiddleware, async (req, res) => {
    try {
        const { community_id, content, budget_mxne, title, media_url, media_type, promoText, promoCode } = req.body;
        if (!community_id || !budget_mxne) return res.status(400).json({ message: 'Missing fields' });
        
        // --- Moderación Automática por IA ---
        const combinedContent = `Título: ${title}\nDescripción: ${content || ''}\nPromoción: ${promoText || ''}\nMedia: ${media_url}`;
        const aiCheck = await analyzeContentWithAI(combinedContent, media_type || 'banner');
        if (aiCheck.verdict === 'rejected' && aiCheck.confidence > 0.8) {
            return res.status(400).json({ 
                message: 'El anuncio fue rechazado automáticamente por infringir políticas de publicidad.',
                reason: aiCheck.reason 
            });
        }

        const result = await adsService.createLocalAd({
            advertiserId: req.user.id,
            community_id,
            content,
            budget_usdc: budget_mxne, // Mapeado a la columna existente por ahora
            title,
            media_url,
            media_type,
            promo_text: promoText || null,
            promo_code: promoCode || null
        });

        // Notificar a todos los admins
        try {
            const supabase = getDB();
            const { createNotification } = await import('../services/notifications.service.js');
            const { data: admins } = await supabase.from('users').select('id').eq('is_admin', true);
            if (admins) {
                for (const admin of admins) {
                    await createNotification({ userId: admin.id, actorId: req.user.id, type: 'ad_pending_review', postId: null });
                }
            }
        } catch (errAdmins) {
            console.error('[Admin Notification Error]', errAdmins.message);
        }

        res.status(201).json({ message: 'Local ad created', ...result });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /ads/feed/:communityId
router.get('/feed/:communityId', authMiddleware, async (req, res) => {
    try {
        const ads = await adsService.getLocalAds(req.params.communityId);
        res.json({ ads });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────
// CUPONERA ENDPOINTS
// ─────────────────────────────────────────────────────

// POST /ads/:adId/claim-coupon
router.post('/:adId/claim-coupon', authMiddleware, async (req, res) => {
    try {
        const { adId } = req.params;
        const userId = req.user.id;

        // Verificar si el anuncio tiene promoción
        const supabase = getDB(); // Para lectura pública del anuncio
        const { data: ad, error: adError } = await supabase.from('ads').select('promo_text, promo_code').eq('id', adId).single();
        if (adError || !ad) return res.status(404).json({ message: 'Anuncio no encontrado' });
        if (!ad.promo_text || !ad.promo_code) return res.status(400).json({ message: 'Este anuncio no tiene cupones' });

        // Insertar en user_coupons usando el cliente autenticado
        const { error: insertError } = await supabase.from('user_coupons').insert({
            user_id: userId,
            ad_id: adId,
            promo_text: ad.promo_text,
            promo_code: ad.promo_code
        });

        if (insertError) {
            if (insertError.code === '23505') { // Postgres Unique Violation
                return res.status(400).json({ message: 'Ya has reclamado este cupón' });
            }
            throw insertError;
        }

        res.status(201).json({ message: 'Cupón guardado con éxito' });
    } catch (err) {
        console.error('[Coupon Claim Error]:', err.message);
        res.status(500).json({ message: 'Error al reclamar el cupón' });
    }
});

// GET /ads/my-coupons
router.get('/my-coupons', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        
        // Obtener los cupones junto con la info del anunciante y el anuncio
        const { data: coupons, error } = await supabase
            .from('user_coupons')
            .select(`
                *,
                ad:ads (
                    title,
                    media_url,
                    media_type,
                    advertiser:users(display_name, avatar_url)
                )
            `)
            .eq('user_id', req.user.id)
            .order('claimed_at', { ascending: false });

        if (error) throw error;

        res.json({ coupons });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

export default router;