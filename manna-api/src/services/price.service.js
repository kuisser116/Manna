/**
 * Servicio de Precios (Ehise)
 * Proporciona tasas de cambio para visualización local.
 */

const RATES = {
    USDC_MXN: 18.25, // 1 USDC ≈ $18.25 MXN
    XLM_MXN: 2.38,   // 1 XLM ≈ $2.38 MXN
};

/**
 * Convierte un monto de cripto a MXN
 * @param {string|number} amount 
 * @param {string} currency - 'USDC' | 'XLM' 
 * @returns {string} 
 */
export function convertToMXN(amount, currency) {
    const val = parseFloat(amount || 0);
    const rate = currency === 'USDC' ? RATES.USDC_MXN : RATES.XLM_MXN;
    const mxn = val * rate;
    
    // Formatear a 2 decimales
    return mxn.toFixed(2);
}

export function getRates() {
    return RATES;
}
