import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../../styles/pages/CreateAd.module.css';
import useFeedbackModal from '../../components/FeedbackModal/useFeedbackModal';
import FeedbackModal from '../../components/FeedbackModal/FeedbackModal';
import api from '../../api/posts.api';

export default function CreateAd() {
  const [scope, setScope] = useState('regional');
  const [budget, setBudget] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [communityId, setCommunityId] = useState('');

  const { modalState, showLoading, showError, showSuccess, hideModal } = useFeedbackModal();
  const navigate = useNavigate();

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!budget || !title || !content || !mediaUrl) {
        showError('Campos incompletos', 'Por favor llena todos los campos');
        return;
    }
    if (scope === 'regional' && !communityId) {
        showError('Comunidad requerida', 'Para anuncios regionales, ingresa el ID de tu comunidad');
        return;
    }

    showLoading('Creando anuncio', 'Bloqueando presupuesto en Stellar...');
    try {
        if (scope === 'regional') {
            await api.post('/ads/create-local', {
                title, content, budget_usdc: budget, media_url: mediaUrl, media_type: 'banner', community_id: communityId
            });
        } else {
            await api.post('/ads/create', {
                title, description: content, budgetUsdc: budget, mediaUrl, mediaType: 'banner'
            });
        }
        showSuccess('¡Anuncio Creado!', 'Tu presupuesto ha sido bloqueado y el anuncio está activo.', true);
        setTimeout(() => navigate('/ads-studio/dashboard'), 2000);
    } catch (error) {
        hideModal();
        showError('Error al crear anuncio', error.response?.data?.message || error.message);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Crear Anuncio</h1>
        <p>Llega a tu audiencia y apoya a la comunidad al mismo tiempo.</p>
      </div>

      <form onSubmit={handleCreate}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Alcance del Anuncio</label>
          <div className={styles.toggleContainer}>
            <button type="button" className={`${styles.toggleBtn} ${scope === 'regional' ? styles.active : ''}`} onClick={() => setScope('regional')}>📍 Regional (Local)</button>
            <button type="button" className={`${styles.toggleBtn} ${scope === 'global' ? styles.active : ''}`} onClick={() => setScope('global')}>🌐 Global (Para todos)</button>
          </div>
        </div>

        {scope === 'regional' && (
          <div className={styles.formGroup}>
            <label className={styles.label}>ID de la Comunidad</label>
            <input className={styles.input} type="text" placeholder="Ej: mx-nl-mty" value={communityId} onChange={(e) => setCommunityId(e.target.value)} />
          </div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.label}>Título Corto</label>
          <input className={styles.input} type="text" placeholder="¡Tacos 2x1!" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Texto del Anuncio</label>
          <textarea className={styles.input} rows="3" placeholder="Descripción de tu oferta o negocio..." value={content} onChange={(e) => setContent(e.target.value)} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>URL de Imagen/Media</label>
          <input className={styles.input} type="text" placeholder="https://..." value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Presupuesto (MXNe)</label>
          <input className={styles.input} type="number" step="0.01" min="1" placeholder="Ej: 5.00" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </div>

        <button type="submit" className={styles.submitBtn}>Crear y Pagar</button>
      </form>
      <FeedbackModal {...modalState} onClose={hideModal} />
    </div>
  );
}
