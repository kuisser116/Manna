/**
 * Servicio de Precios (Shekael)
 * Obtiene tasa USD/MXN en tiempo real, con caché de 5 min.
 * Fallback a tasa hardcodeada si la API no responde.
 */

let cachedRate = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const FALLBACK_RATE = 18.50;

/**
 * Obtiene la tasa USD → MXN desde DolarAPI (gratis, sin key)
 */
async function fetchRate() {
    const now = Date.now();
    if (cachedRate && (now - lastFetch) < CACHE_TTL) {
        return cachedRate;
    }

    try {
        // DolarAPI — gratuita, sin autenticación, tasa USD/MXN
        const res = await fetch('https://dolarapi.com/v1/dolares/blue', {
            signal: AbortSignal.timeout(5000)
        });
        const data = await res.json();
        // Blue: { compra, venta, ... } — usamos venta (el usuario compra USD caro)
        const rate = parseFloat(data.venta) || FALLBACK_RATE;
        cachedRate = rate;
        lastFetch = now;
        return rate;
    } catch {
        // Fallback si la API no responde
        cachedRate = FALLBACK_RATE;
        lastFetch = now;
        return FALLBACK_RATE;
    }
}

/**
 * Convierte USDC → MXN
 */
export async function convertToMXN(usdcAmount) {
    const val = parseFloat(usdcAmount || 0);
    const rate = await fetchRate();
    return (val * rate).toFixed(2);
}

/**
 * Convierte MXN → USDC
 */
export async function convertToUSDC(mxnAmount) {
    const val = parseFloat(mxnAmount || 0);
    const rate = await fetchRate();
    if (rate === 0) return '0.00';
    return (val / rate).toFixed(7);
}

/**
 * Obtiene la tasa actual USD/MXN
 */
export async function getMxnRate() {
    return await fetchRate();
}

export default { convertToMXN, convertToUSDC, getMxnRate };
