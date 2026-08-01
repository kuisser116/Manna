import getDB from '../database/db.js';

// Categorías de interés disponibles
const INTEREST_CATEGORIES = ['tech', 'faith', 'sports', 'art', 'music', 'food', 'travel', 'fashion', 'gaming', 'education'];

// Mapa de señal → incremento de score para cada categoría
// Se basa en la actividad del usuario: si guarda posts etiquetados con ciertos tags,
// incrementa el score de esa categoría.
const SIGNAL_SCORE = {
    save: 10,
    share_dm: 8,
    share_feed: 6,
    comment: 4,
    completion: 3,
    dwell_30s: 2,
    like: 1,
    view: 0.1,
};

// Señales mínimas requeridas para considerar una categoría como "interés"
const MIN_SIGNALS_FOR_INTEREST = 3;
// Score mínimo para considerar una categoría activa
const MIN_SCORE_FOR_INTEREST = 5;

/**
 * Deriva intereses de un usuario basado en sus engagement_signals de los últimos 7 días.
 * Analiza los posts con los que interactuó y los tags/categorías de esos posts.
 * 
 * @param {string} userId - ID del usuario
 * @returns {Promise<string[]>} - Lista de categorías de interés
 */
export async function deriveUserInterests(userId) {
    const supabase = getDB();

    // Obtener señales de los últimos 7 días
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: signals, error } = await supabase
        .from('engagement_signals')
        .select('post_id, signal_type')
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo);

    if (error || !signals || signals.length === 0) {
        return [];
    }

    // Obtener posts relacionados para conocer su categoría/content
    const postIds = [...new Set(signals.map(s => s.post_id))].filter(id => !id.startsWith('fed__'));
    
    if (postIds.length === 0) return [];

    const { data: posts } = await supabase
        .from('posts')
        .select('id, type, video_tags')
        .in('id', postIds);

    if (!posts) return [];

    // Construir mapa de tags por post
    const postTags = {};
    posts.forEach(p => {
        let tags = [];
        if (p.video_tags) {
            try {
                tags = typeof p.video_tags === 'string' ? JSON.parse(p.video_tags) : p.video_tags;
            } catch {
                tags = String(p.video_tags).split(',').map(t => t.trim().toLowerCase());
            }
        }
        // Inferir categoría del tipo de contenido
        if (p.type === 'image') tags.push('art');
        postTags[p.id] = tags;
    });

    // Calcular score por categoría
    const categoryScores = {};
    INTEREST_CATEGORIES.forEach(c => { categoryScores[c] = 0; });

    signals.forEach(signal => {
        const weight = SIGNAL_SCORE[signal.signal_type] || 0;
        const tags = postTags[signal.post_id] || [];
        
        tags.forEach(tag => {
            // Mapear tags comunes a categorías
            const category = mapTagToCategory(tag);
            if (category) {
                categoryScores[category] += weight;
            }
        });
    });

    // Determinar intereses activos
    const interests = [];
    for (const [category, score] of Object.entries(categoryScores)) {
        if (score >= MIN_SCORE_FOR_INTEREST) {
            interests.push(category);
        }
    }

    return interests;
}

/**
 * Deriva intereses para TODOS los usuarios activos.
 * Para ejecutar como cron diario.
 */
export async function deriveAllUserInterests() {
    const supabase = getDB();

    // Obtener usuarios que tuvieron actividad en los últimos 7 días
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: activeUsers } = await supabase
        .from('engagement_signals')
        .select('user_id')
        .gte('created_at', sevenDaysAgo)
        .limit(1000);

    if (!activeUsers) return { processed: 0 };

    const userIds = [...new Set(activeUsers.map(u => u.user_id))];
    let processed = 0;

    for (const userId of userIds) {
        try {
            const interests = await deriveUserInterests(userId);
            if (interests.length > 0) {
                await supabase
                    .from('users')
                    .update({ interest_categories: JSON.stringify(interests) })
                    .eq('id', userId);
                processed++;
            }
        } catch (err) {
            console.error(`Error deriving interests for user ${userId}:`, err.message);
        }
    }

    return { processed, total: userIds.length };
}

/**
 * Mapea un tag a una categoría de interés.
 */
function mapTagToCategory(tag) {
    if (!tag) return null;
    const t = tag.toLowerCase().trim();

    const map = {
        'tech': 'tech', 'technology': 'tech', 'programming': 'tech', 'coding': 'tech',
        'software': 'tech', 'ai': 'tech', 'computer': 'tech', 'startup': 'tech',
        'faith': 'faith', 'spiritual': 'faith', 'religion': 'faith', 'bible': 'faith',
        'prayer': 'faith', 'god': 'faith', 'church': 'faith',
        'sports': 'sports', 'sport': 'sports', 'futbol': 'sports', 'soccer': 'sports',
        'basketball': 'sports', 'football': 'sports', 'fitness': 'sports',
        'art': 'art', 'arte': 'art', 'design': 'art', 'dibujo': 'art', 'painting': 'art',
        'photography': 'art', 'fotografia': 'art',
        'music': 'music', 'musica': 'music', 'song': 'music', 'cancion': 'music',
        'instrument': 'music', 'band': 'music',
        'food': 'food', 'comida': 'food', 'cocina': 'food', 'cooking': 'food',
        'recipe': 'food', 'restaurant': 'food', 'tacos': 'food',
        'travel': 'travel', 'viaje': 'travel', 'traveling': 'travel', 'viajes': 'travel',
        'adventure': 'travel', 'aventura': 'travel',
        'fashion': 'fashion', 'moda': 'fashion', 'style': 'fashion', 'outfit': 'fashion',
        'clothes': 'fashion',
        'gaming': 'gaming', 'game': 'gaming', 'games': 'gaming', 'videogames': 'gaming',
        'videojuegos': 'gaming', 'minecraft': 'gaming', 'gamer': 'gaming',
        'education': 'education', 'educacion': 'education', 'learning': 'education',
        'aprender': 'education', 'study': 'education', 'course': 'education',
    };

    return map[t] || null;
}

export { INTEREST_CATEGORIES };
