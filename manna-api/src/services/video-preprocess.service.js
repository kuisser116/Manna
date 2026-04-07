/**
 * video-preprocess.service.js
 *
 * Pre-procesa archivos MP4 antes de subirlos a R2.
 *
 * Problema que resuelve:
 *   Videos descargados de YouTube, grabados con OBS, editados en ciertos programas
 *   o capturados desde dispositivos móviles pueden tener el "moov atom" (el índice
 *   del video con duración, pistas de audio, fps, etc.) al FINAL del archivo.
 *   Esto causa que Livepeer (y cualquier transcoder remoto) no pueda leer
 *   correctamente el archivo, generando output corrupto: duración incorrecta,
 *   video que "salta" al final, audio desfasado.
 *
 * Solución:
 *   Aplicar "-movflags faststart" via ffmpeg, que mueve el moov atom al INICIO
 *   del archivo sin re-encodar (copia directa de streams), haciendo el MP4
 *   compatible con streaming y transcodificación remota.
 */

import { createReadStream, createWriteStream, existsSync } from 'fs';
import { unlink, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Detectar ffmpeg disponible en el sistema
async function getFfmpegPath() {
    // 1. Intentar ffmpeg-static (si está instalado como dependencia)
    try {
        const { default: ffmpegStatic } = await import('ffmpeg-static');
        if (ffmpegStatic && existsSync(ffmpegStatic)) {
            return ffmpegStatic;
        }
    } catch (_) {
        // ffmpeg-static no está instalado, continuar
    }

    // 2. Intentar ffmpeg del sistema (PATH)
    try {
        await execAsync('ffmpeg -version');
        return 'ffmpeg';
    } catch (_) {
        // ffmpeg no está en PATH
    }

    return null;
}

/**
 * Verifica si un Buffer MP4 tiene el moov atom al inicio (streaming-ready).
 * Lee los primeros 16 bytes: si contiene 'ftyp' o 'moov', está listo.
 * Si contiene 'mdat', el moov está al final y necesita faststart.
 *
 * @param {Buffer} buffer
 * @returns {boolean} true si el archivo ya tiene faststart
 */
/**
 * Verifica si un Buffer MP4 tiene el moov atom al inicio (streaming-ready).
 * Examina la estructura de cajas (atoms) del MP4.
 *
 * @param {Buffer} buffer
 * @returns {boolean} true si el archivo ya tiene faststart
 */
function isFaststart(buffer) {
    if (buffer.length < 12) return true;

    let offset = 0;
    // Escaneamos los primeros atoms (habitualmente ftyp, free, moov, mdat)
    // No necesitamos escanear todo el archivo, solo ver qué llega primero: moov o mdat.
    while (offset + 8 <= buffer.length) {
        let size = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);

        if (type === 'moov') {
            console.log(`[VideoPreprocess] Encontrado 'moov' en offset ${offset}. El video ES apto para streaming.`);
            return true;
        }
        if (type === 'mdat') {
            console.log(`[VideoPreprocess] Encontrado 'mdat' en offset ${offset} antes de 'moov'. NECESITA faststart.`);
            return false;
        }

        if (size === 1) {
            // Tamaño extendido de 64 bits (en los siguientes 8 bytes)
            if (offset + 16 > buffer.length) break;
            size = Number(buffer.readBigUInt64BE(offset + 8));
        }

        if (size < 8) break; // Error en la estructura
        offset += size;

        // Si hemos saltado más de 1MB y no hay moov, probablemente está al final
        if (offset > 1024 * 1024) break;
    }

    return false; // Si no encontramos moov en el primer MB, asumimos que está al final
}

/**
 * Estandariza un video MP4 para asegurar compatibilidad total con Livepeer y Streaming.
 *
 * Problemas que resuelve:
 *   - VFR (Variable Frame Rate): Apple/Samsung/YouTube usan FPS variables que rompen el HLS.
 *   - Desfase de Audio: Sincroniza audio/video si el audio empieza antes.
 *   - Moov Atom: Mueve el índice al inicio para streaming inmediato.
 *
 * @param {Buffer} buffer - Buffer del archivo original
 * @param {string} mimeType - MIME type del archivo
 * @returns {Buffer} Buffer del archivo estandarizado
 */
export async function ensureFaststart(buffer, mimeType = 'video/mp4') {
    const isVideo = mimeType && (
        mimeType.startsWith('video/mp4') ||
        mimeType.startsWith('video/quicktime') ||
        mimeType === 'video/x-msvideo'
    );

    if (!isVideo) return buffer;

    console.log('[VideoPreprocess] 🛠️  Estandarizando video para máxima compatibilidad...');

    const ffmpegPath = await getFfmpegPath();
    if (!ffmpegPath) {
        console.warn('[VideoPreprocess] ⚠️  ffmpeg no disponible. Subiendo original.');
        return buffer;
    }

    const tmpId = uuidv4();
    const inputPath = join(tmpdir(), `manna-in-${tmpId}.mp4`);
    const outputPath = join(tmpdir(), `manna-out-${tmpId}.mp4`);

    try {
        await writeFile(inputPath, buffer);

        /**
         * EXPLICACIÓN DE LOS FLAGS:
         * -vsync cfr: Fuerza Constant Frame Rate (evita saltos en Livepeer)
         * -af aresample=async=1: Arregla desfases de audio al inicio
         * -c:v libx264: Re-codifica a H.264 estándar
         * -preset superfast: Máxima velocidad de procesamiento
         * -crf 22: Mantiene una calidad visual excelente
         * -movflags +faststart: Mueve el índice al inicio
         */
        const cmd = `"${ffmpegPath}" -y -i "${inputPath}" -c:v libx264 -preset superfast -crf 22 -c:a aac -b:a 128k -vsync cfr -af "aresample=async=1" -movflags +faststart "${outputPath}"`;

        console.log(`[VideoPreprocess] Procesando: ffmpeg -vsync cfr -af aresample...`);
        const { stderr } = await execAsync(cmd);

        const processedBuffer = await readFile(outputPath);
        console.log(`[VideoPreprocess] ✅ Video estandarizado exitosamente.`);
        return processedBuffer;

    } catch (err) {
        console.error('[VideoPreprocess] ❌ Error en estandarización:', err.message);
        return buffer;
    } finally {
        for (const path of [inputPath, outputPath]) {
            try { if (existsSync(path)) await unlink(path); } catch (_) { }
        }
    }
}

export default { ensureFaststart };
