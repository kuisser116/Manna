/**
 * Federation Service — ActivityPub/Fediverso
 * Lee timelines públicas de Mastodon/Pixelfed para llenar el feed de Shekael.
 * Cache en memoria con TTL. Sin dependencia de Supabase.
 */
const INSTANCES = [
    { url: 'https://mastodon.social', name: 'Mastodon Social', type: 'mastodon' },
    { url: 'https://mastodon.world', name: 'Mastodon World', type: 'mastodon' },
    { url: 'https://pixelfed.social', name: 'Pixelfed Social', type: 'pixelfed' },
    { url: 'https://mastodon.online', name: 'Mastodon Online', type: 'mastodon' },
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
        const data = await fetchWithTimeout(endpoint, {}, 8000);
        // Si pixelfed devuelve estructura diferente, entrarla
        const statuses = Array.isArray(data) ? data : [];

        const posts = statuses
            .filter(s => !s.sensitive) // Saltar contenido sensible
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
 */
export async function getFederatedTimeline({ limit = 20, instances = null } = {}) {
    const targets = instances
        ? INSTANCES.filter(i => instances.includes(i.url))
        : INSTANCES;

    const results = await Promise.allSettled(
        targets.map(inst => fetchInstanceTimeline(inst, Math.ceil(limit / targets.length)))
    );

    let posts = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            posts = posts.concat(result.value);
        }
    }

    // Ordenar por fecha (más reciente primero)
    posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Limitar al total solicitado
    return posts.slice(0, limit);
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
            const data = await fetchWithTimeout(endpoint, {}, 8000);
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
            const data = await fetchWithTimeout(endpoint, {}, 8000);
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
            const data = await fetchWithTimeout(endpoint, {}, 8000);
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

export { INSTANCES };
