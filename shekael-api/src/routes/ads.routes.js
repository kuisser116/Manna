import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import getDB from '../database/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendPayment } from '../services/stellar.service.js';
import { convertToUSDC } from '../services/price.service.js';

const router = Router({ strict: false });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POOL_CONFIG_PATH = path.join(__dirname, '../../data/pool-config.json');

// ═══════════════════════════════════════════════════════════
// MODELO OFICIAL (Kuki, 01-Ago-2026) — REPARTO POR TIEMPO DE VISTA
//
//  - Anuncio en contenido del creador:  70% creador / 15% usuario / 15% app
//  - Anuncio en feed (sin creador):     80% app / 20% usuario
//  - La impresión SOLO cuenta para el usuario si se vio el tiempo mínimo:
//      · feed / post de texto o imagen: 10 segundos
//      · video / preroll:               30 segundos
//  - Si NO cumple el tiempo, la impresión se registra igual pero
//    su valor completo se lo queda Shekael (no el usuario).
//  - Sin botones de interacción: nada incentivado (seguro con Google).
//  - Cada anuncio cuenta UNA vez por usuario al mes (anti-repetición).
//  - Tope anti-farm: 100 impresiones válidas por usuario al día.
// ═══════════════════════════════════════════════════════════
const SPLITS = {
    creatorContent: { creator: 0.70, user: 0.15, app: 0.15 },
    feed: { app: 0.80, user: 0.20 }
};
const MIN_CLAIM_MXN = 20;
const WATCH_THRESHOLDS = { feed: 10, preroll: 30, rewarded: 30 };
const MAX_ADS_PER_DAY = 100;

function getCurrentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getPoolConfig() {
    try {
        if (fs.existsSync(POOL_CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(POOL_CONFIG_PATH, 'utf-8'));
        }
    } catch (_) {}
    return defaultPoolConfig();
}

function defaultPoolConfig() {
    return {
        month: getCurrentMonth(),
        totalPoolMxn: 0,
        totalImpressions: 0,
        validImpressions: 0,
        perViewMxn: 0.05,
        isSettled: false,
        splits: SPLITS,
        updatedAt: null,
        settledAt: null
    };
}

function savePoolConfig(config) {
    const dir = path.dirname(POOL_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(POOL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function monthStartISO() {
    const d = new Date();
    d.setDate(1); d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

// ═══════════════════════════════════════════════════════════
// GET /ads/next — Siguiente anuncio no visto para este usuario
// (rotación: un anuncio cuenta 1 vez por usuario al mes)
// ═══════════════════════════════════════════════════════════
router.get('/next', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const clientSeen = (req.query.seen || '').split(',').filter(Boolean);

        // Ads ya vistos por este usuario este mes (desde la DB)
        const { data: seenRows } = await supabase
            .from('ad_impressions')
            .select('ad_id')
            .eq('user_id', userId)
            .not('ad_id', 'is', null)
            .gte('created_at', monthStartISO());

        const seenSet = new Set([...clientSeen, ...(seenRows || []).map(r => r.ad_id)]);

        const now = new Date().toISOString();
        const { data: ads, error } = await supabase
            .from('ads')
            .select('*')
            .eq('status', 'approved')
            .lte('start_date', now)
            .or(`end_date.is.null,end_date.gte.${now}`)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Rotación: primero los no vistos; si todos vistos, null
        const unseen = (ads || []).filter(a => !seenSet.has(a.id));
        const available = unseen.length > 0 ? unseen : [];

        if (available.length === 0) {
            return res.json({ ad: null, remaining: 0 });
        }

        // Alternar: tomar uno pseudoaleatorio entre los no vistos
        const ad = available[Math.floor(Math.random() * available.length)];

        res.json({
            ad: {
                id: ad.id,
                title: ad.title,
                description: ad.description,
                media_url: ad.media_url,
                media_type: ad.media_type,
                cta_label: ad.cta_label,
                cta_url: ad.cta_url,
                alt_text: ad.alt_text,
                promo_text: ad.promo_text,
                promo_code: ad.promo_code
            },
            remaining: available.length - 1
        });
    } catch (error) {
        console.error('Error fetching next ad:', error.message);
        res.status(500).json({ message: 'Error al obtener anuncio' });
    }
});

// ═══════════════════════════════════════════════════════════
// GET /ads/pool — Estado del pool mensual
// ═══════════════════════════════════════════════════════════
router.get('/pool', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const pool = getPoolConfig();

        const { count: totalImpressions } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', monthStartISO());

        const { count: validImpressions } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .eq('valid', true)
            .gte('created_at', monthStartISO());

        const { count: userImpressions } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', monthStartISO());

        const { count: userValid } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('valid', true)
            .gte('created_at', monthStartISO());

        let estimatedEarnings = 0;
        if (totalImpressions > 0 && pool.totalPoolMxn > 0) {
            const perView = pool.totalPoolMxn / totalImpressions;
            estimatedEarnings = (userValid || 0) * perView * SPLITS.feed.user;
        } else if (userValid > 0) {
            estimatedEarnings = userValid * pool.perViewMxn * SPLITS.feed.user;
        }

        res.json({
            month: pool.month,
            pool: {
                totalPoolMxn: pool.totalPoolMxn,
                perViewMxn: pool.perViewMxn,
                isSettled: pool.isSettled,
                splits: pool.splits,
                minClaimMxn: MIN_CLAIM_MXN
            },
            impressions: {
                total: totalImpressions || 0,
                valid: validImpressions || 0,
                yours: userImpressions || 0,
                yoursValid: userValid || 0,
                yourShare: (validImpressions || 0) > 0 ? ((userValid || 0) / validImpressions) * 100 : 0
            },
            earnings: {
                estimated: Math.round(estimatedEarnings * 100) / 100,
                actual: 0,
                isEstimated: !pool.isSettled
            },
            watchThresholds: WATCH_THRESHOLDS,
            dailyLimit: MAX_ADS_PER_DAY
        });
    } catch (error) {
        console.error('Error fetching pool:', error.message);
        res.status(500).json({ message: 'Error al obtener estado del pool' });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /ads/set-pool — Admin: definir pool del mes (lo que entró a Shekael)
// ═══════════════════════════════════════════════════════════
router.post('/set-pool', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { totalPoolMxn, isSettled = false } = req.body;

        if (!totalPoolMxn || totalPoolMxn <= 0) {
            return res.status(400).json({ message: 'El pool total debe ser mayor a 0' });
        }

        const month = getCurrentMonth();
        const { count: totalImpressions } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', monthStartISO());

        const { count: validImpressions } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .eq('valid', true)
            .gte('created_at', monthStartISO());

        // El per-view se calcula sobre TODAS las impresiones registradas.
        // Las no válidas: su valor completo se lo queda Shekael.
        const perViewMxn = totalImpressions > 0 ? totalPoolMxn / totalImpressions : 0;

        const pool = {
            month,
            totalPoolMxn,
            totalImpressions: totalImpressions || 0,
            validImpressions: validImpressions || 0,
            perViewMxn: Math.round(perViewMxn * 10000) / 10000,
            isSettled,
            splits: SPLITS,
            updatedAt: new Date().toISOString(),
            settledAt: isSettled ? new Date().toISOString() : null
        };

        // ── CIERRE DE MES: 70% a creadores por impresiones VÁLIDAS ──
        if (isSettled && validImpressions > 0) {
            const { data: byCreator } = await supabase
                .from('ad_impressions')
                .select('creator_id')
                .eq('valid', true)
                .not('creator_id', 'is', null)
                .gte('created_at', monthStartISO());

            const creatorCounts = {};
            for (const imp of (byCreator || [])) {
                creatorCounts[imp.creator_id] = (creatorCounts[imp.creator_id] || 0) + 1;
            }

            for (const [creatorId, count] of Object.entries(creatorCounts)) {
                const creatorEarn = Math.round(count * perViewMxn * SPLITS.creatorContent.creator * 100) / 100;
                if (creatorEarn <= 0) continue;
                const { data: existing } = await supabase
                    .from('ad_earnings')
                    .select('id, balance, total_earned')
                    .eq('user_id', creatorId)
                    .single();
                if (existing) {
                    await supabase
                        .from('ad_earnings')
                        .update({
                            balance: Math.round((parseFloat(existing.balance || 0) + creatorEarn) * 100) / 100,
                            total_earned: Math.round((parseFloat(existing.total_earned || 0) + creatorEarn) * 100) / 100
                        })
                        .eq('user_id', creatorId);
                } else {
                    await supabase
                        .from('ad_earnings')
                        .insert({ user_id: creatorId, balance: creatorEarn, total_earned: creatorEarn, total_withdrawn: 0 });
                }
                console.log(`[Pool] Creador ${creatorId}: +$${creatorEarn.toFixed(2)} MXN (${count} impresiones válidas)`);
            }
        }

        savePoolConfig(pool);

        res.json({
            success: true,
            pool,
            message: `Pool de ${month} actualizado: $${perViewMxn.toFixed(4)} MXN por impresión (${validImpressions} válidas de ${totalImpressions})${isSettled ? ' — pool CERRADO y creadores pagados (70%)' : ''}`
        });
    } catch (error) {
        console.error('Error setting pool:', error.message);
        res.status(500).json({ message: 'Error al configurar el pool' });
    }
});

// ═══════════════════════════════════════════════════════════
// GET /ads/earnings — Saldo de ganancias del usuario
// ═══════════════════════════════════════════════════════════
router.get('/earnings', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const pool = getPoolConfig();
        const now = new Date();

        const { data, error } = await supabase
            .from('ad_earnings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code === 'PGRST116') {
            const { data: newData, error: insertError } = await supabase
                .from('ad_earnings')
                .insert({ user_id: userId, balance: 0, total_earned: 0, total_withdrawn: 0 })
                .select()
                .single();
            if (insertError) throw insertError;
            return res.json({ earnings: { ...newData, can_claim_monthly: true, monthly_impressions: 0 } });
        }
        if (error) throw error;

        let canClaimMonthly = true;
        let nextClaimDate = null;
        if (data.last_monthly_claim) {
            const lastClaim = new Date(data.last_monthly_claim);
            const monthsDiff = (now.getFullYear() - lastClaim.getFullYear()) * 12 + (now.getMonth() - lastClaim.getMonth());
            canClaimMonthly = monthsDiff >= 1;
            if (!canClaimMonthly) {
                nextClaimDate = new Date(lastClaim);
                nextClaimDate.setMonth(nextClaimDate.getMonth() + 1);
            }
        }

        // Válidas del mes: feed 20% + contenido creador 15%
        const { data: impressions } = await supabase
            .from('ad_impressions')
            .select('creator_id')
            .eq('user_id', userId)
            .eq('valid', true)
            .gte('created_at', monthStartISO());

        const feedCount = (impressions || []).filter(i => !i.creator_id).length;
        const creatorCount = (impressions || []).length - feedCount;
        const monthlyEarnings = (feedCount * SPLITS.feed.user + creatorCount * SPLITS.creatorContent.user) * pool.perViewMxn;

        res.json({
            earnings: {
                ...data,
                balance: Math.round(monthlyEarnings * 100) / 100,
                can_claim_monthly: canClaimMonthly,
                next_claim_date: nextClaimDate,
                monthly_impressions: (impressions || []).length,
                feed_impressions: feedCount,
                creator_content_impressions: creatorCount,
                per_view_rate: pool.perViewMxn,
                pool_settled: pool.isSettled,
                min_claim_mxn: MIN_CLAIM_MXN,
                watch_thresholds: WATCH_THRESHOLDS
            }
        });
    } catch (error) {
        console.error('Error fetching earnings:', error.message);
        res.status(500).json({ message: 'Error al obtener ganancias' });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /ads/impression — Registrar impresión por TIEMPO DE VISTA
// ═══════════════════════════════════════════════════════════
router.post('/impression', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const { ad_type = 'feed', source = 'feed', creator_id = null, watch_seconds = 0, ad_id = null } = req.body;

        if (!WATCH_THRESHOLDS[ad_type]) {
            return res.status(400).json({ message: 'Tipo de anuncio inválido' });
        }

        // Tope anti-farm: 100 impresiones por usuario al día
        const dayAgo = new Date(Date.now() - 86400000).toISOString();
        const { count, error: countError } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', dayAgo);
        if (countError) throw countError;
        if (count >= MAX_ADS_PER_DAY) {
            return res.status(429).json({ message: 'Has alcanzado el límite diario de anuncios (100). Vuelve mañana.' });
        }

        const threshold = WATCH_THRESHOLDS[ad_type];
        const valid = watch_seconds >= threshold;

        const impressionPayload = {
            user_id: userId,
            ad_type,
            source,
            amount: 0,
            creator_id: creator_id || null,
            verified: valid,
            valid,
            watch_seconds: Math.min(watch_seconds, 3600),
            ad_id: ad_id || null,
            completed: true,
            ip_hash: req.ip ? req.ip.split('.').slice(0, 2).join('.') : null
        };

        const { data: impression, error: impError } = await supabase
            .from('ad_impressions')
            .insert(impressionPayload)
            .select()
            .single();

        if (impError && (impError.message?.includes('valid') || impError.message?.includes('ad_id') || impError.message?.includes('watch_seconds'))) {
            // Columnas nuevas aún no existen: insertar sin ellas (fallback)
            delete impressionPayload.valid;
            delete impressionPayload.ad_id;
            delete impressionPayload.watch_seconds;
            const { data: retry, error: retryErr } = await supabase
                .from('ad_impressions')
                .insert(impressionPayload)
                .select()
                .single();
            if (retryErr) throw retryErr;
            return finalizeImpression(res, retry, creator_id, valid);
        }
        if (impError) throw impError;

        return finalizeImpression(res, impression, creator_id, valid);
    } catch (error) {
        console.error('Error recording impression:', error.message);
        res.status(500).json({ message: 'Error al registrar impresión' });
    }
});

function finalizeImpression(res, impression, creatorId, valid) {
    const pool = getPoolConfig();
    const userShare = valid ? (creatorId ? SPLITS.creatorContent.user : SPLITS.feed.user) : 0;
    const estimatedAmount = pool.perViewMxn * userShare;

    if (!valid) {
        return res.json({
            success: true,
            valid: false,
            rewarded: 0,
            note: 'Esta impresión no cumplió el tiempo mínimo de vista, así que su valor se lo queda Shekael. Mira el anuncio unos segundos más para que cuente a tu favor.'
        });
    }

    const parts = creatorId
        ? ['70% para el creador', '15% para ti']
        : ['20% para ti'];

    res.json({
        success: true,
        valid: true,
        rewarded: Math.round(estimatedAmount * 100) / 100,
        user_share_pct: Math.round(userShare * 100),
        isEstimated: !pool.isSettled,
        impression_id: impression.id,
        note: pool.isSettled
            ? `Ganaste $${estimatedAmount.toFixed(4)} MXN (${parts.join(' · ')})`
            : `Estimado ~$${estimatedAmount.toFixed(4)} MXN (${parts.join(' · ')}) — se ajusta al cerrar el mes`
    });
}

// ═══════════════════════════════════════════════════════════
// POST /ads/claim-monthly — Retiro mensual con PAGO USDC REAL
// (solo impresiones VÁLIDAS cuentan para el usuario)
// ═══════════════════════════════════════════════════════════
router.post('/claim-monthly', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const pool = getPoolConfig();

        if (!pool.isSettled) {
            return res.status(400).json({
                message: `El pool de ${pool.month} aún no está cerrado. Espera a que se cierre el mes para calcular las ganancias reales.`
            });
        }

        const { data: earnings, error } = await supabase
            .from('ad_earnings')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (error) throw error;

        if (earnings.last_monthly_claim) {
            const lastClaim = new Date(earnings.last_monthly_claim);
            const now = new Date();
            const monthsDiff = (now.getFullYear() - lastClaim.getFullYear()) * 12 + (now.getMonth() - lastClaim.getMonth());
            if (monthsDiff < 1) {
                const nextDate = new Date(lastClaim);
                nextDate.setMonth(nextDate.getMonth() + 1);
                return res.status(400).json({ message: 'Ya retiraste este mes. Vuelve el mes que viene.', nextClaimDate: nextDate });
            }
        }

        const { data: impressions } = await supabase
            .from('ad_impressions')
            .select('creator_id')
            .eq('user_id', userId)
            .eq('valid', true)
            .gte('created_at', monthStartISO());

        const feedCount = (impressions || []).filter(i => !i.creator_id).length;
        const creatorCount = (impressions || []).length - feedCount;
        const totalEarned = Math.round((feedCount * SPLITS.feed.user + creatorCount * SPLITS.creatorContent.user) * pool.perViewMxn * 100) / 100;

        if (totalEarned <= 0) {
            return res.status(400).json({ message: 'No tienes ganancias para retirar este mes' });
        }

        if (totalEarned < MIN_CLAIM_MXN) {
            return res.status(400).json({
                message: `Mínimo de retiro: $${MIN_CLAIM_MXN} MXN. Llevas $${totalEarned.toFixed(2)} MXN este mes.`,
                earned: totalEarned,
                minRequired: MIN_CLAIM_MXN
            });
        }

        const { data: user } = await supabase
            .from('users')
            .select('stellar_public_key')
            .eq('id', userId)
            .single();

        if (!user?.stellar_public_key) {
            return res.status(400).json({ message: 'No tienes billetera Stellar configurada' });
        }

        const masterSecret = process.env.MANNA_DEV_WALLET_SECRET || process.env.BONUS_WALLET_SECRET;
        if (!masterSecret) {
            return res.status(500).json({ message: 'Wallet maestra no configurada (MANNA_DEV_WALLET_SECRET)' });
        }

        const amountUSDC = parseFloat(await convertToUSDC(totalEarned));
        if (amountUSDC <= 0) {
            return res.status(500).json({ message: 'Error al convertir a USDC' });
        }

        let txHash;
        try {
            txHash = await sendPayment({
                fromSecretKey: masterSecret,
                toPublicKey: user.stellar_public_key,
                amount: String(amountUSDC.toFixed(7)),
                memo: `Shekael:claim:${userId.slice(0, 10)}`
            });
        } catch (stellarErr) {
            console.error('[Claim] Stellar payment failed:', stellarErr.message);
            return res.status(500).json({ message: 'Error al enviar USDC. Intenta de nuevo.', error: stellarErr.message });
        }

        await supabase
            .from('ad_earnings')
            .update({
                balance: 0,
                total_withdrawn: Math.round((parseFloat(earnings.total_withdrawn || 0) + totalEarned) * 100) / 100,
                total_earned: Math.round((parseFloat(earnings.total_earned || 0) + totalEarned) * 100) / 100,
                last_monthly_claim: new Date().toISOString()
            })
            .eq('user_id', userId);

        res.json({
            success: true,
            claimed: totalEarned,
            claimedUSDC: amountUSDC.toFixed(4),
            txHash,
            impressions: { feed: feedCount, creatorContent: creatorCount },
            message: `$${totalEarned.toFixed(2)} MXN (${amountUSDC.toFixed(4)} USDC) enviados a tu wallet Stellar. Llega en ~5 segundos.`
        });
    } catch (error) {
        console.error('Error claiming monthly:', error.message);
        res.status(500).json({ message: 'Error al procesar retiro mensual' });
    }
});

// ═══════════════════════════════════════════════════════════
// GET /ads/history — Historial de anuncios vistos
// ═══════════════════════════════════════════════════════════
router.get('/history', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 0;
        const limit = 20;
        const offset = page * limit;

        const { data, error } = await supabase
            .from('ad_impressions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) throw error;

        const { count } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        res.json({ impressions: data, total: count, page, hasMore: offset + limit < count });
    } catch (error) {
        console.error('Error fetching history:', error.message);
        res.status(500).json({ message: 'Error al obtener historial' });
    }
});

// ═══════════════════════════════════════════════════════════
// GET /ads/stats — Estadísticas del día/semana (solo válidas)
// ═══════════════════════════════════════════════════════════
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const pool = getPoolConfig();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const { data: todayData } = await supabase
            .from('ad_impressions')
            .select('creator_id')
            .eq('user_id', userId)
            .eq('valid', true)
            .gte('created_at', todayStart.toISOString());

        const { data: weekData } = await supabase
            .from('ad_impressions')
            .select('creator_id')
            .eq('user_id', userId)
            .eq('valid', true)
            .gte('created_at', weekStart.toISOString());

        const calcEarned = (rows) => {
            const feed = (rows || []).filter(i => !i.creator_id).length;
            const creator = (rows || []).length - feed;
            return Math.round((feed * SPLITS.feed.user + creator * SPLITS.creatorContent.user) * pool.perViewMxn * 100) / 100;
        };

        const todayCount = todayData?.length || 0;

        res.json({
            today: { earned: calcEarned(todayData), count: todayCount },
            week: { earned: calcEarned(weekData), count: weekData?.length || 0 },
            dailyLimit: MAX_ADS_PER_DAY,
            dailyRemaining: Math.max(0, MAX_ADS_PER_DAY - todayCount),
            perViewMxn: pool.perViewMxn,
            poolSettled: pool.isSettled,
            splits: pool.splits,
            minClaimMxn: MIN_CLAIM_MXN,
            watchThresholds: WATCH_THRESHOLDS
        });
    } catch (error) {
        console.error('Error fetching stats:', error.message);
        res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
});

export default router;
