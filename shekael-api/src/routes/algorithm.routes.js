import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router({ strict: false });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../../data/algorithm-data.json');

// ─── Configuración de pesos ───
const WEIGHTS = {
    save: 10,
    share_dm: 8,
    share_feed: 6,
    comment: 4,
    completion: 3,
    dwell_30s: 2,
    like: 1,
    view: 0.1,
};

const DECAY_POWER = 0.3; // Decaimiento temporal
const NEW_POST_BOOST = 5; // Boost inicial para posts sin señales (exploración)

// ─── Helpers JSON ───
function readData() {
    try {
        if (fs.existsSync(DATA_PATH)) {
            return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
        }
    } catch (_) {}
    return { signals: [], affinity: {}, postScores: {} };
}

function saveData(data) {
    const dir = path.dirname(DATA_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Señales ponderadas ───
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

        const data = readData();

        // Guardar señal individual
        data.signals.push({
            userId: String(userId),
            postId: String(postId),
            type: signalType,
            source: source,
            timestamp: Date.now(),
        });

        // Limitar señales en memoria (máx 100k, limpiar viejas)
        if (data.signals.length > 100000) {
            data.signals = data.signals.slice(-50000);
        }

        // Actualizar postScores agregativos
        if (!data.postScores[postId]) {
            data.postScores[postId] = { saves: 0, share_dm: 0, share_feed: 0, comments: 0, completions: 0, dwell_30s: 0, dwell_5s: 0, likes: 0, views: 0, firstSeen: Date.now() };
        }

        const ps = data.postScores[postId];
        if (signalType === 'save') ps.saves++;
        else if (signalType === 'share_dm') ps.share_dm++;
        else if (signalType === 'share_feed') ps.share_feed++;
        else if (signalType === 'comment') ps.comments++;
        else if (signalType === 'completion') ps.completions++;
        else if (signalType === 'dwell_30s') ps.dwell_30s++;
        else if (signalType === 'dwell_5s') ps.dwell_5s++;
        else if (signalType === 'like') ps.likes++;
        else if (signalType === 'view') ps.views++;

        // Recalcular value_score
        const ageHours = (Date.now() - ps.firstSeen) / 3600000;
        const rawScore = (
            ps.saves * 10 +
            ps.share_dm * 8 +
            ps.share_feed * 6 +
            ps.comments * 4 +
            ps.completions * 3 +
            ps.dwell_30s * 2 +
            ps.dwell_5s * 0.5 +
            ps.likes * 1 +
            ps.views * 0.1
        );
        ps.valueScore = ageHours > 1 ? rawScore / Math.pow(ageHours, DECAY_POWER) : rawScore;

        // Trending score: solo señales de las últimas 24h
        const oneDayAgo = Date.now() - 86400000;
        const recentSignals = data.signals.filter(s =>
            String(s.postId) === String(postId) && s.timestamp > oneDayAgo
        );
        ps.trendingScore = recentSignals.reduce((sum, s) => sum + (SIGNAL_WEIGHTS[s.type] || 0), 0);

        // Actualizar afinidad usuario→autor (extraer author_id del postId si es fed__)
        const authorId = postId.startsWith('fed__')
            ? postId.split('__').slice(0, 2).join('__') // fed__instancia
            : null; // Shekael posts: el autor se resuelve en el feed

        if (authorId) {
            const key = `${userId}__${authorId}`;
            if (!data.affinity[key]) {
                data.affinity[key] = { score: 0, count: 0, lastInteraction: 0 };
            }
            const af = data.affinity[key];
            af.count++;
            af.lastInteraction = Date.now();
            // Affinity basada en weighted signals hacia ese autor
            const authorSignals = data.signals.filter(s =>
                String(s.userId) === String(userId) &&
                String(s.postId).startsWith(authorId)
            );
            const totalWeight = authorSignals.reduce((sum, s) => sum + (SIGNAL_WEIGHTS[s.type] || 0), 0);
            af.score = Math.min(1, totalWeight / 200);
        }

        saveData(data);

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
        const { limit = 50, offset = 0, filter = 'all', includeFediverse = 'true' } = req.query;
        const data = readData();

        // Obtener posts del feed normal (para tener la lista base)
        const getDB = (await import('../database/db.js')).default;
        const supabase = getDB();

        let query = supabase
            .from('posts')
            .select('*')
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

        // Marcar vistos en esta sesión (request)
        const seenIds = req.headers['x-seen-ids']
            ? new Set(req.headers['x-seen-ids'].split(','))
            : new Set();

        // Asignar scores a posts de Shekael
        const scored = (shekaelPosts || []).map(post => {
            const ps = data.postScores[String(post.id)];
            const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 3600000;

            // Calcular score base del post
            let valueScore = ps ? ps.valueScore : NEW_POST_BOOST / Math.max(1, Math.pow(ageHours, DECAY_POWER));
            let trendingScore = ps ? (ps.trendingScore || 0) : 0;

            // Calcular afinidad
            const affKey = `${userId}__${post.author_id}`;
            const aff = data.affinity[affKey];
            const affinity = aff ? aff.score : 0;

            // Seguido?
            const isFollowing = post.isFollowing || false;

            // Score final
            let rankingScore;
            if (isFollowing) {
                // Seguidos: fresh + affinity + value
                rankingScore = (1 / Math.max(1, ageHours)) * 0.4 + affinity * 0.3 + (valueScore / 100) * 0.3;
            } else {
                // No seguidos: value + trending
                rankingScore = (valueScore / 100) * 0.5 + (trendingScore / 50) * 0.25 + (1 / Math.max(1, ageHours)) * 0.15 + (Math.random() * 0.1);
            }

            return {
                ...post,
                _score: rankingScore,
                _valueScore: valueScore,
                _trendingScore: trendingScore,
                _affinity: affinity,
                _isFollowing: isFollowing,
                _source: 'shekael',
            };
        });

        // Ordenar: seguidos primero por score, después no-seguidos
        const followingPosts = scored.filter(p => p._isFollowing).sort((a, b) => b._score - a._score);
        const discoveryPosts = scored.filter(p => !p._isFollowing).sort((a, b) => b._score - a._score);

        let finalPosts = [...followingPosts, ...discoveryPosts];

        // Filtrar vistos
        if (seenIds.size > 0) {
            finalPosts = finalPosts.filter(p => !seenIds.has(String(p.id)));
        }

        // Aplicar limit/offset
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

        const data = readData();
        const ids = postIds.split(',');
        const scores = {};
        ids.forEach(id => {
            const ps = data.postScores[String(id)];
            scores[id] = ps || { valueScore: 0, trendingScore: 0, saves: 0, likes: 0, views: 0 };
        });

        res.json({ success: true, scores });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Estado del algoritmo (admin) ───
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const data = readData();
        const signalCount = data.signals.length;
        const postCount = Object.keys(data.postScores).length;
        const topPosts = Object.entries(data.postScores)
            .sort(([, a], [, b]) => (b.valueScore || 0) - (a.valueScore || 0))
            .slice(0, 10)
            .map(([id, s]) => ({ id, valueScore: s.valueScore || 0, saves: s.saves || 0 }));

        res.json({ success: true, stats: { signalCount, postCount, topPosts } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
