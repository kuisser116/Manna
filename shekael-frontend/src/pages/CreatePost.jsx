import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';
import { Type, Image, Upload, X, Video } from 'lucide-react';
import useFeed from '../hooks/useFeed';
import useStore from '../store';

import VideoUploadWizard from '../components/VideoUploadWizard/VideoUploadWizard';
import { checkContent, uploadPost } from '../api/posts.api';
import styles from '../styles/pages/CreatePost.module.css';

const API_URL = (import.meta.env.VITE_API_URL || location.origin);

const POST_TYPES = [
  { value: 'micro-text', label: 'Texto', icon: Type, desc: 'Un pensamiento (max 280 caracteres)' },
  { value: 'image', label: 'Imagen', icon: Image, desc: 'Subida directa — HD permanente' },
  { value: 'video', label: 'Video', icon: Video, desc: 'Streaming Web3 via Livepeer' },
];

export default function CreatePost() {
  const [type, setType] = useState('micro-text');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const navigate = useNavigate();

  const { createPost } = useFeed();
  const { token, addToast } = useStore();

  // — NSFW detection —
  const nsfwModelRef = useRef(null);
  const [nsfwLoaded, setNsfwLoaded] = useState(false);
  const [nsfwDetected, setNsfwDetected] = useState(false);

  const loadNSFWModel = async () => {
    if (nsfwModelRef.current) return;
    try {
      addToast('loading', 'Cargando filtro de seguridad...', 'Protegiendo la comunidad');
      const model = await nsfwjs.load();
      nsfwModelRef.current = model;
      setNsfwLoaded(true);
    } catch (err) {
      console.warn('NSFW model load failed (non-critical):', err.message);
      // Non-critical — app funciona sin esto
    }
  };

  const checkImageNSFW = async (file) => {
    if (!nsfwModelRef.current) return null;
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const predictions = await nsfwModelRef.current.classify(img);
      URL.revokeObjectURL(url);
      const nsfw = predictions.find(p => p.className === 'Porn' || p.className === 'Hentai');
      if (nsfw && nsfw.probability > 0.85) {
        setNsfwDetected(true);
        return nsfw;
      }
      return null;
    } catch (err) {
      console.warn('NSFW check failed:', err.message);
      return null;
    }
  };

  // — Refs para las animaciones GSAP —
  const layoutRef = useRef(null);
  const headerRef = useRef(null);
  const typeGridRef = useRef(null);
  const formRef = useRef(null);
  const textareaWrapRef = useRef(null);
  const imageZoneWrapRef = useRef(null);
  const submitAreaRef = useRef(null);

  // — Animación de entrada —
  useEffect(() => {
    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });

      timeline
        .fromTo(headerRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.5 }
        )
        .fromTo(typeGridRef.current?.children,
          { opacity: 0, y: 16, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.08 },
          '-=0.2'
        )
        .fromTo(formRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.4 },
          '-=0.1'
        );
    }, layoutRef);

    return () => ctx.revert();
  }, []);

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    // El servidor comprime automáticamente (Sharp, JPEG 85, max 2048px)
    setImageFile(file);
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

  // — Video: wizard callback —
  const handleVideoPublish = async ({ videoFile, thumbnailFile, title, description, tags, visibility, scheduledAt }) => {
    const totalSizeMB = (videoFile.size / (1024 * 1024)).toFixed(1);

    addToast('loading', 'Preparando video...', 'Iniciando subida');

    try {
      addToast('loading', 'Subiendo video...', `Preparando ${totalSizeMB} MB...`);

      const formData = new FormData();
      formData.append('video', videoFile);
      if (thumbnailFile) formData.append('thumbnail', thumbnailFile);
      formData.append('title', title);
      if (description) formData.append('description', description);
      if (tags) formData.append('tags', tags);
      formData.append('visibility', visibility);
      if (scheduledAt) formData.append('scheduledAt', scheduledAt);

      const response = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch (e) { reject(new Error('Error parsing response')); }
          } else {
            try {
              const errData = JSON.parse(xhr.responseText);
              reject(new Error(errData.reason || errData.message || 'Error al subir video'));
            } catch (e) { reject(new Error('Error al subir video')); }
          }
        });
        xhr.addEventListener('error', () => { reject(new Error('Error de conexion')); });
        xhr.open('POST', `${API_URL}/upload/video`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });

      addToast('success', 'Video publicado!');
      setTimeout(() => navigate('/feed'), 2000);
    } catch (err) {
      addToast('error', 'Error al subir video', err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (type === 'image' && !imageFile) {
      addToast('error', 'Sin imagen', 'Selecciona una imagen para publicar');
      return;
    }
    if (type !== 'image' && !content.trim()) {
      addToast('error', 'Sin contenido', 'Escribe algo para publicar');
      return;
    }
    if (type === 'image') {
      const sizeKB = (imageFile.size / 1024).toFixed(0);
      try {
        // NSFW check (client-side, opcional)
        if (!nsfwModelRef.current) await loadNSFWModel();
        const nsfwResult = await checkImageNSFW(imageFile);
        if (nsfwResult) {
          addToast('warning', 'Contenido sensible detectado', `La imagen será marcada para revisión (${(nsfwResult.probability * 100).toFixed(0)}% ${nsfwResult.className}).`);
        }

        addToast('loading', 'Subiendo imagen...', `Enviando ${sizeKB} KB al servidor`);
        const result = await uploadImageToIPFS();
        const cid = result.cid?.slice(0, 16);
        addToast('success', 'Imagen publicada!', result.cid ? `CID: ${cid}...` : 'Modo demo');
        setTimeout(() => navigate('/feed'), 2000);
      } catch (err) {
        addToast('error', 'Error al subir imagen', err.message);
      }
    } else {
      try {
        await createPost({ type, content });
        addToast('success', 'Publicado!', 'Tu post ya esta en el feed');
        setTimeout(() => navigate('/feed'), 1400);
      } catch (err) {
        const errorMsg = err.response?.data?.reason || err.response?.data?.message || err.message || 'Intentalo de nuevo';
        addToast('error', 'Error al publicar', errorMsg);
      }
    }
  };

  const maxLength = type === 'micro-text' ? 280 : 1000;

  return (
    <div className={styles.layout} ref={layoutRef} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
      <main className={styles.main}>
        <div className={styles.header} ref={headerRef}>
          <h2 className={styles.title}>Nuevo post</h2>
          <p className={styles.subtitle}>Publica algo que valga la pena. Aqui el contenido importa.</p>
        </div>

        {/* Selector de tipo */}
        <div className={styles.typeGrid} ref={typeGridRef}>
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

        <div className={styles.formCard}>
        <form onSubmit={handleSubmit} className={styles.form} ref={formRef}>
          {/* Zona de imagen */}
          {type === 'image' && (
            <div className={styles.imageZone} ref={imageZoneWrapRef}>
              {imagePreview && (
                <div className={styles.imagePreviewWrap}>
                  <img src={imagePreview} alt="Preview" className={styles.imagePreview} />
                  <button
                    type="button"
                    className={styles.removeImage}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {!imagePreview && (
                <label className={styles.uploadLabel}>
                  <Upload size={26} />
                  <span>Haz clic o arrastra una imagen</span>
                  <span className={styles.uploadSub}>Se comprime automaticamente · HD max 200 MB</span>
                  <input type="file" accept="image/*" onChange={handleImageChange} hidden />
                </label>
              )}
              <textarea
                className={styles.textarea}
                placeholder="Descripcion (opcional)"
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

          {/* Textarea texto */}
          {(type !== 'image' && type !== 'video') && (
            <div className={styles.textareaWrap} ref={textareaWrapRef}>
              <textarea
                className={styles.textarea}
                placeholder="¿Que tienes en la cabeza? Dilo sin filtros."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
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
            <div className={styles.submitArea} ref={submitAreaRef}>
              <button
                type="submit"
                className={styles.submitBtn}
              >
              </button>
            </div>
          )}
        </form>
        </div>

      </main>
    </div>
  );
}
