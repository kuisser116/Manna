const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getToken() {
    return localStorage.getItem('Shekael_token');
}

/**
 * POST /chat/unlock — Descifrar chat keypair usando Stellar key (inmutable)
 * El backend ya tiene stellarSecretKey, solo necesitamos verificar PIN
 */
export async function unlockChat(pinHash) {
    const res = await fetch(`${API_URL}/chat/unlock`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pinHash })
    });
    return res.json();
}

/**
 * POST /chat/migrate — Migrar chat keypair de cifrado-PIN a cifrado-StellarKey
 * El backend descifra con PIN viejo, recifra con Stellar key, guarda.
 */
/**
 * POST /chat/migrate — Migrar chat keypair de cifrado-PIN a cifrado-StellarKey
 * El frontend ya descifró con PIN (libsodium), envía privateKey para recifrar con Stellar key.
 */
export async function migrateChat(pinHash, privateKey) {
    const res = await fetch(`${API_URL}/chat/migrate`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pinHash, privateKey })
    });
    return res.json();
}

/**
 * POST /chat/setup — Guardar chat keypair cifrado con Stellar key
 */
export async function setupChat(pinHash, publicKey, privateKey) {
    const res = await fetch(`${API_URL}/chat/setup`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pinHash, publicKey, privateKey })
    });
    return res.json();
}
