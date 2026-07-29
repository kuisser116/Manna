import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';
import { Type, Image, X, Video, MapPin, Search, Send } from 'lucide-react';
import useFeed from '../hooks/useFeed';
import useStore from '../store';

import VideoUploadWizard from '../components/VideoUploadWizard/VideoUploadWizard';
import { uploadPost } from '../api/posts.api';
import { searchVenues } from '../api/venues.api';
import styles from '../styles/pages/CreatePost.module.css';

const API_URL = (import.meta.env.VITE_API_URL || location.origin);

const POST_TYPES = [
  { value: 'micro-text', label: 'Texto', icon: Type },
  { value: 'image', label: 'Imagen', icon: Image },
  { value: 'video', label: 'Video', icon: Video },
];

export default function CreatePost() {
  const [type, setType] = useState('micro-text');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const navigate = useNavigate();

  // Location
  const [locationMode, setLocationMode] = useState('none');
  const [locationZone, setLocationZone] = useState('');
  const [venueSearch, setVenueSearch] = useState('');
  const [venueResults, setVenueResults] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [venueSearching, setVenueSearching] = useState(false);
  const venueTimeoutRef = useRef(null);

  const { createPost } = useFeed();
  const { token, addToast } = useStore();

  // Animación de entrada
  const layoutRef = useRef(null);
  const headerRef = useRef(null);
  const typeRowRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4 })
        .fromTo(typeRowRef.current?.children, { opacity: 0, y: 10, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, stagger: 0.06 }, '-=0.15')
        .fromTo(formRef.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35 }, '-=0.1');
    }, layoutRef);
    return () => ctx.revert();
  }, []);

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setImageFile(file);
  };

  const uploadImage = async () => {
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

  const handleVideoPublish = async ({ videoFile, thumbnailFile, title, description, tags, visibility, scheduledAt }) => {
    addToast('loading', 'Preparando video...');
    try {
      addToast('loading', 'Subiendo video...');
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
        xhr.addEventListener('error', () => reject(new Error('Error de conexion')));
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
      try {
        addToast('loading', 'Subiendo imagen...');
        const result = await uploadImage();
        addToast('success', 'Imagen publicada!');
        setTimeout(() => navigate('/feed'), 2000);
      } catch (err) {
        addToast('error', 'Error al subir imagen', err.message);
      }
    } else {
      try {
        await createPost({ type, content });
        addToast('success', 'Publicado!');
        setTimeout(() => navigate('/feed'), 1400);
      } catch (err) {
        const errorMsg = err.response?.data?.reason || err.response?.data?.message || err.message || 'Intentalo de nuevo';
        addToast('error', 'Error al publicar', errorMsg);
      }
    }
  };

  const maxLength = type === 'micro-text' ? 280 : 1000;

  return (
    <div className={styles.page} ref={layoutRef} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
      <main className={styles.main}>
        <div className={styles.inner}>
          <div className={styles.header} ref={headerRef}>
            <h2 className={styles.title}>Nuevo post</h2>
            <p className={styles.subtitle}>Publica algo que valga la pena.</p>
          </div>

          {/* Tipo — pills, no cards */}
          <div className={styles.typeRow} ref={typeRowRef}>
            {POST_TYPES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className={`${styles.typePill} ${type === value ? styles.typeActive : ''}`}
                onClick={() => setType(value)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className={styles.form} ref={formRef}>

            {/* Texto */}
            {(type !== 'image' && type !== 'video') && (
              <div className={styles.field}>
                <textarea
                  className={styles.textarea}
                  placeholder="¿Qué tienes en la cabeza?"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={5}
                  maxLength={maxLength}
                  autoFocus
                />
                <div className={styles.charCount}>
                  <span className={content.length > maxLength * 0.9 ? styles.charWarn : ''}>
                    {content.length}/{maxLength}
                  </span>
                </div>
              </div>
            )}

            {/* Imagen */}
            {type === 'image' && (
              <div className={styles.field}>
                {imagePreview ? (
                  <div className={styles.imagePreviewWrap}>
                    <img src={imagePreview} alt="" className={styles.imagePreview} />
                    <button
                      type="button"
                      className={styles.removeImage}
                      onClick={() => { setImagePreview(null); setImageFile(null); }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className={styles.imageDrop}>
                    <input type="file" accept="image/*" onChange={handleImageChange} hidden />
                    <div className={styles.imageDropInner}>
                      <Image size={28} />
                      <span>Arrastra o haz clic para subir</span>
                    </div>
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

            {/* Video */}
            {type === 'video' && (
              <VideoUploadWizard
                onPublish={handleVideoPublish}
                onCancel={() => setType('micro-text')}
              />
            )}

            {/* Ubicación */}
            {type !== 'video' && (
              <div className={styles.locationStrip}>
                <button
                  type="button"
                  className={`${styles.locBtn} ${locationMode === 'none' ? styles.locActive : ''}`}
                  onClick={() => { setLocationMode('none'); setSelectedVenue(null); setLocationZone(''); }}
                >
                  <MapPin size={14} />
                  Sin ubicación
                </button>
                <button
                  type="button"
                  className={`${styles.locBtn} ${locationMode === 'zone' ? styles.locActive : ''}`}
                  onClick={() => setLocationMode('zone')}
                >
                  Zona
                </button>
                <button
                  type="button"
                  className={`${styles.locBtn} ${locationMode === 'venue' ? styles.locActive : ''}`}
                  onClick={() => setLocationMode('venue')}
                >
                  Lugar
                </button>

                {locationMode === 'zone' && (
                  <input
                    type="text"
                    placeholder="Ej: Roma Norte, CDMX"
                    value={locationZone}
                    onChange={(e) => setLocationZone(e.target.value)}
                    className={styles.locInput}
                  />
                )}

                {locationMode === 'venue' && (
                  <div className={styles.locVenue}>
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Buscar un lugar..."
                      value={venueSearch}
                      onChange={(e) => {
                        setVenueSearch(e.target.value);
                        if (venueTimeoutRef.current) clearTimeout(venueTimeoutRef.current);
                        if (e.target.value.length < 2) { setVenueResults([]); return; }
                        venueTimeoutRef.current = setTimeout(async () => {
                          setVenueSearching(true);
                          try {
                            const { venues } = await searchVenues(e.target.value);
                            setVenueResults(venues || []);
                          } catch { setVenueResults([]); }
                          setVenueSearching(false);
                        }, 400);
                      }}
                      className={styles.locInput}
                    />
                    {selectedVenue && (
                      <button type="button" className={styles.locClear} onClick={() => { setSelectedVenue(null); setVenueSearch(''); setVenueResults([]); }}>
                        <X size={14} />
                      </button>
                    )}
                    {venueResults.length > 0 && !selectedVenue && (
                      <div className={styles.venueResults}>
                        {venueResults.map(v => (
                          <div key={v.id} className={styles.venueResult} onClick={() => {
                            setSelectedVenue(v);
                            setVenueSearch(v.name);
                            setVenueResults([]);
                          }}>
                            {v.name}
                            <span className={styles.venueResultZone}>{v.zone}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            {type !== 'video' && (
              <div className={styles.submitRow}>
                <button type="submit" className={styles.submitBtn}>
                  <Send size={16} />
                  Publicar
                </button>
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
