import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Type, Image, Sparkles, Upload, X, Video } from 'lucide-react';
import FeedbackModal from '../components/FeedbackModal/FeedbackModal';
import useFeedbackModal from '../components/FeedbackModal/useFeedbackModal';
import useFeed from '../hooks/useFeed';
import useStore from '../store';
import { useImageCompressor } from '../hooks/useImageCompressor';
import VideoUploadWizard from '../components/VideoUploadWizard/VideoUploadWizard';
import { generateThumbnail } from '../utils/mediaUtils';
import { preValidateContent } from '../api/posts.api';
import styles from '../styles/pages/CreatePost.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const POST_TYPES = [
    { value: 'micro-text', label: 'Texto', icon: Type, desc: 'Un pensamiento (≤280 chars)' },
    { value: 'image', label: 'Imagen', icon: Image, desc: 'Subida a IPFS — permanente' },
    { value: 'video', label: 'Video', icon: Video, desc: 'Streaming Web3 via Livepeer' },
    { value: 'capsule', label: 'Cápsula ✨', icon: Sparkles, desc: 'Reflexión destacada' },
];

export default function CreatePost() {
    const [type, setType] = useState('micro-text');
    const [content, setContent] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [originalSize, setOriginalSize] = useState(null);
    const navigate = useNavigate();

    const { createPost } = useFeed();
    const { token } = useStore();
    const { compress, compressing, compressionStats } = useImageCompressor();
    const { modalState, setModalState, showLoading, showSuccess, showError, hideModal } = useFeedbackModal();

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setOriginalSize(file.size);
        setImagePreview(URL.createObjectURL(file));
        try {
            const compressed = await compress(file, { quality: 0.78, maxWidth: 1200 });
            setImageFile(compressed);
        } catch (err) {
            showError('Error con la imagen', err.message);
            setImagePreview(null);
        }
    };

    const uploadImageToIPFS = async () => {
        const formData = new FormData();
        formData.append('image', imageFile);
        if (content.trim()) formData.append('caption', content.trim());
        const res = await fetch(`${API_URL}/upload/image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.reason || errData.message || 'Error al subir imagen');
        }
        return res.json();
    };

    // ── Video: wizard callback ────────────────────────────────
    const handleVideoPublish = async ({ videoFile, thumbnailFile, title, description, tags, visibility, scheduledAt }) => {
        const totalSizeMB = (videoFile.size / (1024 * 1024)).toFixed(1);

        showLoading('Validando contenido...', 'La IA está revisando tu video antes de iniciar la subida');

        try {
            // 1. Validar con IA primero (usamos la miniatura seleccionada o generamos una)
            let thumbBase64 = null;
            if (thumbnailFile) {
                thumbBase64 = await generateThumbnail(thumbnailFile);
            } else {
                thumbBase64 = await generateThumbnail(videoFile);
            }

            const aiCheck = await preValidateContent({
                text: `Título: ${title}\nDescripción: ${description || ''}`,
                type: 'video',
                thumbnailBase64: thumbBase64
            });

            if (aiCheck.data.verdict === 'rejected') {
                showError('Contenido rechazado', aiCheck.data.reason || 'Tu video no cumple con las normas de la comunidad.');
                return;
            }

            // 2. Si es aprobado, proceder con la subida
            showLoading('Subiendo video...', `Preparando ${totalSizeMB} MB...`);

            const formData = new FormData();
            formData.append('video', videoFile);
            if (thumbnailFile) formData.append('thumbnail', thumbnailFile);
            formData.append('title', title);
            if (description) formData.append('description', description);
            if (tags) formData.append('tags', tags);
            formData.append('visibility', visibility);
            if (scheduledAt) formData.append('scheduledAt', scheduledAt);

            // Usar XMLHttpRequest para trackear progreso
            const response = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                let lastProgress = 0;
                let progressStarted = false;
                let realProgressReceived = false;
                const startTime = Date.now();

                // Simular progreso basado en tiempo (fallback)
                const simulateProgress = () => {
                    if (realProgressReceived) return;

                    const elapsed = (Date.now() - startTime) / 1000;
                    const estimatedDuration = Math.max(10, totalSizeMB * 2); // 2s por MB, mínimo 10s
                    const simulatedPercentage = Math.min(95, Math.round((elapsed / estimatedDuration) * 100));

                    if (simulatedPercentage > lastProgress && simulatedPercentage < 100) {
                        lastProgress = simulatedPercentage;
                        progressStarted = true;

                        const simulatedMB = (totalSizeMB * simulatedPercentage / 100).toFixed(1);

                        setModalState(prev => ({
                            ...prev,
                            message: `${simulatedMB} MB / ${totalSizeMB} MB (${simulatedPercentage}%)`
                        }));
                    }
                };

                // Calcular tiempo estimado inicial
                const estimatedDuration = Math.max(10, totalSizeMB * 2); // 2s por MB, mínimo 10s

                // Actualizar tiempo regresivo y progreso simulado cada 500ms
                const timeInterval = setInterval(() => {
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    const remainingTime = Math.max(0, estimatedDuration - elapsed);

                    if (!progressStarted) {
                        setModalState(prev => ({
                            ...prev,
                            message: `0 MB / ${totalSizeMB} MB (0%) - ${estimatedDuration}s`
                        }));
                        progressStarted = true;
                    }

                    if (!realProgressReceived) {
                        simulateProgress();
                    }

                    setModalState(prev => {
                        const timeDisplay = remainingTime > 0 ? `${Math.round(remainingTime)}s` : 'Completando...';

                        // Obtener los MB del mensaje actual para mantenerlos
                        const mbMatch = prev.message.match(/^([\d.]+\s*MB\s*\/\s*[\d.]+\s*MB)/);
                        const mbPart = mbMatch ? mbMatch[1] : `${(totalSizeMB * lastProgress / 100).toFixed(1)} MB / ${totalSizeMB} MB`;

                        // Construir el mensaje final limpio
                        const newMsg = `${mbPart} (${lastProgress}%) - ${timeDisplay}`;

                        if (prev.message === newMsg) return prev;
                        return { ...prev, message: newMsg };
                    });
                }, 500);

                // Trackear progreso real
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const loadedMB = (e.loaded / (1024 * 1024)).toFixed(1);
                        const percentage = Math.round((e.loaded / e.total) * 100);

                        // Solo usar progreso real si no es 100% inmediato
                        // Si es 100% desde el principio, ignorar y dejar que la simulación funcione
                        if (percentage < 100 || (percentage === 100 && lastProgress > 50)) {
                            realProgressReceived = true;

                            if (percentage > lastProgress && percentage <= 100) {
                                lastProgress = percentage;
                                progressStarted = true;

                                setModalState(prev => ({
                                    ...prev,
                                    message: `${loadedMB} MB / ${totalSizeMB} MB (${percentage}%)`
                                }));
                            }
                        }
                    }
                });

                // También escuchar el progreso general (no solo upload)
                xhr.addEventListener('progress', (e) => {
                    if (e.lengthComputable && !progressStarted) {
                        const loadedMB = (e.loaded / (1024 * 1024)).toFixed(1);
                        const percentage = Math.round((e.loaded / e.total) * 100);

                        if (percentage > lastProgress && percentage < 100) {
                            lastProgress = percentage;
                            progressStarted = true;

                            setModalState(prev => ({
                                ...prev,
                                message: `${loadedMB} MB / ${totalSizeMB} MB (${percentage}%)`
                            }));
                        }
                    }
                });

                // Inicializar con 0% después de un breve retraso
                setTimeout(() => {
                    if (!progressStarted) {
                        setModalState(prev => ({
                            ...prev,
                            message: `0 MB / ${totalSizeMB} MB (0%)`
                        }));
                    }
                }, 200);

                // Limpiar intervalo cuando termine
                xhr.addEventListener('loadend', () => {
                    clearInterval(timeInterval);
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            resolve(response);
                        } catch (e) {
                            reject(new Error('Error parsing response'));
                        }
                    } else {
                        try {
                            const errData = JSON.parse(xhr.responseText);
                            reject(new Error(errData.reason || errData.message || 'Error al subir video'));
                        } catch (e) {
                            reject(new Error('Error al subir video'));
                        }
                    }
                });

                xhr.addEventListener('error', () => {
                    reject(new Error('Error de conexión'));
                });

                xhr.open('POST', `${API_URL}/upload/video`);
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                xhr.send(formData);
            });

            showSuccess('¡Video publicado!');
            setTimeout(() => navigate('/feed'), 2000);
        } catch (err) {
            hideModal();
            showError('Error al subir video', err.message);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (type === 'image' && !imageFile) {
            showError('Sin imagen', 'Selecciona una imagen para publicar');
            return;
        }
        if (type !== 'image' && !content.trim()) {
            showError('Sin contenido', 'Escribe algo para publicar');
            return;
        }
        if (type === 'image') {
            const sizeKB = (imageFile.size / 1024).toFixed(0);
            showLoading('Validando imagen...', 'La IA está revisando tu contenido...');
            try {
                // Pre-validar imagen
                const thumbBase64 = await generateThumbnail(imageFile);
                const aiCheck = await preValidateContent({
                    text: content,
                    type: 'image',
                    thumbnailBase64: thumbBase64
                });

                if (aiCheck.data.verdict === 'rejected') {
                    showError('Contenido rechazado', aiCheck.data.reason || 'Tu imagen no cumple con las normas.');
                    return;
                }

                showLoading('Subiendo a IPFS...', `Enviando ${sizeKB}KB a la red descentralizada`);
                const result = await uploadImageToIPFS();
                const cid = result.cid?.slice(0, 16);
                showSuccess('¡Imagen publicada en IPFS!', result.cid ? `CID: ${cid}...` : '⚠️ Modo demo', true);
                setTimeout(() => navigate('/feed'), 2000);
            } catch (err) {
                hideModal();
                showError('Error al subir imagen', err.message);
            }
        } else {
            showLoading('Validando post...', 'La IA está revisando tu mensaje...');
            try {
                const aiCheck = await preValidateContent({
                    text: content,
                    type: type === 'capsule' ? 'capsule' : 'micro-text'
                });

                if (aiCheck.data.verdict === 'rejected') {
                    showError('Contenido rechazado', aiCheck.data.reason || 'Tu post no cumple con las normas.');
                    return;
                }

                showLoading('Publicando...', 'Enviando a la red');
                await createPost({ type, content });
                showSuccess('¡Publicado!', 'Tu post ya está en el feed', true);
                setTimeout(() => navigate('/feed'), 1400);
            } catch (err) {
                hideModal();
                const errorMsg = err.response?.data?.reason || err.response?.data?.message || err.message || 'Inténtalo de nuevo';
                showError('Error al publicar', errorMsg);
            }
        }
    };

    const isCapsule = type === 'capsule';
    const maxLength = type === 'micro-text' ? 280 : 1000;

    return (
        <div className={styles.layout}>
            <main className={styles.main}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Nuevo post</h2>
                    <p className={styles.subtitle}>Publica algo que valga la pena. Aquí el contenido importa.</p>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    {/* Selector de tipo */}
                    <div className={styles.typeGrid}>
                        {POST_TYPES.map(({ value, label, icon: Icon, desc }) => (
                            <button
                                key={value}
                                type="button"
                                className={`${styles.typeCard} ${type === value ? styles.typeActive : ''}`}
                                onClick={() => setType(value)}
                            >
                                <Icon size={20} />
                                <span className={styles.typeLabel}>{label}</span>
                                <span className={styles.typeDesc}>{desc}</span>
                            </button>
                        ))}
                    </div>

                    {/* Zona de imagen */}
                    {type === 'image' && (
                        <div className={styles.imageZone}>
                            {imagePreview && (
                                <div className={styles.imagePreviewWrap}>
                                    <img src={imagePreview} alt="Preview" className={styles.imagePreview} />
                                    <button
                                        type="button"
                                        className={styles.removeImage}
                                        onClick={() => { setImageFile(null); setImagePreview(null); setOriginalSize(null); }}
                                    >
                                        <X size={16} />
                                    </button>
                                    <AnimatePresence>
                                        {compressionStats && (
                                            <motion.div
                                                className={styles.compressionBadge}
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                            >
                                                <Zap size={12} />
                                                {(originalSize / 1024).toFixed(0)}KB → {compressionStats.compressedKB}KB
                                                <span className={styles.savingsTag}>-{compressionStats.savings}%</span>
                                            </motion.div>
                                        )}
                                        {compressing && (
                                            <motion.div className={styles.compressionBadge} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                                <Zap size={12} /> Comprimiendo...
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                            {!imagePreview && (
                                <label className={styles.uploadLabel}>
                                    <Upload size={26} />
                                    <span>Haz clic o arrastra una imagen</span>
                                    <span className={styles.uploadSub}>Se comprime automáticamente · Límite 5MB</span>
                                    <input type="file" accept="image/*" onChange={handleImageChange} hidden />
                                </label>
                            )}
                            <textarea
                                className={styles.textarea}
                                placeholder="Descripción (opcional)"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={2}
                            />
                        </div>
                    )}

                    {/* Wizard de video */}
                    {type === 'video' && (
                        <VideoUploadWizard
                            onPublish={handleVideoPublish}
                            onCancel={() => setType('micro-text')}
                        />
                    )}

                    {/* Textarea texto/cápsula */}
                    {(type !== 'image' && type !== 'video') && (
                        <div className={styles.textareaWrap}>
                            <textarea
                                className={`${styles.textarea} ${isCapsule ? styles.capsuleTextarea : ''}`}
                                placeholder={isCapsule ? '¿Qué reflexión quieres dejarles hoy?' : '¿Qué tienes en la cabeza? Dilo sin filtros.'}
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={isCapsule ? 4 : 6}
                                maxLength={maxLength}
                            />
                            <div className={styles.charCount}>
                                <span className={content.length > maxLength * 0.9 ? styles.charWarn : ''}>
                                    {content.length}/{maxLength}
                                </span>
                            </div>
                        </div>
                    )}

                    {type !== 'video' && (
                        <div className={styles.depositNote}>
                            🔒 Depósito de Confianza: 0.10 XLM se bloquea al publicar y se devuelve en 24h
                        </div>
                    )}

                    {type !== 'video' && (
                        <button
                            type="submit"
                            className={styles.submitBtn}
                            disabled={(type === 'image' && !imageFile) || (type !== 'image' && !content.trim()) || compressing}
                        >
                            {compressing ? '⏳ Comprimiendo...' : 'Publicar'}
                        </button>
                    )}
                </form>

                <FeedbackModal
                    isOpen={modalState.isOpen}
                    onClose={hideModal}
                    type={modalState.type}
                    title={modalState.title}
                    message={modalState.message}
                    showCloseButton={modalState.showCloseButton}
                    autoClose={modalState.autoClose}
                    autoCloseDelay={modalState.autoCloseDelay}
                />
            </main>
        </div>
    );
}
