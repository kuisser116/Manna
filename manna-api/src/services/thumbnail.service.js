import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { uploadToR2 } from './ipfs.service.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configurar el path de ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Genera una miniatura automática desde un video
 * Toma un frame del segundo 3 para evitar el negro del inicio
 */
export async function generateThumbnailFromVideo(videoBuffer, originalFilename) {
    return new Promise((resolve, reject) => {
        // Crear archivo temporal
        const tempDir = os.tmpdir();
        const tempVideoPath = path.join(tempDir, `temp-${uuidv4()}-${originalFilename}`);
        const tempThumbnailPath = path.join(tempDir, `thumb-${uuidv4()}.jpg`);
        
        // Escribir buffer a archivo temporal
        fs.writeFileSync(tempVideoPath, videoBuffer);
        
        ffmpeg(tempVideoPath)
            // Tomar frame del segundo 3 (evita el negro del inicio)
            .seekInput('3')
            .frames(1)
            .size('1280x720')
            .outputOptions([
                '-vframes 1',
                '-q:v 2',
                '-update 1'
            ])
            .on('end', () => {
                try {
                    // Leer el thumbnail generado
                    const thumbnailBuffer = fs.readFileSync(tempThumbnailPath);
                    
                    // Limpiar archivos temporales
                    fs.unlinkSync(tempVideoPath);
                    fs.unlinkSync(tempThumbnailPath);
                    
                    resolve(thumbnailBuffer);
                } catch (cleanupError) {
                    console.error('[Thumbnail Cleanup ERROR]:', cleanupError);
                    reject(cleanupError);
                }
            })
            .on('error', (err) => {
                console.error('[Thumbnail Generation ERROR]:', err);
                // Limpiar archivo temporal de video en caso de error
                try {
                    fs.unlinkSync(tempVideoPath);
                } catch (cleanupError) {
                    // Ignorar error de cleanup
                }
                reject(new Error('Error generando miniatura del video'));
            })
            .save(tempThumbnailPath);
    });
}

/**
 * Procesa la miniatura: usa la subida por usuario o genera automática
 */
export async function processThumbnail(videoBuffer, thumbnailFile, originalFilename) {
    console.log('[Thumbnail DEBUG]: Procesando miniatura...', { hasThumbnail: !!thumbnailFile, filename: originalFilename });
    
    if (thumbnailFile) {
        // Usar miniatura subida por el usuario
        console.log('[Thumbnail DEBUG]: Usando miniatura subida por usuario');
        return await uploadToR2(
            thumbnailFile.buffer, 
            `thumb-${uuidv4()}`, 
            thumbnailFile.mimetype
        );
    } else {
        // Generar miniatura automática del video
        console.log('[Thumbnail DEBUG]: Generando miniatura automática...');
        try {
            const thumbnailBuffer = await generateThumbnailFromVideo(videoBuffer, originalFilename);
            console.log('[Thumbnail DEBUG]: Miniatura generada, tamaño:', thumbnailBuffer.length);
            const thumbnailUrl = await uploadToR2(
                thumbnailBuffer, 
                `thumb-auto-${uuidv4()}.jpg`, 
                'image/jpeg'
            );
            console.log('[Thumbnail DEBUG]: Miniatura subida a:', thumbnailUrl);
            return thumbnailUrl;
        } catch (error) {
            console.error('[Auto Thumbnail ERROR]:', error);
            // Si falla la generación automática, continuar sin miniatura
            return null;
        }
    }
}
