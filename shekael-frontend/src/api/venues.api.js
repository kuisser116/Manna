const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Buscar lugares por texto
 */
export async function searchVenues(query) {
    const token = localStorage.getItem('Shekael_token');
    const res = await fetch(`${API_URL}/venues/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Error al buscar lugares');
    return res.json();
}

/**
 * Lugares cercanos a coordenadas
 */
export async function getNearbyVenues(lat, lng, radius = 0.1) {
    const token = localStorage.getItem('Shekael_token');
    const res = await fetch(`${API_URL}/venues/nearby?lat=${lat}&lng=${lng}&radius=${radius}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Error al obtener lugares cercanos');
    return res.json();
}

/**
 * Detalle de un lugar
 */
export async function getVenue(id) {
    const token = localStorage.getItem('Shekael_token');
    const res = await fetch(`${API_URL}/venues/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Error al obtener lugar');
    return res.json();
}

/**
 * Crear un lugar nuevo
 */
export async function createVenue({ name, category, address, zone, city, state, lat, lng }) {
    const token = localStorage.getItem('Shekael_token');
    const res = await fetch(`${API_URL}/venues`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name, category, address, zone, city, state, lat, lng })
    });
    if (!res.ok) throw new Error('Error al crear lugar');
    return res.json();
}

/**
 * Actualizar ubicación del usuario en tiempo real
 */
export async function updateUserLocation(lat, lng) {
    const token = localStorage.getItem('Shekael_token');
    try {
        await fetch(`${API_URL}/users/location`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ lat, lng })
        });
    } catch {
        // Silencioso — no crítico si falla la ubicación
    }
}
