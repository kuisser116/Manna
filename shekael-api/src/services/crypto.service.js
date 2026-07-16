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
