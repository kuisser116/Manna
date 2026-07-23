import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
const router = Router({ strict: false });

// ─────────────────────────────────────
// GET /ads/earnings — Saldo de ganancias del usuario
// ─────────────────────────────────────
router.get('/earnings', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('ad_earnings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code === 'PGRST116') {
            // No existe registro — crear uno
            const { data: newData, error: insertError } = await supabase
                .from('ad_earnings')
                .insert({
                    user_id: userId,
                    balance: 0,
                    total_earned: 0,
                    total_withdrawn: 0
                })
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
            const monthsDiff = (now.getFullYear() - lastClaim.getFullYear()) * 12
                + (now.getMonth() - lastClaim.getMonth());
            canClaimMonthly = monthsDiff >= 1;

            if (!canClaimMonthly) {
                nextClaimDate = new Date(lastClaim);
                nextClaimDate.setMonth(nextClaimDate.getMonth() + 1);
            }
        }

        res.json({
            earnings: {
                ...data,
                can_claim_monthly: canClaimMonthly,
                next_claim_date: nextClaimDate
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
        const { ad_type = 'feed', source = 'feed', creator_id = null, focus_duration = 0 } = req.body;

        // Validar tipo
        if (!['feed', 'preroll', 'rewarded'].includes(ad_type)) {
            return res.status(400).json({ message: 'Tipo de anuncio inválido' });
        }

        // Rate limiting: max 20 ads por hora por usuario
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

        // Calcular recompensa según tipo
        let amount = 0;
        // Feed ad: ~$0.10-0.20 MXN (Mexico CPM ~$2-5, user gets 50%)
        if (ad_type === 'feed') amount = 0.15;
        // Pre-roll: same range but 20% to viewer
        else if (ad_type === 'preroll') amount = 0.08;
        // Rewarded: user chose to watch, higher value
        else if (ad_type === 'rewarded') amount = 0.25;

        // Validar: necesita al menos 5 segundos en foco
        if (focus_duration < 5) {
            return res.status(400).json({
                message: 'El anuncio debe verse al menos 5 segundos para contar',
                completed: false
            });
        }

        // Insertar impresión
        const { data: impression, error: impError } = await supabase
            .from('ad_impressions')
            .insert({
                user_id: userId,
                ad_type,
                source,
                amount,
                creator_id: creator_id || null,
                verified: true,
                focus_duration,
                completed: true,
                ip_hash: req.ip ? req.ip.split('.').slice(0, 2).join('.') : null
            })
            .select()
            .single();

        if (impError) throw impError;

        // Actualizar balance del usuario
        const { data: earnings, error: earnError } = await supabase
            .from('ad_earnings')
            .select('balance, total_earned')
            .eq('user_id', userId)
            .single();

        if (earnError) throw earnError;

        const newBalance = parseFloat(earnings.balance) + amount;
        const newTotalEarned = parseFloat(earnings.total_earned) + amount;

        const { error: updateError } = await supabase
            .from('ad_earnings')
            .update({
                balance: newBalance,
                total_earned: newTotalEarned,
                last_ad_view: new Date().toISOString()
            })
            .eq('user_id', userId);

        if (updateError) throw updateError;

        // Si hay creator_id, también se le acredita su parte
        // Pre-roll: 70% creator, 20% viewer, 10% Shekael
        if (creator_id && ad_type === 'preroll') {
            const creatorAmount = amount * (70 / 20); // ~$0.28 por view
            const { data: creatorEarnings } = await supabase
                .from('ad_earnings')
                .select('balance, total_earned')
                .eq('user_id', creator_id)
                .single();

            if (creatorEarnings) {
                const newCreatorBalance = parseFloat(creatorEarnings.balance) + creatorAmount;
                const newCreatorTotal = parseFloat(creatorEarnings.total_earned) + creatorAmount;
                await supabase
                    .from('ad_earnings')
                    .update({
                        balance: newCreatorBalance,
                        total_earned: newCreatorTotal
                    })
                    .eq('user_id', creator_id);
            }
        }

        res.json({
            success: true,
            rewarded: amount,
            new_balance: newBalance,
            impression_id: impression.id
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

        const { data: earnings, error } = await supabase
            .from('ad_earnings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) throw error;

        // Verificar que no haya retirado en el último mes
        if (earnings.last_monthly_claim) {
            const lastClaim = new Date(earnings.last_monthly_claim);
            const now = new Date();
            const monthsDiff = (now.getFullYear() - lastClaim.getFullYear()) * 12
                + (now.getMonth() - lastClaim.getMonth());
            if (monthsDiff < 1) {
                return res.status(400).json({
                    message: 'Ya retiraste este mes. Vuelve el mes que viene.',
                    nextClaimDate: new Date(lastClaim.setMonth(lastClaim.getMonth() + 1))
                });
            }
        }

        const balance = parseFloat(earnings.balance);
        if (balance <= 0) {
            return res.status(400).json({ message: 'No tienes ganancias para retirar' });
        }

        // Marcar como retirado (el dinero se añade al balance general de la wallet)
        const { error: updateError } = await supabase
            .from('ad_earnings')
            .update({
                balance: 0,
                total_withdrawn: parseFloat(earnings.total_withdrawn) + balance,
                last_monthly_claim: new Date().toISOString()
            })
            .eq('user_id', userId);

        if (updateError) throw updateError;

        res.json({
            success: true,
            claimed: balance,
            message: `Se añadieron $${balance.toFixed(2)} MXN a tu wallet`
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

        res.json({
            impressions: data,
            total: count,
            page,
            hasMore: offset + limit < count
        });

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

        // Hoy
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: todayData } = await supabase
            .from('ad_impressions')
            .select('amount')
            .eq('user_id', userId)
            .gte('created_at', todayStart.toISOString());

        // Esta semana
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const { data: weekData } = await supabase
            .from('ad_impressions')
            .select('amount')
            .eq('user_id', userId)
            .gte('created_at', weekStart.toISOString());

        const todayEarned = todayData?.reduce((sum, r) => sum + parseFloat(r.amount), 0) || 0;
        const todayCount = todayData?.length || 0;
        const weekEarned = weekData?.reduce((sum, r) => sum + parseFloat(r.amount), 0) || 0;
        const weekCount = weekData?.length || 0;

        res.json({
            today: { earned: todayEarned, count: todayCount },
            week: { earned: weekEarned, count: weekCount },
            dailyLimit: 20,
            dailyRemaining: Math.max(0, 20 - todayCount)
        });

    } catch (error) {
        console.error('Error fetching stats:', error.message);
        res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
});

export default router;
