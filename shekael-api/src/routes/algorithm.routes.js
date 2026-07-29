import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import getDB from '../database/db.js';
import { deriveAllUserInterests } from '../services/interest-derivation.service.js';
import { recalcAllPurchaseIntents, getTopPurchaseIntents } from '../services/purchase-intent.service.js';

const router = Router({ strict: false });

// ─── Configuración de pesos ───
const SIGNAL_WEIGHTS = {
    save: 10,
    share_dm: 8,
    share_feed: 6,
    comment: 4,
    completion: 3,
    dwell_30s: 2,
    dwell_5s: 0.5,
    like: 1,
    view: 0.1,
};

const DECAY_POWER = 0.3;
const NEW_POST_BOOST = 5;

// Helper: mapea un tag a categoría de compra
function tagToCategory(tag) {
    if (!tag) return null;
    const t = tag.toLowerCase().trim();
    const map = {
        tech: 'tech', technology: 'tech', programming: 'tech', ai: 'tech',
        food: 'food', comida: 'food', cocina: 'food', cooking: 'food', recipe: 'food', restaurant: 'food', tacos: 'food',
        fashion: 'fashion', moda: 'fashion', style: 'fashion',
        gaming: 'gaming', game: 'gaming', games: 'gaming', videojuegos: 'gaming',
        sports: 'sports', sport: 'sports', futbol: 'sports', fitness: 'sports',
        music: 'music', musica: 'music',
        travel: 'travel', viaje: 'travel', viajes: 'travel',
        art: 'art', arte: 'art', design: 'art', photography: 'art',
        education: 'education', educacion: 'education', learning: 'education',
    };
    return map[t] || null;
}

// ─── Señal → columna en post_value_scores ───
const SIGNAL_TO_COLUMN = {
    save: 'save_count',
    share_dm: 'share_dm_count',
    share_feed: 'share_feed_count',
    comment: 'comment_count',
    completion: 'completion_count',
    dwell_30s: 'dwell_total_seconds',
    dwell_5s: 'dwell_total_seconds',
    like: 'like_count',
    view: 'view_count',
};

// ─── Trackear una señal ───
router.post('/signal', authMiddleware, async (req, res) => {
    try {
        const { postId, signalType, source = 'shekael' } = req.body;
        const userId = req.user.id;

        if (!postId || !signalType) {
            return res.status(400).json({ success: false, message: 'postId y signalType requeridos' });
        }
        if (!SIGNAL_WEIGHTS[signalType]) {
            return res.status(400).json({ success: false, message: `signalType inválido: ${signalType}` });
        }

        const supabase = getDB();

        // 1. Insertar señal en engagement_signals
        await supabase.from('engagement_signals').insert({
            user_id: String(userId),
            post_id: String(postId),
            signal_type: signalType,
            source: source,
        });

        // 2. Actualizar o insertar en post_value_scores
        const column = SIGNAL_TO_COLUMN[signalType];
        if (signalType === 'dwell_30s') {
            await supabase.rpc('increment_post_value', {
                p_post_id: String(postId),
                p_column: column,
                p_amount: 30,
            });
        } else if (signalType === 'dwell_5s') {
            await supabase.rpc('increment_post_value', {
                p_post_id: String(postId),
                p_column: column,
                p_amount: 5,
            });
        } else {
            await supabase.rpc('increment_post_value', {
                p_post_id: String(postId),
                p_column: column,
                p_amount: 1,
            });
        }

        // 3. Recalcular value_score y trending_score
        await supabase.rpc('recalc_post_scores', { p_post_id: String(postId) });

        // 4. Actualizar afinidad (solo para posts federados con author detectable)
        const authorId = postId.startsWith('fed__')
            ? postId.split('__').slice(0, 2).join('__')
            : null;

        if (authorId) {
            // Obtener todas las señales de este usuario hacia este autor
            const { data: signals } = await supabase
                .from('engagement_signals')
                .select('signal_type')
                .eq('user_id', String(userId))
                .like('post_id', `${authorId}%`);

            const totalWeight = (signals || []).reduce((sum, s) => {
                return sum + (SIGNAL_WEIGHTS[s.signal_type] || 0);
            }, 0);

            await supabase.from('affinity_scores').upsert({
                user_id: String(userId),
                author_id: authorId,
                affinity_score: Math.min(1, totalWeight / 200),
                interaction_count: signals?.length || 0,
                last_interaction: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id, author_id' });
        }

        res.json({ success: true, signal: { postId, signalType } });
    } catch (err) {
        console.error('Error tracking signal:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Obtener feed rankeado ───
router.get('/ranked', authMiddleware, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const { limit = 50, offset = 0, filter = 'all' } = req.query;
        const supabase = getDB();

        // Obtener posts con sus value_scores via LEFT JOIN
        let query = supabase
            .from('posts')
            .select('*, post_value_scores(*)')
            .order('created_at', { ascending: false })
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) * 2);

        if (filter === 'image') query = query.eq('type', 'image');
        else if (filter === 'video') query = query.eq('type', 'video');
        else if (filter === 'text') query = query.eq('type', 'text');
        else if (filter === 'following') {
            const { data: follows } = await supabase
                .from('follows')
                .select('following_id')
                .eq('follower_id', userId);
            const followingIds = follows?.map(f => f.following_id) || [];
            if (followingIds.length > 0) query = query.in('author_id', followingIds);
            else return res.json({ success: true, posts: [], hasMore: false });
        }

        const { data: shekaelPosts, error } = await query;
        if (error) throw error;

        // Obtener afinidades del usuario
        const { data: affinities } = await supabase
            .from('affinity_scores')
            .select('author_id, affinity_score')
            .eq('user_id', userId);
        const affinityMap = {};
        (affinities || []).forEach(a => {
            affinityMap[a.author_id] = parseFloat(a.affinity_score) || 0;
        });

        // Obtener intención de compra del usuario
        const purchaseIntents = await getTopPurchaseIntents(userId);
        const purchaseMap = {};
        purchaseIntents.forEach(p => {
            purchaseMap[p.category] = p.score;
        });

        // Marcar vistos en esta sesión
        const seenIds = req.headers['x-seen-ids']
            ? new Set(req.headers['x-seen-ids'].split(','))
            : new Set();

        // Asignar scores
        const scored = (shekaelPosts || []).map(post => {
            const pvs = post.post_value_scores;
            const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 3600000;

            let valueScore = NEW_POST_BOOST / Math.max(1, Math.pow(ageHours, DECAY_POWER));
            let trendingScore = 0;

            if (pvs) {
                const raw = (
                    (pvs.save_count || 0) * 10 +
                    (pvs.share_dm_count || 0) * 8 +
                    (pvs.share_feed_count || 0) * 6 +
                    (pvs.comment_count || 0) * 4 +
                    (pvs.completion_count || 0) * 3 +
                    (pvs.dwell_total_seconds || 0) * (2/30) +
                    (pvs.like_count || 0) * 1 +
                    (pvs.view_count || 0) * 0.1
                );
                valueScore = ageHours > 1 ? raw / Math.pow(ageHours, DECAY_POWER) : raw;
                trendingScore = parseFloat(pvs.trending_score) || 0;
            }

            const affinity = affinityMap[post.author_id] || 0;
            const isFollowing = false;

            // Determinar categoría del post para purchase intent boost
            let postTags = [];
            if (post.video_tags) {
                try {
                    postTags = typeof post.video_tags === 'string' ? JSON.parse(post.video_tags) : post.video_tags;
                } catch { postTags = []; }
            }
            // Mapear tags a categorías de compra y obtener el max score
            let purchaseBoost = 0;
            postTags.forEach(tag => {
                const cat = tagToCategory(tag);
                if (cat && purchaseMap[cat]) {
                    purchaseBoost = Math.max(purchaseBoost, purchaseMap[cat]);
                }
            });

            let rankingScore;
            if (isFollowing) {
                rankingScore = (1 / Math.max(1, ageHours)) * 0.35 + affinity * 0.25 + (valueScore / 100) * 0.25 + purchaseBoost * 0.15;
            } else {
                rankingScore = (valueScore / 100) * 0.4 + (trendingScore / 50) * 0.2 + (1 / Math.max(1, ageHours)) * 0.15 + purchaseBoost * 0.15 + (Math.random() * 0.1);
            }

            return {
                ...post,
                post_value_scores: undefined,
                _score: rankingScore,
                _valueScore: valueScore,
                _trendingScore: trendingScore,
                _affinity: affinity,
                _isFollowing: isFollowing,
                _source: 'shekael',
            };
        });

        // Ordenar: seguidos primero, después descubrimiento
        const followingPosts = scored.filter(p => p._isFollowing).sort((a, b) => b._score - a._score);
        const discoveryPosts = scored.filter(p => !p._isFollowing).sort((a, b) => b._score - a._score);
        let finalPosts = [...followingPosts, ...discoveryPosts];

        // Filtrar vistos
        if (seenIds.size > 0) {
            finalPosts = finalPosts.filter(p => !seenIds.has(String(p.id)));
        }

        const paginated = finalPosts.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
        const hasMore = finalPosts.length > parseInt(offset) + parseInt(limit);

        res.json({ success: true, posts: paginated, hasMore });
    } catch (err) {
        console.error('Error in ranked feed:', err);
        res.status(500).json({ success: false, message: err.message, posts: [], hasMore: false });
    }
});

// ─── Obtener scores específicos ───
router.get('/scores', authMiddleware, async (req, res) => {
    try {
        const { postIds } = req.query;
        if (!postIds) return res.json({ success: true, scores: {} });

        const supabase = getDB();
        const ids = postIds.split(',');

        const { data: rows } = await supabase
            .from('post_value_scores')
            .select('*')
            .in('post_id', ids);

        const scores = {};
        (rows || []).forEach(r => {
            scores[r.post_id] = {
                valueScore: parseFloat(r.value_score) || 0,
                trendingScore: parseFloat(r.trending_score) || 0,
                saves: r.save_count || 0,
                likes: r.like_count || 0,
                views: r.view_count || 0,
            };
        });
        // Rellenar los que no tienen score aún
        ids.forEach(id => {
            if (!scores[id]) {
                scores[id] = { valueScore: 0, trendingScore: 0, saves: 0, likes: 0, views: 0 };
            }
        });

        res.json({ success: true, scores });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Estado del algoritmo (admin) ───
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();

        const { count: signalCount } = await supabase
            .from('engagement_signals')
            .select('*', { count: 'exact', head: true });

        const { count: postCount } = await supabase
            .from('post_value_scores')
            .select('*', { count: 'exact', head: true });

        const { data: topPosts } = await supabase
            .from('post_value_scores')
            .select('post_id, value_score, save_count')
            .order('value_score', { ascending: false })
            .limit(10);

        res.json({
            success: true,
            stats: {
                signalCount: signalCount || 0,
                postCount: postCount || 0,
                topPosts: (topPosts || []).map(p => ({
                    id: p.post_id,
                    valueScore: parseFloat(p.value_score) || 0,
                    saves: p.save_count || 0,
                })),
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Forzar derivación de intereses (admin) ───
router.post('/derive-interests', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await deriveAllUserInterests();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Recalcular purchase intent (admin) ───
router.post('/recalc-purchase-intent', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await recalcAllPurchaseIntents();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
