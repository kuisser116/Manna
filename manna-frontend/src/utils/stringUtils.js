/**
 * Valida si un string es un CID de IPFS (v0 o v1)
 * baf... (v1) o Qm... (v0)
 */
export const isValidCID = (str) => {
    if (!str || typeof str !== 'string') return false;
    const s = str.trim().toLowerCase();
    // Cualquier cosa que empiece por baf o qm y sea larga es sospechosa de ser un CID
    return (s.startsWith('baf') || s.startsWith('qm')) && s.length > 25;
};

/**
 * Limpia un título para asegurar que no sea un CID
 */
export const cleanTitle = (title, fallback = 'Sin título') => {
    if (!title || isValidCID(title)) return fallback;
    return title;
};
