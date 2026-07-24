import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getFederatedTimeline,
    getFederatedTrending,
    searchFediverse,
    searchFediverseAccounts,
    getAccountTimeline,
    getFediverseAccountProfile,
    getStatusWithContext,
    getInstanceInfo,
    INSTANCES
} from '../services/federation.js';

const router = Router({ strict: false });

// Sin rate limit — las instancias externas ya tienen sus propios límites

/**
 * GET /federation/timeline
 * Feed global del Fediverso (combinado de varias instancias)
 * Query: ?limit=20&instance=mastodon.social
 */
router.get('/timeline', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);
        const instances = req.query.instance ? [req.query.instance] : null;
        const lang = req.query.lang || 'es';

        const posts = await getFederatedTimeline({ limit, offset, instances, lang });

        res.json({
            success: true,
            posts,
            total: posts.length,
            offset,
            lang,
            hasMore: posts.length >= limit,
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

        const accounts = type === 'accounts' || type === 'all'
            ? await searchFediverseAccounts(query, { limit })
            : [];
        const posts = type === 'posts' || type === 'all'
            ? await searchFediverse(query, { limit })
            : [];
        res.json({ success: true, accounts, posts, total: accounts.length + posts.length, source: 'fediverso' });
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

/**
 * GET /federation/account-profile/:handle
 * Perfil completo de un usuario del Fediverso (info + posts)
 */
router.get('/account-profile/:handle', authMiddleware, async (req, res) => {
    try {
        const handle = req.params.handle;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const result = await getFediverseAccountProfile(handle, { limit });
        if (!result) {
            return res.status(404).json({ success: false, message: 'Perfil no encontrado en el Fediverso' });
        }
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[Federation] Error fetching account profile:', error.message);
        res.status(500).json({ success: false, message: 'Error al obtener perfil' });
    }
});

/**
 * GET /federation/status/:instance/:id
 * Obtener un post individual + sus respuestas (context)
 */
router.get('/status/:instance/:id', async (req, res) => {
    try {
        const instanceUrl = `https://${req.params.instance}`;
        const statusId = req.params.id;
        const result = await getStatusWithContext(instanceUrl, statusId);
        if (!result) {
            return res.status(404).json({ message: 'Post no encontrado en el Fediverso' });
        }
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[Federation] Error fetching status:', error.message);
        res.status(500).json({ message: 'Error al obtener el post' });
    }
});

export default router;
