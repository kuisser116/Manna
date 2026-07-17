const API = import.meta.env.VITE_API_URL || '/api';

export async function searchMusic(query, limit = 20) {
  const res = await fetch(`${API}/music/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error('Error al buscar música');
  return res.json();
}

/** Obtiene URL del proxy de audio (directa a nuestro servidor, sin CORS) */
export function getProxyUrl(videoId) {
  const api = import.meta.env.VITE_API_URL || '/api';
  return `${api}/music/proxy/${videoId}`;
}
