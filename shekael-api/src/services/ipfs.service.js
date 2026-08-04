import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let s3Client;
function getS3Client() {
    if (!s3Client) {
        if (!process.env.CLOUDFLARE_R2_ACCOUNT_ID) {
            throw new Error('CLOUDFLARE_R2_ACCOUNT_ID no configurado');
        }
        s3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
                secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
            },
        });
    }
    return s3Client;
}

export function generateFilename(prefix = 'file') {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 10);
    return `${prefix}-${ts}-${rand}`;
}

/**
 * Sube un archivo a Cloudflare R2
 * @returns {string} URL pública en R2
 */
export async function uploadToR2(fileBuffer, filename, mimeType) {
    const client = getS3Client();
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: filename,
        Body: fileBuffer,
        ContentType: mimeType,
    });

    await client.send(command);

    const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;
    if (!publicUrl) {
        throw new Error('CLOUDFLARE_R2_PUBLIC_URL no configurado');
    }
    const url = `${publicUrl.replace(/\/$/, '')}/${filename}`;

    // Verificar que la URL pública realmente sirve el objeto (Public Access del bucket).
    // Si el bucket no tiene Public Access habilitado, R2 responde 403 al GET/HEAD
    // y las imágenes se ven rotas. En ese caso borramos el objeto huérfano y lanzamos
    // error para que el caller caiga a su fallback local (todos lo tienen).
    // Cuando Kuki habilite Public Access en Cloudflare, esto se auto-cura y R2 vuelve a usarse.
    try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
            try { await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: filename })); } catch { /* best effort */ }
            throw new Error(`R2 público no accesible (HTTP ${res.status})`);
        }
    } catch (err) {
        if (err.message?.startsWith('R2 público')) throw err;
        // HEAD falló (red/timeout/etc.) — no podemos garantizar URLs públicas usables
        try { await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: filename })); } catch { /* best effort */ }
        throw new Error('R2 público no verificable');
    }

    return url;
}

/**
 * Genera una URL prefirmada (Presigned URL) para un objeto en R2
 */
export async function generatePresignedUrl(r2Key, expiresIn = 3600) {
    const client = getS3Client();
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;

    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: r2Key,
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn });
    return signedUrl;
}

/**
 * Elimina un objeto de Cloudflare R2
 */
export async function deleteFromR2(filename) {
    try {
        const client = getS3Client();
        const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;

        const command = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: filename,
        });

        await client.send(command);
        void(`[R2] Archivo eliminado: ${filename}`);
        return true;
    } catch (err) {
        console.error(`[R2 Delete Error]: ${err.message}`);
        return false;
    }
}

export default { uploadToR2, generatePresignedUrl, deleteFromR2 };
