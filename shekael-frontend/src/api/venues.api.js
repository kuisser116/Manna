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
