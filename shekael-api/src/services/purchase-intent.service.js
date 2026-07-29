import getDB from '../database/db.js';

// Pesos de señales de compra
const PURCHASE_SIGNALS = {
    save: 0.3,            // Guardar un producto → fuerte intención
    share_dm: 0.35,       // Compartir por DM → lo recomienda → alta intención
    comment: 0.4,         // Comentar (probablemente preguntar precio/disponibilidad)
    dwell_30s: 0.15,      // Ver 30+ segundos un producto
    completion: 0.2,      // Ver video hasta el final (tipo unboxing/review)
    like: 0.1,            // Like débil
    view: 0.02,           // Vista simple
};

// Señales negativas (desinterés en una categoría)
const NEGATIVE_SIGNALS = {
    dismiss: -0.15,       // Descartar/ignorar producto visible
};

// Umbral para considerar intención activa
const MIN_PURCHASE_SCORE = 0.3;
// Decaimiento semanal (si no hay interacción, baja el score)
const WEEKLY_DECAY = 0.7;

/**
 * Calcula la intención de compra de un usuario hacia una categoría.
 * Revisa engagement_signals de los últimos 30 días hacia posts de productos.
 * 
 * @param {string} userId
 * @param {string} category - tech, food, fashion, etc.
 * @returns {Promise<{score: number, signals: number}>}
 */
export async function calculatePurchaseIntent(userId, category) {
    const supabase = getDB();

    // Obtener posts de productos en esta categoría (que tengan tags que mapeen a la categoría)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const { data: signals } = await supabase
        .from('engagement_signals')
        .select('signal_type, created_at')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo);

    if (!signals || signals.length === 0) return { score: 0, signals: 0 };

    // Obtener posts que tienen tags relacionados a esta categoría
    // (optimización: filtrar posts cuyos tags mapeen a la categoría)
    const signalPostIds = [...new Set(signals.map(s => s.signal_type))];
    
    // Calcular score basado en señales ponderadas
    let totalScore = 0;
    let signalCount = 0;

    signals.forEach(signal => {
        const weight = PURCHASE_SIGNALS[signal.signal_type] || 0;
        if (weight > 0) {
            // Decaimiento temporal: las señales más recientes pesan más
            const daysAgo = (Date.now() - new Date(signal.created_at).getTime()) / 86400000;
            const recency = Math.max(0, 1 - daysAgo / 30);
            totalScore += weight * recency;
            signalCount++;
        }
    });

    // Normalizar: score entre 0 y 1
    // Si hay 10 señales de save (0.3 cada una), el score máximo sería 3.0
    // Lo normalizamos dividiendo entre 3 y limitando a 1.0
    const normalizedScore = Math.min(1, totalScore / 3);

    return {
        score: Math.round(normalizedScore * 100) / 100,
        signals: signalCount,
    };
}

/**
 * Recalcula purchase_intent para TODOS los usuarios activos.
 * Para ejecutar como cron semanal.
 */
export async function recalcAllPurchaseIntents() {
    const supabase = getDB();

    // Obtener usuarios con actividad en los últimos 30 días
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: activeUsers } = await supabase
        .from('engagement_signals')
        .select('user_id')
        .gte('created_at', thirtyDaysAgo)
        .limit(2000);

    if (!activeUsers) return { processed: 0 };

    const userIds = [...new Set(activeUsers.map(u => u.user_id))];
    const categories = ['tech', 'food', 'fashion', 'gaming', 'sports', 'music', 'travel', 'art', 'education'];
    let processed = 0;

    for (const userId of userIds) {
        try {
            for (const category of categories) {
                const { score, signals } = await calculatePurchaseIntent(userId, category);

                // Solo guardar si hay señales o si ya existe un registro previo
                if (signals > 0 || score >= MIN_PURCHASE_SCORE) {
                    await supabase.from('purchase_intent').upsert({
                        user_id: userId,
                        category: category,
                        score: score,
                        signals_count: signals,
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'user_id, category' });
                }
            }
            processed++;
        } catch (err) {
            console.error(`Error calculating purchase intent for user ${userId}:`, err.message);
        }
    }

    return { processed, total: userIds.length };
}

/**
 * Obtiene las categorías con mayor intención de compra para un usuario.
 */
export async function getTopPurchaseIntents(userId, limit = 5) {
    const supabase = getDB();

    // Aplicar decaimiento semanal
    const { data: scores } = await supabase
        .from('purchase_intent')
        .select('category, score, signals_count, updated_at')
        .eq('user_id', userId)
        .order('score', { ascending: false })
        .limit(limit);

    if (!scores) return [];

    return scores.map(s => {
        // Decaimiento: si no se actualizó en los últimos 7 días, baja el score
        const daysSinceUpdate = s.updated_at
            ? (Date.now() - new Date(s.updated_at).getTime()) / 86400000
            : 7;
        const decayFactor = Math.pow(WEEKLY_DECAY, Math.floor(daysSinceUpdate / 7));
        return {
            category: s.category,
            score: Math.round(parseFloat(s.score) * decayFactor * 100) / 100,
            signals_count: s.signals_count,
        };
    }).filter(s => s.score >= MIN_PURCHASE_SCORE);
}
