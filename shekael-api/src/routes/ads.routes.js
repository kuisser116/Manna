import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import getDB from '../database/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router({ strict: false });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POOL_CONFIG_PATH = path.join(__dirname, '../../data/pool-config.json');

// ─── Pool Config Helpers ─────────────────────────────────────

function getPoolConfig() {
    try {
        if (fs.existsSync(POOL_CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(POOL_CONFIG_PATH, 'utf-8'));
        }
    } catch (_) {}
    // Default: un pool vacío con estimado de $0.05 MXN por view
    return { month: getCurrentMonth(), totalPoolMxn: 0, userPoolMxn: 0, perViewMxn: 0.05, isSettled: false };
}

function savePoolConfig(config) {
    const dir = path.dirname(POOL_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(POOL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function getCurrentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─────────────────────────────────────
// GET /ads/pool — Estado del pool mensual
// ─────────────────────────────────────
router.get('/pool', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const pool = getPoolConfig();
        const month = getCurrentMonth();

        // Total de impresiones este mes
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const { count: totalImpressions, error: countError } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', monthStart.toISOString());

        if (countError) throw countError;

        // Impresiones del usuario este mes
        const { count: userImpressions } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', monthStart.toISOString());

        // Cálculo de earnings
        let estimatedEarnings = 0;
        let actualEarnings = 0;

        if (pool.isSettled && totalImpressions > 0) {
            // Pool cerrado: cálculo exacto
            actualEarnings = userImpressions * pool.perViewMxn;
            estimatedEarnings = actualEarnings;
        } else if (totalImpressions > 0 && pool.totalPoolMxn > 0) {
            // Pool abierto: estimación basada en el pool actual
            const currentPerView = pool.userPoolMxn / totalImpressions;
            estimatedEarnings = userImpressions * currentPerView;
        } else {
            // Sin pool: estimación basada en tasa default
            estimatedEarnings = userImpressions * pool.perViewMxn;
        }

        res.json({
            month,
            pool: {
                totalPoolMxn: pool.totalPoolMxn,
                userPoolMxn: pool.userPoolMxn,
                perViewMxn: pool.perViewMxn,
                isSettled: pool.isSettled
            },
            impressions: {
                total: totalImpressions || 0,
                yours: userImpressions || 0,
                yourShare: totalImpressions > 0 ? ((userImpressions || 0) / totalImpressions) * 100 : 0
            },
            earnings: {
                estimated: Math.round(estimatedEarnings * 100) / 100,
                actual: Math.round(actualEarnings * 100) / 100,
                isEstimated: !pool.isSettled
            }
        });
    } catch (error) {
        console.error('Error fetching pool:', error.message);
        res.status(500).json({ message: 'Error al obtener estado del pool' });
    }
});

// ─────────────────────────────────────
// POST /ads/set-pool — Admin: Definir pool del mes
// ─────────────────────────────────────
router.post('/set-pool', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { totalPoolMxn, userSharePct = 50, creatorSharePct = 40, isSettled = false } = req.body;

        if (!totalPoolMxn || totalPoolMxn <= 0) {
            return res.status(400).json({ message: 'El pool total debe ser mayor a 0' });
        }

        const month = getCurrentMonth();
        const userPoolMxn = totalPoolMxn * (userSharePct / 100);

        // Total de impresiones del mes
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const { count: totalImpressions } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', monthStart.toISOString());

        const perViewMxn = totalImpressions > 0 ? userPoolMxn / totalImpressions : 0;

        const pool = {
            month,
            totalPoolMxn,
            userPoolMxn,
            creatorPoolMxn: totalPoolMxn * (creatorSharePct / 100),
            totalImpressions: totalImpressions || 0,
            perViewMxn: Math.round(perViewMxn * 10000) / 10000,
            isSettled,
            userSharePct,
            creatorSharePct,
            updatedAt: new Date().toISOString()
        };

        if (isSettled) pool.settledAt = new Date().toISOString();

        savePoolConfig(pool);

        res.json({ success: true, pool, message: `Pool de ${month} actualizado: $${perViewMxn.toFixed(4)} MXN por impresión` });
    } catch (error) {
        console.error('Error setting pool:', error.message);
        res.status(500).json({ message: 'Error al configurar el pool' });
    }
});

// ─────────────────────────────────────
// GET /ads/earnings — Saldo de ganancias del usuario
// ─────────────────────────────────────
router.get('/earnings', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const pool = getPoolConfig();
        const month = getCurrentMonth();

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
            return res.json({ earnings: newData });
        }
        if (error) throw error;

        // Calcular si puede retirar este mes
        const now = new Date();
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

        // Impresiones del usuario este mes (para mostrar earnings estimados)
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const { count: userImpressions } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', monthStart.toISOString());

        const monthlyEarnings = userImpressions * pool.perViewMxn;

        res.json({
            earnings: {
                ...data,
                balance: Math.round(monthlyEarnings * 100) / 100, // Balance es lo del pool
                can_claim_monthly: canClaimMonthly,
                next_claim_date: nextClaimDate,
                monthly_impressions: userImpressions || 0,
                per_view_rate: pool.perViewMxn,
                pool_settled: pool.isSettled
            }
        });
    } catch (error) {
        console.error('Error fetching earnings:', error.message);
        res.status(500).json({ message: 'Error al obtener ganancias' });
    }
});

// ─────────────────────────────────────
// POST /ads/impression — Registrar vista de anuncio
// ─────────────────────────────────────
router.post('/impression', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const { ad_type = 'feed', source = 'feed', creator_id = null, focus_duration = 0, engagement = {} } = req.body;

        if (!['feed', 'preroll', 'rewarded'].includes(ad_type)) {
            return res.status(400).json({ message: 'Tipo de anuncio inválido' });
        }

        // Engagement bonus: la interacción real con el anuncio multiplica la recompensa.
        // Esto hace que los anunciantes paguen por tráfico CON interacción (no solo vistas).
        const engagementScore = Math.min(
            (engagement.liked ? 1 : 0) +
            (engagement.commented ? 2 : 0) +
            (engagement.saved ? 1.5 : 0) +
            (engagement.shares || 0) * 2 +
            (engagement.visitedProfile ? 1 : 0),
            5
        );
        // Multiplicador: 1x base + hasta +0.5x por engagement alto
        const engagementMultiplier = 1 + (engagementScore / 5) * 0.5;

        // Rate limiting: 20 ads/hr
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        const { count, error: countError } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', oneHourAgo);

        if (countError) throw countError;
        if (count >= 20) {
            return res.status(429).json({
                message: 'Has alcanzado el límite de anuncios por hora. Vuelve pronto.',
                retryAfter: 3600
            });
        }

        // Validar: necesita al menos 5 segundos en foco
        if (focus_duration < 5) {
            return res.status(400).json({ message: 'El anuncio debe verse al menos 5 segundos para contar', completed: false });
        }

        // Registrar impresión SIN asignar monto aún — se calcula al cerrar el pool.
        // Nota: engagement_score se persiste si la columna existe (ALTER manual en Supabase).
        const impressionPayload = {
            user_id: userId,
            ad_type,
            source,
            amount: 0, // Pendiente — se actualiza cuando se cierra el pool
            creator_id: creator_id || null,
            verified: true,
            focus_duration,
            completed: true,
            ip_hash: req.ip ? req.ip.split('.').slice(0, 2).join('.') : null
        };
        // engagement_score solo si la columna ya fue creada en Supabase
        const colCheck = await supabase.from('ad_impressions').select('engagement_score').limit(1);
        if (!colCheck.error) {
            impressionPayload.engagement_score = engagementScore;
        } else {
            console.warn('[Ads] engagement_score column no existe — se omite (ALTER manual pendiente)');
        }

        const { data: impression, error: impError } = await supabase
            .from('ad_impressions')
            .insert(impressionPayload)
            .select()
            .single();

        if (impError) throw impError;

        // Obtener pool config para mostrar estimación
        const pool = getPoolConfig();
        const baseRate = pool.perViewMxn || 0.05;
        const estimatedAmount = baseRate * engagementMultiplier;

        res.json({
            success: true,
            rewarded: Math.round(estimatedAmount * 100) / 100,
            engagement_multiplier: engagementMultiplier,
            isEstimated: !pool.isSettled,
            impression_id: impression.id,
            note: pool.isSettled
                ? `Ganaste $${estimatedAmount.toFixed(4)} MXN (pool cerrado${engagementMultiplier > 1 ? ' +' + Math.round((engagementMultiplier - 1) * 100) + '% por interacción' : ''})`
                : `Estimado ~$${estimatedAmount.toFixed(4)} MXN (pool en cálculo — se ajusta al cerrar el mes)`
        });

    } catch (error) {
        console.error('Error recording impression:', error.message);
        res.status(500).json({ message: 'Error al registrar impresión' });
    }
});

// ─────────────────────────────────────
// POST /ads/claim-monthly — Retiro mensual de ganancias
// ─────────────────────────────────────
router.post('/claim-monthly', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const pool = getPoolConfig();
        const month = getCurrentMonth();

        // Verificar que el pool esté cerrado/settled
        if (!pool.isSettled) {
            return res.status(400).json({
                message: `El pool de ${month} aún no está cerrado. Espera a que Kuki cierre el mes para calcular las ganancias reales.`
            });
        }

        const { data: earnings, error } = await supabase
            .from('ad_earnings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) throw error;

        // Verificar que no haya retirado este mes
        if (earnings.last_monthly_claim) {
            const lastClaim = new Date(earnings.last_monthly_claim);
            const now = new Date();
            const monthsDiff = (now.getFullYear() - lastClaim.getFullYear()) * 12 + (now.getMonth() - lastClaim.getMonth());
            if (monthsDiff < 1) {
                const nextDate = new Date(lastClaim);
                nextDate.setMonth(nextDate.getMonth() + 1);
                return res.status(400).json({
                    message: 'Ya retiraste este mes. Vuelve el mes que viene.',
                    nextClaimDate: nextDate
                });
            }
        }

        // Calcular ganancias reales del usuario basadas en el pool
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const { count: userImpressions } = await supabase
            .from('ad_impressions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', monthStart.toISOString());

        const totalEarned = userImpressions * pool.perViewMxn;

        if (totalEarned <= 0) {
            return res.status(400).json({ message: 'No tienes ganancias para retirar este mes' });
        }

        // Marcar como retirado
        const { error: updateError } = await supabase
            .from('ad_earnings')
            .update({
                balance: 0,
                total_withdrawn: parseFloat(earnings.total_withdrawn || 0) + totalEarned,
                total_earned: parseFloat(earnings.total_earned || 0) + totalEarned,
                last_monthly_claim: new Date().toISOString()
            })
            .eq('user_id', userId);

        if (updateError) throw updateError;

        res.json({
            success: true,
            claimed: Math.round(totalEarned * 100) / 100,
            impressions: userImpressions,
            perViewRate: pool.perViewMxn,
            message: `Se añadieron $${totalEarned.toFixed(2)} MXN a tu wallet (${userImpressions} impresiones × $${pool.perViewMxn.toFixed(4)})`
        });

    } catch (error) {
        console.error('Error claiming monthly:', error.message);
        res.status(500).json({ message: 'Error al procesar retiro mensual' });
    }
});

// ─────────────────────────────────────
// GET /ads/history — Historial de anuncios vistos
// ─────────────────────────────────────
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

// ─────────────────────────────────────
// GET /ads/stats — Estadísticas del día/semana
// ─────────────────────────────────────
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        const pool = getPoolConfig();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: todayData } = await supabase
            .from('ad_impressions')
            .select('amount')
            .eq('user_id', userId)
            .gte('created_at', todayStart.toISOString());

        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const { data: weekData } = await supabase
            .from('ad_impressions')
            .select('amount')
            .eq('user_id', userId)
            .gte('created_at', weekStart.toISOString());

        const todayCount = todayData?.length || 0;
        const weekCount = weekData?.length || 0;

        res.json({
            today: { earned: todayCount * pool.perViewMxn, count: todayCount },
            week: { earned: weekCount * pool.perViewMxn, count: weekCount },
            dailyLimit: 20,
            dailyRemaining: Math.max(0, 20 - todayCount),
            perViewMxn: pool.perViewMxn,
            poolSettled: pool.isSettled
        });
    } catch (error) {
        console.error('Error fetching stats:', error.message);
        res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
});

export default router;
