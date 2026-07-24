import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import rateLimit from 'express-rate-limit';
import {
    getFederatedTimeline,
    getFederatedTrending,
    searchFediverse,
    searchFediverseAccounts,
    getAccountTimeline,
    getInstanceInfo,
    INSTANCES
} from '../services/federation.js';

const router = Router({ strict: false });

// Rate limit: 30 requests/min para no abusar de APIs externas
const fedLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { message: 'Demasiadas solicitudes. Espera un momento.' }
});

router.use(fedLimiter);

/**
 * GET /federation/timeline
 * Feed global del Fediverso (combinado de varias instancias)
 * Query: ?limit=20&instance=mastodon.social
 */
router.get('/timeline', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const instances = req.query.instance ? [req.query.instance] : null;

        const posts = await getFederatedTimeline({ limit, instances });

        res.json({
            success: true,
            posts,
            total: posts.length,
            source: 'fediverso',
            cached: true // Siemruega cacheado (TTL 15 min)
        });
    } catch (error) {
        console.error('[Federation] Error in timeline:', error.message);
        res.status(500).json({ message: 'Error al obtener timeline federado' });
    }
});

/**
 * GET /federation/trending
 * Tendencias actuales en el Fediverso
 */
router.get('/trending', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const posts = await getFederatedTrending({ limit });

        res.json({ success: true, posts, total: posts.length, source: 'fediverso' });
    } catch (error) {
        console.error('[Federation] Error in trending:', error.message);
        res.status(500).json({ message: 'Error al obtener tendencias' });
    }
});

/**
 * GET /federation/search
 * Buscar en el Fediverso
 * Query: ?q=query&type=posts|accounts&limit=20
 */
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const query = (req.query.q || '').trim();
        const type = req.query.type || 'posts';
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);

        if (!query) {
            return res.status(400).json({ message: 'Se requiere un término de búsqueda' });
        }

        if (type === 'accounts') {
            const accounts = await searchFediverseAccounts(query, { limit });
            return res.json({ success: true, accounts, total: accounts.length, source: 'fediverso' });
        }

        const posts = await searchFediverse(query, { limit });
        res.json({ success: true, posts, total: posts.length, source: 'fediverso' });
    } catch (error) {
        console.error('[Federation] Error in search:', error.message);
        res.status(500).json({ message: 'Error al buscar en el Fediverso' });
    }
});

/**
 * GET /federation/instances
 * Lista de instancias disponibles
 */
router.get('/instances', async (req, res) => {
    res.json({
        instances: INSTANCES.map(i => ({
            url: i.url,
            name: i.name,
            type: i.type,
        }))
    });
});

/**
 * GET /federation/instance/:instanceUrl
 * Info de una instancia específica
 */
router.get('/instance/:instanceUrl', authMiddleware, async (req, res) => {
    try {
        const instanceUrl = `https://${req.params.instanceUrl}`;
        const info = await getInstanceInfo(instanceUrl);
        res.json({ success: true, instance: info });
    } catch (error) {
        console.error('[Federation] Error fetching instance:', error.message);
        res.status(500).json({ message: 'Error al obtener información de la instancia' });
    }
});

/**
 * GET /federation/account/:handle
 * Timeline de un perfil específico del Fediverso
 * Handle: @usuario@instancia.social
 */
router.get('/account/:handle', authMiddleware, async (req, res) => {
    try {
        const handle = req.params.handle;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const posts = await getAccountTimeline(handle, { limit });
        res.json({ success: true, posts, total: posts.length, handle });
    } catch (error) {
        console.error('[Federation] Error fetching account:', error.message);
        res.status(500).json({ message: 'Error al obtener timeline del perfil' });
    }
});

export default router;
