/**
 * Moderación mínima — libertad de expresión con límites claros.
 * 
 * Filosofía Shekael:
 * - No censuramos temas sensibles. La conciencia se crea hablando, no callando.
 * - Solo bloqueamos lo ilegal o lo que daña directamente a otros.
 * - El contenido controversial tiene espacio aquí — la comunidad decide con supports y likes.
 * - Si algo cruza la línea, los usuarios reportan y se revisa manualmente.
 */

const ILLEGAL_PATTERNS = [
    // Explícitamente ilegal en México y la mayoría de países
    /\b(abuso\s+sexual\s+(infantil|menor|niñ[ao]))\b/i,
    /\b(trata\s+de\s+personas|trata\s+blanca)\b/i,
    /\b(vende?\s*(droga|arma|niñ[oa]))\b/i,
    // Spam masivo
    /\b(spam|clickbait)\b/i,
    // Estafas/fraude
    /\b(esquema.*ponzi|estafa\s+piramidal)\b/i,
];

const SPAM_WINDOW_MS = 15 * 1000; // 15 segundos entre posts

const lastPostCache = new Map();

/**
 * Analiza contenido con reglas mínimas.
 * @param {string} content - Contenido
 * @param {string} type - Tipo de contenido
 * @param {string} userId - ID del usuario (para spam check)
 * @returns {{ verdict: string, confidence: number, reason: string }}
 */
export function analyzeContentWithAI(content, type, textContent = null, userId = null) {
    const textToCheck = textContent || content || '';
    const lower = String(textToCheck).toLowerCase();

    // Solo bloqueamos contenido ilegal
    for (const pattern of ILLEGAL_PATTERNS) {
        if (pattern.test(lower)) {
            return { 
                verdict: 'rejected', 
                confidence: 0.95, 
                reason: 'Este contenido viola las normas básicas de Shekael' 
            };
        }
    }

    // Anti-spam: evitar que un usuario inunde el feed
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

export default { analyzeContentWithAI };
