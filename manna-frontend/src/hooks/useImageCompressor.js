/**
 * useImageCompressor.js
 * Comprime imágenes en el navegador ANTES de subirlas a Pinata.
 * Usa Canvas API — sin dependencias externas.
 *
 * Estrategia:
 *  - Redimensiona a un máximo de 1200px en el lado más largo
 *  - Convierte a WebP (el formato más eficiente soportado por browsers modernos)
 *  - Calidad configurable (default 0.75 = excelente balance)
 *  - Resultado: una imagen de 5MB → ~200-400KB sin pérdida visible
 */

const MAX_WIDTH = 1200;  // px — suficiente para verse bien en feed
const MAX_HEIGHT = 1200;
const QUALITY = 0.75;    // 0-1: 0.75 es el punto dulce calidad/peso
const MAX_FILE_MB = 5;   // Rechaza imágenes >5MB antes de comprimir

/**
 * Comprime un File de imagen usando Canvas API
 * @param {File} file - El archivo de imagen original
 * @param {Object} options - { maxWidth, maxHeight, quality, outputFormat }
 * @returns {Promise<File>} Archivo comprimido listo para subir
 */
export async function compressImage(file, options = {}) {
    const {
        maxWidth = MAX_WIDTH,
        maxHeight = MAX_HEIGHT,
        quality = QUALITY,
        outputFormat = 'image/webp',
    } = options;

    return new Promise((resolve, reject) => {
        // Validar tamaño antes de procesar
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
            reject(new Error(`La imagen no puede superar ${MAX_FILE_MB}MB`));
            return;
        }

        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            // Calcular nuevas dimensiones manteniendo aspecto
            let { width, height } = img;
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            // Fondo blanco para imágenes con transparencia (PNG → WebP)
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        reject(new Error('Error al comprimir la imagen'));
                        return;
                    }
                    // Crear un nuevo File con el blob comprimido
                    const compressedFile = new File(
                        [blob],
                        file.name.replace(/\.[^.]+$/, '.webp'),
                        { type: outputFormat }
                    );

                    const savings = ((1 - blob.size / file.size) * 100).toFixed(0);
                    console.info(
                        `🗜️ Imagen comprimida: ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB (-${savings}%)`
                    );

                    resolve(compressedFile);
                },
                outputFormat,
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('No se pudo leer la imagen'));
        };

        img.src = objectUrl;
    });
}

/**
 * Hook de React para comprimir imágenes con estado de progreso
 */
import { useState, useCallback } from 'react';

export function useImageCompressor() {
    const [compressing, setCompressing] = useState(false);
    const [compressionStats, setCompressionStats] = useState(null);

    const compress = useCallback(async (file, options = {}) => {
        setCompressing(true);
        setCompressionStats(null);
        try {
            const original = file.size;
            const compressed = await compressImage(file, options);
            const stats = {
                originalKB: Math.round(original / 1024),
                compressedKB: Math.round(compressed.size / 1024),
                savings: Math.round((1 - compressed.size / original) * 100),
            };
            setCompressionStats(stats);
            return compressed;
        } finally {
            setCompressing(false);
        }
    }, []);

    return { compress, compressing, compressionStats };
}

export default useImageCompressor;
