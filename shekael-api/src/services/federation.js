/**
 * Federation Service — ActivityPub/Fediverso
 * Lee timelines públicas de Mastodon/Pixelfed para llenar el feed de Shekael.
 * Cache en memoria con TTL. Sin dependencia de Supabase.
 */
const INSTANCES = [
    { url: 'https://mastodon.world', name: 'Mastodon World', type: 'mastodon', token: 'xUTItO8rfaa6NegZE0G7FYYNNN3N7g5UGCR1lolGGxg' },
    { url: 'https://mastodonapp.uk', name: 'Mastodon UK', type: 'mastodon', token: 'Cnrq4y7sfmWkb-Fbmt_P4Fy5Vh4T8tNaxSFLj3KOSIA' },
    { url: 'https://mastodon.art', name: 'Mastodon Art', type: 'mastodon', token: 'gRl92tSRIRNCmQIdiZ36N73MLXJ-kBCth23ZftcDXac' },
    { url: 'https://fosstodon.org', name: 'Fosstodon', type: 'mastodon', token: 'p6qYbgY0A-JKE7S8WOs9wRgRmGkA1f1TzCwKCAZHL8s' },
    { url: 'https://hachyderm.io', name: 'Hachyderm', type: 'mastodon', token: 'bghDmmFUyeSiBiG6a3TtgAobCDlJYm_PPAt1i16eXMo' },
];

const CACHE_TTL = 15 * 60 * 1000; // 15 min
const cache = new Map(); // key -> { data, timestamp }

function isExpired(entry) {
    return Date.now() - entry.timestamp > CACHE_TTL;
}

function getCache(key) {
    const entry = cache.get(key);
    if (entry && !isExpired(entry)) return entry.data;
    return null;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch con timeout
 */
async function fetchWithTimeout(url, options = {}, timeout = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

/**
 * Normalizar un post de Mastodon/Pixelfed a formato Shekael
 */
function normalizePost(status, instance) {
    const account = status.account || {};
    const media = (status.media_attachments || []).map(m => ({
        url: m.url,
        preview_url: m.preview_url,
        type: m.type, // image, video, gifv
        description: m.description || ''
    }));

    // Extraer primera imagen/video
    const firstMedia = media[0] || null;

    // Determinar tipo de contenido
    let contentType = 'text';
    if (firstMedia?.type === 'image') contentType = 'image';
    else if (firstMedia?.type === 'video' || firstMedia?.type === 'gifv') contentType = 'video';

    return {
        id: status.id,
        uri: status.uri,
        url: status.url || status.uri,
        instance: instance.name,
        instanceUrl: instance.url,
        createdAt: status.created_at,
        content: status.content || '', // HTML
        contentText: stripHtml(status.content || ''),
        contentType,
        media,
        firstMedia,
        author: {
            handle: `@${account.acct}@${instance.name.toLowerCase().replace(/\s/g, '')}`,
            username: account.username,
            displayName: account.display_name || account.username,
            avatar: account.avatar_static || account.avatar,
            url: account.url,
        },
        stats: {
            likes: status.favourites_count || 0,
            shares: status.reblogs_count || 0,
            replies: status.replies_count || 0,
        },
        sensitive: status.sensitive || false,
        spoilerText: status.spoiler_text || '',
        language: status.language || 'en',
        tags: (status.tags || []).map(t => t.name),
    };
}

/**
 * Stripear HTML manteniendo saltos de línea
 */
function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<p>/gi, '')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .trim();
}

/**
 * Obtener timeline pública de una instancia
 */
async function fetchInstanceTimeline(instance, limit = 20) {
    const cacheKey = `timeline:${instance.url}:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const endpoint = instance.type === 'pixelfed'
        ? `${instance.url}/api/v1/timelines/public?local=true&limit=${limit}`
        : `${instance.url}/api/v1/timelines/public?local=true&limit=${limit}`;

    try {
        const headers = {};
        if (instance.token) headers['Authorization'] = 'Bearer ' + instance.token;
        const data = await fetchWithTimeout(endpoint, { headers }, 8000);
        const statuses = Array.isArray(data) ? data : [];

        const posts = statuses
            .filter(s => !s.sensitive)
            .slice(0, limit)
            .map(s => normalizePost(s, instance));

        setCache(cacheKey, posts);
        return posts;
    } catch (e) {
        console.error(`[Federation] Error fetching ${instance.name}: ${e.message}`);
        return [];
    }
}

/**
 * Obtener timeline combinada de varias instancias
 * @param {Object} opts
 * @param {number} opts.limit - Cuántos devolver
 * @param {string[]} opts.instances - Instancias específicas
 * @param {string} opts.lang - Idioma a priorizar (es, en, etc)
 * @param {number} opts.offset - Saltar los primeros N posts (paginación)
 */
export async function getFederatedTimeline({ limit = 20, instances = null, lang = null, offset = 0 } = {}) {
    const targets = instances
        ? INSTANCES.filter(i => instances.includes(i.url))
        : INSTANCES;

    // Fetch suficiente para cubrir offset + limit
    const fetchPerInstance = Math.ceil((limit + offset) / targets.length) + 5;

    const results = await Promise.allSettled(
        targets.map(inst => fetchInstanceTimeline(inst, fetchPerInstance))
    );

    let posts = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            posts = posts.concat(result.value);
        }
    }

    // División 80/20 por idioma:
    // - 80% en el idioma del usuario
    // - 20% en otros idiomas (descubrimiento cross-cultural)
    if (lang) {
        const userLang = lang.toLowerCase().split('-')[0]; // 'es-MX' → 'es'

        // Separar en dos pools
        const langPosts = [];
        const otherPosts = [];

        for (const p of posts) {
            const pLang = (p.language || '').toLowerCase().split('-')[0];
            if (pLang === userLang) {
                langPosts.push(p);
            } else {
                otherPosts.push(p);
            }
        }

        // Ordenar cada pool por fecha (reciente primero)
        langPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        otherPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Mezclar: por cada 4 posts en idioma del usuario, 1 de otro idioma
        const mixed = [];
        let li = 0, oi = 0;
        while (li < langPosts.length || oi < otherPosts.length) {
            for (let i = 0; i < 4 && li < langPosts.length; i++, li++) {
                mixed.push(langPosts[li]);
            }
            if (oi < otherPosts.length) {
                mixed.push(otherPosts[oi]);
                oi++;
            }
        }

        posts = mixed;
    } else {
        // Sin filtro de idioma: solo ordenar por fecha
        posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Paginar: saltar offset, tomar limit
    return posts.slice(offset, offset + limit);
}

/**
 * Obtener tendencias del Fediverso
 */
export async function getFederatedTrending({ limit = 20 } = {}) {
    const results = [];

    for (const inst of INSTANCES.slice(0, 2)) { // Solo primeras 2 instancias
        const cacheKey = `trending:${inst.url}`;
        const cached = getCache(cacheKey);
        if (cached) {
            results.push(...cached);
            continue;
        }

        try {
            const endpoint = `${inst.url}/api/v1/trends/statuses?limit=${limit}`;
            const headers = {};
            if (inst.token) headers['Authorization'] = 'Bearer ' + inst.token;
            const data = await fetchWithTimeout(endpoint, { headers }, 8000);
            const posts = (data || []).map(s => normalizePost(s, inst));
            setCache(cacheKey, posts);
            results.push(...posts);
        } catch (e) {
            console.error(`[Federation] Error fetching trending from ${inst.name}: ${e.message}`);
        }
    }

    // Ordenar por popularidad
    results.sort((a, b) => (b.stats.likes + b.stats.shares) - (a.stats.likes + a.stats.shares));
    return results.slice(0, limit);
}

/**
 * Buscar en el Fediverso
 */
export async function searchFediverse(query, { limit = 20 } = {}) {
    if (!query || query.length < 2) return [];

    const cacheKey = `search:${query}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const results = [];

    for (const inst of INSTANCES.slice(0, 3)) {
        try {
            const endpoint = `${inst.url}/api/v2/search?q=${encodeURIComponent(query)}&type=statuses&limit=${Math.ceil(limit / 3)}`;
            const headers = {};
            if (inst.token) headers['Authorization'] = 'Bearer ' + inst.token;
            const data = await fetchWithTimeout(endpoint, { headers }, 8000);
            const statuses = data?.statuses || [];
            const posts = statuses
                .filter(s => !s.sensitive)
                .map(s => normalizePost(s, inst));
            results.push(...posts);
        } catch (e) {
            // Silencioso — una instancia caída no mata la búsqueda
        }
    }

    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const finalResults = results.slice(0, limit);

    setCache(cacheKey, finalResults);
    return finalResults;
}

/**
 * Obtener información de una instancia
 */
export async function getInstanceInfo(instanceUrl) {
    const cacheKey = `instance:${instanceUrl}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
        const data = await fetchWithTimeout(`${instanceUrl}/api/v1/instance`, {}, 5000);
        const info = {
            title: data.title,
            description: data.description || '',
            version: data.version,
            thumbnail: data.thumbnail || data.icon?.url || null,
            registrations: data.registrations,
            stats: data.stats || {},
            contact: data.contact_account?.username || null,
            rules: (data.rules || []).map(r => r.text),
        };
        setCache(cacheKey, info);
        return info;
    } catch (e) {
        return { title: instanceUrl, error: e.message };
    }
}

/**
 * Buscar perfiles/usuarios en el Fediverso
 */
export async function searchFediverseAccounts(query, { limit = 10 } = {}) {
    if (!query || query.length < 2) return [];
    const cacheKey = `accounts:${query}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const results = [];
    for (const inst of INSTANCES.slice(0, 3)) {
        try {
            const endpoint = `${inst.url}/api/v1/accounts/search?q=${encodeURIComponent(query)}&limit=${limit}`;
            const headers = {};
            if (inst.token) headers['Authorization'] = 'Bearer ' + inst.token;
            const data = await fetchWithTimeout(endpoint, { headers }, 8000);
            const accounts = (data || []).slice(0, limit).map(acc => ({
                id: acc.id,
                handle: `@${acc.acct}@${inst.name.toLowerCase().replace(/\s/g, '')}`,
                username: acc.username,
                displayName: acc.display_name || acc.username,
                avatar: acc.avatar_static || acc.avatar,
                header: acc.header_static || acc.header,
                bio: stripHtml(acc.note || ''),
                followersCount: acc.followers_count || 0,
                followingCount: acc.following_count || 0,
                postsCount: acc.statuses_count || 0,
                url: acc.url,
                instance: inst.name,
                isBot: acc.bot || false,
                isLocked: acc.locked || false,
                createdAt: acc.created_at,
            }));
            results.push(...accounts);
        } catch (_) {}
    }

    results.sort((a, b) => b.followersCount - a.followersCount);
    const final = results.slice(0, limit);
    setCache(cacheKey, final);
    return final;
}

/**
 * Obtener posts de un perfil específico del Fediverso
 */
export async function getAccountTimeline(accountHandle, { limit = 20 } = {}) {
    // Extraer username e instancia de un handle tipo @user@instance.social
    const match = accountHandle.match(/^@?(\w+)@(.+)$/);
    if (!match) return [];

    const username = match[1];
    const instanceDomain = match[2];
    const instance = INSTANCES.find(i => i.url.includes(instanceDomain));
    if (!instance) return [];

    const cacheKey = `account_timeline:${accountHandle}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
        // Primero buscar el account ID
        const searchUrl = `${instance.url}/api/v1/accounts/search?q=${username}&limit=1`;
        const searchData = await fetchWithTimeout(searchUrl, {}, 5000);
        const account = Array.isArray(searchData) ? searchData[0] : null;
        if (!account) return [];

        // Luego obtener su timeline
        const timelineUrl = `${instance.url}/api/v1/accounts/${account.id}/statuses?limit=${limit}`;
        const data = await fetchWithTimeout(timelineUrl, {}, 8000);
        const posts = (data || []).map(s => normalizePost(s, instance));
        setCache(cacheKey, posts);
        return posts;
    } catch (e) {
        console.error(`[Federation] Error fetching account timeline: ${e.message}`);
        return [];
    }
}

/**
 * Obtener un status individual + su contexto (replies) del Fediverso
 */
export async function getStatusWithContext(instanceUrl, statusId) {
    const instance = INSTANCES.find(i => i.url === instanceUrl);
    if (!instance) {
        // Si no está en nuestra config, intentar sin token
        const headers = {};
        try {
            const [statusData, ctxData] = await Promise.allSettled([
                fetchWithTimeout(`${instanceUrl}/api/v1/statuses/${statusId}`, {}, 8000),
                fetchWithTimeout(`${instanceUrl}/api/v1/statuses/${statusId}/context`, {}, 8000),
            ]);
            const status = statusData.status === 'fulfilled' ? statusData.value : null;
            const context = ctxData.status === 'fulfilled' ? ctxData.value : { ancestors: [], descendants: [] };
            if (!status) return null;
            return {
                post: normalizePost(status, { url: instanceUrl, name: instanceUrl.replace('https://', '') }),
                replies: (context.descendants || []).filter(s => !s.sensitive).map(s => normalizePost(s, { url: instanceUrl, name: instanceUrl.replace('https://', '') })),
            };
        } catch (e) {
            console.error(`[Federation] Error fetching status context: ${e.message}`);
            return null;
        }
    }

    const cacheKey = `status:${instanceUrl}:${statusId}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
        const headers = {};
        if (instance.token) headers['Authorization'] = 'Bearer ' + instance.token;

        const [statusData, ctxData] = await Promise.allSettled([
            fetchWithTimeout(`${instance.url}/api/v1/statuses/${statusId}`, { headers }, 8000),
            fetchWithTimeout(`${instance.url}/api/v1/statuses/${statusId}/context`, { headers }, 8000),
        ]);

        const status = statusData.status === 'fulfilled' ? statusData.value : null;
        const context = ctxData.status === 'fulfilled' ? ctxData.value : { ancestors: [], descendants: [] };

        if (!status) return null;

        const result = {
            post: normalizePost(status, instance),
            replies: (context.descendants || []).filter(s => !s.sensitive).map(s => normalizePost(s, instance)),
        };

        setCache(cacheKey, result);
        return result;
    } catch (e) {
        console.error(`[Federation] Error fetching status context: ${e.message}`);
        return null;
    }
}

export { INSTANCES };
