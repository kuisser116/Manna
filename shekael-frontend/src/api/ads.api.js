const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Obtener el saldo de ganancias por anuncios
 */
export async function getAdEarnings() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/ads/earnings`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Error al obtener ganancias');
    return res.json();
}

/**
 * Registrar vista de anuncio
 * @param {Object} params
 * @param {'feed'|'preroll'|'rewarded'} params.ad_type
 * @param {'feed'|'preroll'|'rewarded'} params.source
 * @param {string|null} params.creator_id
 * @param {number} params.focus_duration - segundos que el usuario tuvo el anuncio en foco
 */
export async function recordAdImpression({ ad_type = 'feed', source = 'feed', creator_id = null, watch_seconds = 0, ad_id = null }) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/ads/impression`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ad_type, source, creator_id, watch_seconds, ad_id })
    });
    return res.json();
}

export async function getNextAd(seen = '') {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/ads/next?seen=${encodeURIComponent(seen)}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}

/**
 * Retiro mensual de ganancias
 */
export async function claimMonthlyEarnings() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/ads/claim-monthly`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}

/**
 * Historial de anuncios vistos
 */
export async function getAdHistory(page = 0) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/ads/history?page=${page}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Error al obtener historial');
    return res.json();
}

/**
 * Estadísticas del día/semana
 */
export async function getAdStats() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/ads/stats`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Error al obtener estadísticas');
    return res.json();
}

/**
 * Estado del pool mensual
 */
export async function getPoolStatus() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/ads/pool`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Error al obtener pool');
    return res.json();
}
