const API = import.meta.env.VITE_API_URL || '/api';

export async function searchMusic(query, limit = 20) {
  const res = await fetch(`${API}/music/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error('Error al buscar música');
  return res.json();
}

/** Obtiene canciones relacionadas desde el Mix de YouTube */
export async function getRelated(videoId, limit = 30) {
  const res = await fetch(`${API}/music/related/${videoId}?limit=${limit}`);
  if (!res.ok) throw new Error('Error al obtener relacionadas');
  return res.json();
}
