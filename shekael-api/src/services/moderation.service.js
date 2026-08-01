/**
 * Moderación mínima — libertad de expresión con límites claros.
 * 
 * Filosofía Shekael:
 * - No censuramos temas sensibles. La conciencia se crea hablando, no callando.
 * - Solo bloqueamos lo ilegal o lo que daña directamente a otros.
 * - El contenido controversial tiene espacio aquí — la comunidad decide con supports y likes.
 * - Si algo cruza la línea, los usuarios reportan y se revisa manualmente.
 * - Detección NSFW por imagen se hace desde el frontend con nsfwjs (TensorFlow.js).
 */

const ILLEGAL_PATTERNS = [
    // — Explotación infantil y trata —
    /(abuso\s+sexual\s+(infantil|menor|niñ[ao]|menore?))|(cp\s+child|pornograf[ií]a\s+infantil|grooming)/i,
    /(trata\s+de\s+personas|trata\s+blanca|explotaci[oó]n\s+(sexual|infantil|menore?))/i,

    // — Venta de drogas, armas, órganos, personas —
    /(vendo?\s*(droga|arma|coca[ií]na|metanfetamina|hero[ií]na|fentanilo|éxtasis|marihuana.*(venta|env[ií]o|precio)))/i,
    /(venta\s+de\s+(droga|arma|[oó]rganos|personas|niñ[oa]|menores))/i,
    /(compro?\s*([oó]rganos|personas|niñ[oa]))/i,
    /(enlace\s*de\s*pago.*(droga|arma|coca))/i,

    // — Apología del delito / incitación a la violencia —
    /(incitaci[oó]n\s+a\s+la\s+violencia|apología\s+del\s+delito|llamado\s+a\s+(matar|asesinar|violar))/i,
    /(amenaza\s+de\s+(muerte|violaci[oó]n|atentado|bomba))/i,
    /(atentado.*(planear|organizar|coordin[ae]))/i,

    // — Terrorismo —
    /(planear\s+un\s+ataque|fabricar\s+explosivos|reclutar\s+para\s+terrorismo)/i,
    /(yihad\s+(armada|violenta)|célula\s+terrorista)/i,

    // — Discriminación (ilegal en México) —
    /(superioridad\s+(racial|étnica)|limpieza\s+(racial|étnica)|genocidio)/i,
    /(odio\s+(racial|étnico|religioso|nacional))/i,

    // — Estafas y fraudes —
    /(esquema\s+ponzi|estafa\s+piramidal|esquema\s+piramidal|inversi[oó]n.*(garantizada|segura).*rendimiento)/i,
    /(phishing|robo\s+de\s+identidad|suplantaci[oó]n\s+de\s+identidad)/i,

    // — Spam masivo —
    /\b(spam|clickbait|gana.*dinero.*f[áa]cil|trabajo.*desde.*casa.*(gana|millones))/i,
];

const SPAM_WINDOW_MS = 15 * 1000; // 15 segundos entre posts

const lastPostCache = new Map();

/**
 * Helper: cede el event loop cada N iteraciones para no bloquear
 */
function yieldLoop(iterated, every = 5) {
    if (iterated % every === 0) {
        return new Promise(resolve => setImmediate(resolve));
    }
    return;
}

/**
 * Analiza contenido con reglas mínimas.
 * @param {string} content - Contenido a analizar
 * @param {string} type - Tipo de contenido (micro-text, image, video)
 * @param {string|null} textContent - Texto alternativo (para imágenes/videos con caption)
 * @param {string|null} userId - ID del usuario (para spam check)
 * @param {{ nsfwResult?: string, nsfwConfidence?: number }} [imageCheck] - Resultado de NSFWJS del frontend
 * @returns {Promise<{ verdict: string, confidence: number, reason: string }>}
 */
export async function analyzeContentWithAI(content, type, textContent = null, userId = null, imageCheck = null) {
    const textToCheck = textContent || content || '';
    const lower = String(textToCheck).toLowerCase();

    // 1. Bloquear contenido ilegal por texto (cede event loop cada 5 patrones)
    for (let i = 0; i < ILLEGAL_PATTERNS.length; i++) {
        const pattern = ILLEGAL_PATTERNS[i];
        await yieldLoop(i);
        if (pattern.test(lower)) {
            return { 
                verdict: 'rejected', 
                confidence: 0.95, 
                reason: 'Este contenido viola las normas básicas de Shekael' 
            };
        }
    }

    // 2. NSFW check: si el frontend reportó imagen NSFW, marcar para revisión
    if (imageCheck && imageCheck.nsfwResult && imageCheck.nsfwConfidence > 0.8) {
        if (imageCheck.nsfwResult === 'Porn' || imageCheck.nsfwResult === 'Hentai') {
            return {
                verdict: 'needs_review',
                confidence: imageCheck.nsfwConfidence,
                reason: `Contenido sensible detectado (${imageCheck.nsfwResult}). Será revisado antes de publicarse.`
            };
        }
    }

    // 3. Anti-spam: evitar que un usuario inunde el feed
    if (userId) {
        const now = Date.now();
        const lastPost = lastPostCache.get(userId);
        if (lastPost && (now - lastPost) < SPAM_WINDOW_MS) {
            return { 
                verdict: 'rejected', 
                confidence: 0.9, 
                reason: 'Estás publicando muy rápido. Espera un momento entre posts.' 
            };
        }
        lastPostCache.set(userId, now);

        // Limpiar cache vieja cada 100 entradas
        if (lastPostCache.size > 100) {
            const now2 = Date.now();
            for (const [key, time] of lastPostCache) {
                if (now2 - time > 60000) lastPostCache.delete(key);
            }
        }
    }

    return { 
        verdict: 'approved', 
        confidence: 0.99, 
        reason: 'Contenido aprobado' 
    };
}

/**
 * Alias para uso en chat.service.js — mismo análisis asíncrono
 */
export async function moderate(content = '') {
    const result = await analyzeContentWithAI(content, 'text', null, null, null);
    return { isBlocked: result.verdict === 'rejected', reason: result.reason };
}

export default { analyzeContentWithAI, moderate };
