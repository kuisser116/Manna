import { PinataSDK } from 'pinata-web3';
import { Blob } from 'node:buffer';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CID } from 'multiformats/cid';
import * as Raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';

let pinata;

function getPinata() {
    if (!pinata) {
        const jwt = process.env.PINATA_JWT;
        if (!jwt) {
            throw new Error('PINATA_JWT no configurado en .env');
        }
        pinata = new PinataSDK({
            pinataJwt: jwt,
            pinataGateway: process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud',
        });
    }
    return pinata;
}

/**
 * Sube un archivo (Buffer o File) a IPFS via Pinata
 * @returns {string} CID del archivo en IPFS
 */
export async function uploadFile(fileBuffer, filename, mimeType = 'image/jpeg') {
    const client = getPinata();

    // Usar Blob para compatibilidad (Node 18+)
    const blob = new Blob([fileBuffer], { type: mimeType });
    // Pinata SDK puede aceptar un objeto con 'name' o simplemente el Blob/File
    const result = await client.upload.file(blob).addMetadata({
        name: filename
    });
    return result.IpfsHash; // El CID de IPFS
}

/**
 * Sube JSON a IPFS (para metadata de posts)
 * Usamos un fetch directo con timeout de 60s para evitar fallos en redes saturadas (videos largos)
 */
export async function uploadJSON(data, retries = 3) {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) throw new Error('PINATA_JWT no configurado');

    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${jwt}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data),
                signal: AbortSignal.timeout(120000) // 120 segundos de paciencia
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Pinata API Error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            return result.IpfsHash;
        } catch (err) {
            console.error(`[uploadJSON Error - Intento ${i + 1} de ${retries}]:`, err.message);
            if (i === retries - 1) throw err;
            // Esperar 2 segundos antes de reintentar
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

/**
 * Construye la URL pública para acceder a un archivo en IPFS
 */
export function getIPFSUrl(cid) {
    const gateway = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud';
    return `${gateway}/ipfs/${cid}`;
}

// ─── CLOUDFLARE R2 HYBRID SYSTEM ─────────────────────────────

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

/**
 * Calcula el CID localmente (versión 1, raw, sha2-256) sin subir a IPFS
 * Mantiene la firma criptográfica para el Smart Contract
 */
export async function computeCID(fileBuffer) {
    const hash = await sha256.digest(new Uint8Array(fileBuffer));
    const cid = CID.create(1, Raw.code, hash);
    return cid.toString();
}

/**
 * Sube un archivo a Cloudflare R2 (egress gratuito)
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

    // Retorna la URL pública si CLOUDFLARE_R2_PUBLIC_URL está definido, 
    // de lo contrario retorna un URI r2://
    const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;
    if (publicUrl) {
        return `${publicUrl.replace(/\/$/, '')}/${filename}`;
    }
    return `r2://${filename}`;
}


/**
 * Genera una URL prefirmada (Presigned URL) para un objeto en R2.
 * Livepeer la usará para descargar el video sin ser bloqueado por Cloudflare.
 * @param {string} r2Key - La clave (filename) del objeto en R2
 * @param {number} expiresIn - Segundos de vigencia (default: 3600 = 1 hora)
 * @returns {string} URL firmada temporal
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
 * @param {string} filename - El Key del archivo en el bucket
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
        console.log(`[R2] Archivo eliminado: ${filename}`);
        return true;
    } catch (err) {
        console.error(`[R2 Delete Error]: ${err.message}`);
        return false;
    }
}


export default { uploadFile, uploadJSON, getIPFSUrl, uploadToR2, computeCID, generatePresignedUrl, deleteFromR2 };
