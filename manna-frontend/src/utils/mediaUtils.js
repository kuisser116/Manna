/**
 * Genera una miniatura (Base64) de una imagen o un video.
 * @param {File} file - El archivo a procesar.
 * @param {number} maxWidth - Ancho máximo de la miniatura.
 * @returns {Promise<string>} - Una promesa que resuelve con el Data URL (Base64).
 */
export async function generateThumbnail(file, maxWidth = 400) {
    if (!file) return null;

    if (file.type.startsWith('image/')) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const scale = maxWidth / img.width;
                    canvas.width = maxWidth;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    if (file.type.startsWith('video/')) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true;
            video.playsInline = true;
            video.src = URL.createObjectURL(file);
            
            video.onloadeddata = () => {
                // Ir al segundo 1 para capturar una imagen representativa
                video.currentTime = Math.min(1, video.duration / 2);
            };

            video.onseeked = () => {
                const canvas = document.createElement('canvas');
                const scale = maxWidth / video.videoWidth;
                canvas.width = maxWidth;
                canvas.height = video.videoHeight * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                URL.revokeObjectURL(video.src);
                resolve(dataUrl);
            };

            video.onerror = (e) => {
                URL.revokeObjectURL(video.src);
                reject(e);
            };
        });
    }

    return null;
}
