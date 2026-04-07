import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

function getKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('ENCRYPTION_KEY not set in .env');
    // Asegurar 32 bytes
    return crypto.createHash('sha256').update(key).digest();
}

export function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText) {
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
