import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

/**
 * Deriva una clave AES-256 de 32 bytes a partir de un seed (userId o master key).
 * Siempre SHA-256 para asegurar exactamente 32 bytes.
 */
function deriveKey(seed) {
    return crypto.createHash('sha256').update(String(seed)).digest();
}

/**
 * Encripta texto usando una semilla como derivación de clave.
 * @param {string} text - Texto a encriptar
 * @param {string} seed - Semilla para derivar la clave (userId para per-user, ENCRYPTION_KEY para recovery)
 * @returns {string} formato: "iv_hex:encrypted_hex"
 */
export function encrypt(text, seed) {
    if (!seed) throw new Error('Seed requerido para encriptar');
    const key = deriveKey(seed);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Desencripta texto usando una semilla como derivación de clave.
 * @param {string} encryptedText - Texto encriptado en formato "iv_hex:encrypted_hex"
 * @param {string} seed - Semilla para derivar la clave (userId para per-user, ENCRYPTION_KEY para recovery)
 * @returns {string} - Texto original desencriptado
 */
export function decrypt(encryptedText, seed) {
    if (!seed) throw new Error('Seed requerido para desencriptar');
    const [ivHex, encrypted] = encryptedText.split(':');
    if (!ivHex || !encrypted) throw new Error('Formato de texto encriptado inválido');
    const iv = Buffer.from(ivHex, 'hex');
    const key = deriveKey(seed);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Encripta la clave secreta de Stellar usando el userId del usuario como semilla.
 * La clave secreta se asocia al usuario, no a una llave maestra compartida.
 * @param {string} userId - UUID del usuario en Supabase
 * @param {string} secretKey - Clave secreta de Stellar (S...)
 * @returns {string} - Texto encriptado para guardar en stellar_secret_key_encrypted
 */
export function encryptForUser(userId, secretKey) {
    return encrypt(secretKey, userId);
}

/**
 * Desencripta la clave secreta de Stellar usando el userId del usuario.
 * @param {string} userId - UUID del usuario en Supabase
 * @param {string} encryptedText - Valor de stellar_secret_key_encrypted
 * @returns {string} - Clave secreta de Stellar desencriptada
 */
export function decryptForUser(userId, encryptedText) {
    return decrypt(encryptedText, userId);
}

/**
 * Crea un backup de recuperación de la clave secreta, encriptado con la ENCRYPTION_KEY maestra.
 * Este backup permite recuperar la wallet si el usuario cambia de ID o hay migraciones.
 * @param {string} secretKey - Clave secreta de Stellar
 * @returns {string} - Texto encriptado para guardar en recovery_encrypted
 */
export function encryptRecovery(secretKey) {
    const masterKey = process.env.ENCRYPTION_KEY;
    if (!masterKey) throw new Error('ENCRYPTION_KEY no configurada para recovery');
    return encrypt(secretKey, masterKey);
}

/**
 * Desencripta un backup de recuperación usando la ENCRYPTION_KEY maestra.
 * @param {string} encryptedText - Valor de recovery_encrypted
 * @returns {string} - Clave secreta de Stellar desencriptada
 */
export function decryptRecovery(encryptedText) {
    const masterKey = process.env.ENCRYPTION_KEY;
    if (!masterKey) throw new Error('ENCRYPTION_KEY no configurada para recovery');
    return decrypt(encryptedText, masterKey);
}

// Semilla de emergencia — derivada de la clave pública + ENCRYPTION_KEY.
// Ya no depende solo de la clave pública (que es visible).
function getEmergencySeed(stellarPublicKey) {
    const masterKey = process.env.ENCRYPTION_KEY;
    if (!masterKey) throw new Error('ENCRYPTION_KEY no configurada para emergencia');
    return masterKey + stellarPublicKey;
}

/**
 * Intenta desencriptar una clave secreta con tres niveles de fallback.
 * El campo encryptedText puede contener 1 o 3 valores separados por ||:
 *   "peruser_iv:enc"  (solo per-user, legacy)
 *   "peruser_iv:enc||recovery_iv:enc||emergency_iv:enc"
 *
 * Orden de intentos:
 * 1. Per-user (userId) — primero o primero de la tupla
 * 2. Recovery (ENCRYPTION_KEY maestra) — segundo de la tupla
 * 3. Emergencia (passphrase hardcodeada) — tercero de la tupla
 *
 * @param {string} userId - UUID del usuario
 * @param {string} stellarPublicKey - Clave pública Stellar del usuario (para emergencia)
 * @param {string} encryptedText - stellar_secret_key_encrypted (1 o 3 valores ||)
 * @returns {string} - Clave secreta desencriptada
 */
export function decryptWithFallback(userId, stellarPublicKey, encryptedText) {
    const parts = encryptedText.split('||');
    const perUserEnc = parts[0];
    const recoveryEnc = parts[1];
    const emergencyEnc = parts[2];

    // Nivel 1: Per-user
    try {
        return decrypt(perUserEnc, userId);
    } catch (e1) {
        console.warn('Nivel 1 (per-user) falló:', e1.message);
    }

    // Nivel 2: Recovery con master key
    if (recoveryEnc) {
        try {
            const masterKey = process.env.ENCRYPTION_KEY;
            if (masterKey) {
                const secret = decrypt(recoveryEnc, masterKey);
                return secret;
            }
        } catch (e2) {
            console.warn('Nivel 2 (recovery) falló:', e2.message);
        }
    }

    // Nivel 3: Emergencia — derivado de la clave pública Stellar (inmutable, única por usuario)
    if (emergencyEnc && stellarPublicKey) {
        try {
            const secret = decrypt(emergencyEnc, getEmergencySeed(stellarPublicKey));
            return secret;
        } catch (e3) {
            console.warn('Nivel 3 (emergencia) falló:', e3.message);
        }
    }

    throw new Error('No se pudo desencriptar la clave con ningún método de respaldo');
}

/**
 * Encripta una clave secreta con los tres niveles y las concatena con ||.
 * @param {string} userId - UUID del usuario
 * @param {string} secretKey - Clave secreta de Stellar
 * @param {string} stellarPublicKey - Clave pública Stellar (para emergencia inmutable)
 * @returns {string} - "peruser_iv:enc||recovery_iv:enc||emergency_iv:enc"
 */
export function encryptAll(userId, secretKey, stellarPublicKey) {
    const perUser = encrypt(secretKey, userId);
    const masterKey = process.env.ENCRYPTION_KEY;
    const recovery = masterKey ? encrypt(secretKey, masterKey) : '';
    const emergency = stellarPublicKey ? encrypt(secretKey, getEmergencySeed(stellarPublicKey)) : '';
    return [perUser, recovery, emergency].filter(Boolean).join('||');
}
