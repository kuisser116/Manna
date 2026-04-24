import { useState, useEffect, useRef } from 'react';
import {
    createAd, getMyCampaigns, getAdvertiserDashboard,
    saveConsent, getConsentProfile, revokeConsent, uploadAdMedia,
    toggleAdStatus, deleteAdCampaign, preValidateContent
} from '../../api/ads.api';
import { generateThumbnail } from '../../utils/mediaUtils';
import { ArrowLeft, ExternalLink, Play, Pause, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/posts.api';
import { getRegionalCauses } from '../../api/transactions.api';
import logoImg from '../../assets/personaje_1.12.png';
import FeedbackModal from '../../components/FeedbackModal/FeedbackModal';
import useFeedbackModal from '../../components/FeedbackModal/useFeedbackModal';
import styles from './Advertise.module.css';

const STATES = [
    'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
    'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato',
    'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León',
    'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa',
    'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'
];

// Componente simple para la vista previa
function AdPreview({ title, mediaUrl, mediaType, altText, promoText, promoCode }) {
    return (
        <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '12px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ marginBottom: '12px', color: 'var(--color-primary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Vista Previa</h3>
            <div style={{ background: 'var(--color-bg)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ marginBottom: '8px', color: 'var(--color-text)', fontSize: '0.95rem' }}>{title || 'Título del anuncio'}</h4>
                {mediaUrl ? (
                    mediaType === 'video' ?
                        <video src={mediaUrl} controls style={{ width: '100%', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} /> :
                        <img src={mediaUrl} alt={altText || 'Ad'} style={{ width: '100%', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                ) : (
                    <div style={{ height: '150px', background: 'var(--color-border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.95rem', fontWeight: 600 }}>Espacio Creativo</div>
                )}

                {promoText && (
                    <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(212, 175, 55, 0.1)', border: '1px dashed var(--color-primary)', borderRadius: '6px', textAlign: 'center' }}>
                        <strong style={{ color: 'var(--color-primary)', fontSize: '0.9rem', display: 'block' }}>🎁 Cupón: {promoText}</strong>
                        {promoCode && <span style={{ background: '#000', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem', marginTop: '4px', display: 'inline-block', fontFamily: 'monospace' }}>{promoCode}</span>}
                    </div>
                )}
            </div>
        </div>
    );
}

const INTEREST_OPTIONS = [
    { key: 'tech', label: 'Tecnología' },
    { key: 'faith', label: 'Fe' },
    { key: 'sports', label: 'Deportes' },
    { key: 'art', label: 'Arte' },
    { key: 'music', label: 'Música' },
    { key: 'food', label: 'Gastronomía' },
    { key: 'travel', label: 'Viajes' },
    { key: 'fashion', label: 'Moda' },
    { key: 'gaming', label: 'Gaming' },
    { key: 'education', label: 'Educación' },
];

const STATUS_LABELS = {
    pending_review: { label: 'En Revisión', color: '#f59e0b' },
    active: { label: 'Activo', color: '#22c55e' },
    rejected: { label: 'Rechazado', color: '#ef4444' },
    paused: { label: 'Pausado', color: '#6b7280' },
    finished: { label: 'Terminado', color: '#6b7280' },
};

// ─────────────────────────────────────────────────────
// TAB 1: Nueva Campaña
// ─────────────────────────────────────────────────────
function NewCampaignTab() {
    const { modalState, hideModal, showSuccess, showError } = useFeedbackModal();
    const [loadingText, setLoadingText] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [previewUrl, setPreviewUrl] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const fileRef = useRef(null);
    const [formData, setFormData] = useState({
        scope: 'global',
        communityId: '',
        title: '',
        description: '',
        mediaUrl: '',
        mediaType: 'banner',
        budgetMxne: 10,
        cpm: 1.0, // CPM Fijo Automático
        targetAudience: 'all',
        altText: '',
        promoText: '',
        promoCode: '',
    });
    const [specs, setSpecs] = useState({ ok: null, error: null });

    useEffect(() => {
        getRegionalCauses()
            .then(res => {
                if (res.data && res.data.state) {
                    setFormData(prev => ({ ...prev, communityId: res.data.state }));
                }
            })
            .catch(() => { });
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: ['budgetMxne', 'cpm'].includes(name) ? parseFloat(value) : value
        }));
        if (name === 'mediaUrl') setPreviewUrl(value);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const sizeMb = file.size / (1024 * 1024);
        const maxMb = formData.mediaType === 'video' ? 50 : 5;

        if (sizeMb > maxMb) {
            setSpecs({ ok: false, error: `El archivo pesa ${sizeMb.toFixed(1)}MB, máximo ${maxMb}MB.` });
            return;
        }
        setSpecs({ ok: true, error: null });

        // Preview local
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        setSelectedFile(file);
        setFormData(prev => ({ ...prev, mediaUrl: objectUrl }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (specs.ok === false) { showError(specs.error); return; }
        if (formData.budgetMxne < 1) { showError('El presupuesto mínimo es $1 MXNe.'); return; }

        // Si no hay archivo subir
        if (!selectedFile) {
            showError('Debes subir un archivo para el anuncio.');
            return;
        }

        if (formData.scope === 'regional' && !formData.communityId) {
            showError('Comunidad requerida para anuncios regionales.');
            return;
        }

        setLoadingText('Validando que todo sea correcto...');
        try {
            // 1. Generar miniatura y validar con IA ANTES de subir el archivo pesado
            let thumbnailBase64 = null;
            if (selectedFile) {
                thumbnailBase64 = await generateThumbnail(selectedFile);
            }

            const combinedContent = `Título: ${formData.title}\nDescripción: ${formData.description || ''}\nPromoción: ${formData.promoText || ''}`;
            const aiCheck = await preValidateContent({
                text: combinedContent,
                type: formData.mediaType || 'banner',
                thumbnailBase64
            });

            if (aiCheck.data.verdict === 'rejected') {
                showError(
                    'Contenido rechazado por la IA',
                    aiCheck.data.reason || 'Tu anuncio no cumple con las políticas de publicidad.'
                );
                setLoadingText('');
                return;
            }

            let finalMediaUrl = formData.mediaUrl;

            if (selectedFile) {
                setLoadingText('Subiendo archivos...');
                // Subir archivo a R2 después de que la IA aprobó la miniatura/texto
                const uploadRes = await uploadAdMedia(selectedFile, (progress) => {
                    setUploadProgress(progress);
                });
                finalMediaUrl = uploadRes.data.mediaUrl;
            }

            setLoadingText('Guardando campaña...');
            const adPayload = { ...formData, mediaUrl: finalMediaUrl };

            if (formData.scope === 'regional') {
                await api.post('/ads/create-local', {
                    title: formData.title,
                    content: formData.description,
                    budget_mxne: Number(formData.budgetMxne),
                    media_url: finalMediaUrl,
                    media_type: formData.mediaType,
                    community_id: formData.communityId,
                    promoText: formData.promoText,
                    promoCode: formData.promoCode
                });
            } else {
                const res = await createAd({
                    title: formData.title,
                    description: formData.description,
                    mediaUrl: finalMediaUrl,
                    mediaType: formData.mediaType,
                    budget_mxne: Number(formData.budgetMxne),
                    cpm: formData.cpm,
                    targetAudience: formData.targetAudience,
                    altText: formData.altText,
                    promoText: formData.promoText,
                    promoCode: formData.promoCode
                });
            }

            showSuccess(
                '¡Campaña enviada a revisión! 🎉',
                'Un administrador la revisará y te avisaremos cuando esté activa.'
            );
            setFormData({ title: '', description: '', mediaUrl: '', mediaType: 'banner', budgetMxne: 10, cpm: 1.0, targetAudience: 'all', altText: '', promoText: '', promoCode: '' });
            setPreviewUrl('');
            setSelectedFile(null);
            setUploadProgress(0);
            setSpecs({ ok: null, error: null });
        } catch (error) {
            console.error('Submit error:', error);
            showError(error.response?.data?.message || error.message || 'Error al crear la campaña');
        } finally {
            setLoadingText('');
            setUploadProgress(0);
        }
    };

    const budgetWarning = formData.budgetMxne < 5;

    return (
        <div className={styles.tabContent}>
            <div className={styles.twoCol}>
                <section className={styles.formSection}>
                    <form className={styles.form} onSubmit={handleSubmit}>

                        {/* Alcance del Anuncio */}
                        <div className={styles.fieldGroup}>
                            <h3 className={styles.groupTitle}>Alcance del Anuncio</h3>
                            <div className={styles.fieldRow}>
                                <div className={styles.field}>
                                    <label>Tipo de Alcance</label>
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(p => ({ ...p, scope: 'regional' }))}
                                            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: formData.scope === 'regional' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', background: formData.scope === 'regional' ? 'var(--color-primary)' : 'var(--color-surface)', color: formData.scope === 'regional' ? '#000' : 'var(--color-text)', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            Regional (Local)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(p => ({ ...p, scope: 'global' }))}
                                            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: formData.scope === 'global' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', background: formData.scope === 'global' ? 'var(--color-primary)' : 'var(--color-surface)', color: formData.scope === 'global' ? '#000' : 'var(--color-text)', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            Global (Para todos)
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {formData.scope === 'regional' && (
                                <div className={styles.field} style={{ marginTop: '16px' }}>
                                    <label>Estado Objetivo (Región) *</label>
                                    <select
                                        name="communityId"
                                        value={formData.communityId}
                                        onChange={handleChange}
                                        required
                                        style={{ width: '100%', padding: '0.7rem 0.9rem', borderRadius: '8px', background: '#1a1a1a', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white', fontSize: '0.95rem', marginTop: '4px' }}
                                    >
                                        <option value="">Selecciona un estado...</option>
                                        {STATES.map((state) => (
                                            <option key={state} value={state}>{state}</option>
                                        ))}
                                    </select>
                                    <p style={{ fontSize: '13px', color: 'var(--color-text-white)', marginTop: '6px' }}>
                                        Tu anuncio solo se mostrará a usuarios cuya Región coincida. El 10% del presupuesto se destinará al Fondo Regional de este estado.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Información del anuncio */}
                        <div className={styles.fieldGroup}>
                            <h3 className={styles.groupTitle}>Información del Anuncio</h3>
                            <div className={styles.field}>
                                <label htmlFor="title">Título del Anuncio *</label>
                                <input id="title" name="title" type="text" value={formData.title}
                                    onChange={handleChange} placeholder="Ej: Nueva Colección de Verano" required />
                            </div>
                            <div className={styles.field}>
                                <label htmlFor="description">Descripción breve</label>
                                <textarea id="description" name="description" value={formData.description}
                                    onChange={handleChange} rows={2} placeholder="¿Qué hace especial tu producto?" />
                            </div>
                            <div className={styles.field}>
                                <label htmlFor="altText">Texto alternativo (accesibilidad)</label>
                                <input id="altText" name="altText" type="text" value={formData.altText}
                                    onChange={handleChange} placeholder="Describe la imagen para lectores de pantalla" />
                            </div>
                        </div>

                        {/* Promoción Adicional Opcional */}
                        <div className={styles.fieldGroup}>
                            <h3 className={styles.groupTitle} style={{ color: 'var(--color-primary)' }}>🎁 Recompensa Adicional (Opcional)</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-white)', marginBottom: '12px' }}>Motiva a los usuarios a visitar tu negocio o web regalando un cupón que solo se revelará cuando vean el anuncio completo.</p>
                            <div className={styles.fieldRow}>
                                <div className={styles.field}>
                                    <label htmlFor="promoText">Oferta / Promoción</label>
                                    <input id="promoText" name="promoText" type="text" value={formData.promoText}
                                        onChange={handleChange} placeholder="Ej: 2x1 en Pizzas hoy!" />
                                </div>
                                <div className={styles.field}>
                                    <label htmlFor="promoCode">Código de Canje</label>
                                    <input id="promoCode" name="promoCode" type="text" value={formData.promoCode}
                                        onChange={handleChange} placeholder="Ej: ASERIA2X1" />
                                </div>
                            </div>
                        </div>

                        {/* Creative */}
                        <div className={styles.fieldGroup}>
                            <h3 className={styles.groupTitle}>Creative</h3>
                            <div className={styles.fieldRow}>
                                <div className={styles.field}>
                                    <label htmlFor="mediaType">Tipo de Media</label>
                                    <select id="mediaType" name="mediaType" value={formData.mediaType} onChange={handleChange}>
                                        <option value="banner">Banner (Imagen)</option>
                                        <option value="video">Video (MP4)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Specs checklist */}
                            <div className={styles.specsBox} style={{ background: '#1a1a1a', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                                <p className={styles.specsTitle} style={{ color: 'white', fontWeight: 600, marginBottom: '8px' }}>Especificaciones requeridas</p>
                                <ul className={styles.specsList} style={{ color: '#a1a1a1', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '6px', listStyle: 'none', padding: 0 }}>
                                    <li className={styles.specOk} style={{ color: 'var(--color-text)' }}>Formato: {formData.mediaType === 'video' ? 'MP4, WebM' : 'JPG, PNG, WebP, GIF'}</li>
                                    <li className={styles.specOk} style={{ color: 'var(--color-text)' }}>Tamaño máximo: {formData.mediaType === 'video' ? '50MB' : '5MB'}</li>
                                    {formData.mediaType === 'video' && <li className={styles.specOk} style={{ color: 'var(--color-text)' }}>Duración máxima: 60 segundos</li>}
                                    <li className={styles.specOk} style={{ color: 'var(--color-text)' }}>Ratio recomendado: 16:7 (landscape)</li>
                                    <li className={`${styles.specOk} ${specs.ok === false ? styles.specErr : ''}`} style={{ color: specs.ok === false ? '#ef4444' : 'var(--color-text)' }}>
                                        {specs.ok === false ? `${specs.error}` : (specs.ok === true ? 'Archivo válido' : 'Sube tu archivo para validar')}
                                    </li>
                                </ul>
                            </div>

                            <div className={styles.field}>
                                <label>Archivo del anuncio</label>
                                <div className={styles.uploadArea} onClick={() => fileRef.current?.click()}>
                                    <input ref={fileRef} type="file"
                                        accept={formData.mediaType === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/gif'}
                                        onChange={handleFileChange} style={{ display: 'none' }} />
                                    {previewUrl ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: '#22c55e', fontWeight: 'bold' }}> {selectedFile?.name || 'Archivo seleccionado'}</span>
                                            <small>Haz clic para cambiar el archivo</small>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                            <span>Haz clic para subir o arrastra el archivo aquí</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Presupuesto y targeting estilo Google Ads */}
                        <div className={styles.fieldGroup}>
                            <h3 className={styles.groupTitle}>Presupuesto de la Campaña</h3>
                            <div className={styles.fieldRow}>
                                <div className={styles.field}>
                                    <label htmlFor="budgetMxne">Presupuesto Total (MXNe) *</label>
                                    <div className={styles.budgetInput}>
                                        <input id="budgetMxne" name="budgetMxne" type="number" min="1" step="0.5"
                                            value={formData.budgetMxne} onChange={handleChange} required />
                                        <span className={styles.currency}>MXNe</span>
                                    </div>
                                    {budgetWarning && (
                                        <p className={styles.warning}>Con menos de $5 MXNe tu campaña podría tener interrupciones frecuentes.</p>
                                    )}
                                </div>
                                <div className={styles.field}>
                                    <label>Alcance Estimado:</label>
                                    <div className={styles.estimateBox}>
                                        <span>Personas Estimadas:</span>
                                        <strong>{((formData.budgetMxne / 1.0) * 1000).toLocaleString()}</strong>
                                    </div>
                                    <p className={styles.reviewNote} style={{ marginTop: '0.4rem', textAlign: 'left', fontSize: '0.75rem' }}>
                                        * Basado en un CPM automático de $1.00 MXNe. Pago por atención ≥5s.
                                    </p>
                                </div>
                            </div>

                        </div>


                        <button type="submit" className={styles.submitBtn} disabled={!!loadingText}>
                            {loadingText ? (uploadProgress > 0 && loadingText === 'Subiendo archivos...' ? `Subiendo... ${uploadProgress}%` : loadingText) : 'Iniciar campaña'}
                        </button>
                        <p className={styles.reviewNote} style={{ color: '#a1a1a1' }}>Tu campaña se reservará y protegerá tu saldo on-chain hasta su aprobación automática (24h).</p>
                    </form>
                </section>

                <aside className={styles.sidePanel}>
                    <AdPreview
                        title={formData.title}
                        mediaUrl={previewUrl}
                        mediaType={formData.mediaType}
                        altText={formData.altText}
                        promoText={formData.promoText}
                        promoCode={formData.promoCode}
                    />

                    <div className={styles.infoCard} style={{ background: '#1a1a1a', padding: '20px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                        <h3 style={{ color: 'var(--color-primary)', marginBottom: '16px', fontSize: '1rem' }}>¿Por qué Aseria Ads?</h3>
                        <ul className={styles.infoList} style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: '#a1a1a1', fontSize: '0.85rem', listStyle: 'none', padding: 0 }}>
                            <li><strong style={{ color: 'white', display: 'block', marginBottom: '2px' }}>Atención Genuina</strong> Solo pagas cuando el usuario realmente ve tu anuncio (≥5s). Sin bots, sin impresiones falsas.</li>
                            <li><strong style={{ color: 'white', display: 'block', marginBottom: '2px' }}>Transparencia Absoluta</strong> Todo el presupuesto es auditable en el blockchain. Puedes verificar cada pago en tiempo real.</li>
                            <li><strong style={{ color: 'white', display: 'block', marginBottom: '2px' }}>Sin Intermediarios</strong> Gracias a **Soroban y Rust**, tu inversión llega directo a la comunidad sin comisiones ocultas.</li>
                        </ul>
                    </div>
                </aside>
            </div>

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
        </div>
    );
}

// ─────────────────────────────────────────────────────
// TAB 2: Mis Campañas
// ─────────────────────────────────────────────────────
function MyCampaignsTab() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const { modalState, hideModal, showSuccess, showError } = useFeedbackModal();
    const [actionLoading, setActionLoading] = useState(null);

    const loadCampaigns = () => {
        setLoading(true);
        getMyCampaigns()
            .then(res => {
                const mapped = (res.data.campaigns || []).map(c => ({
                    ...c,
                    budget_mxne: c.budget_usdc, // Map columns
                    spent_mxne: c.spent_usdc
                }));
                setCampaigns(mapped);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadCampaigns();
    }, []);

    const handleToggleStatus = async (id, currentStatus) => {
        if (actionLoading) return;
        const newStatus = currentStatus === 'active' ? 'paused' : 'active';
        setActionLoading(id);
        try {
            await toggleAdStatus(id, newStatus);
            setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
            showSuccess('Éxito', `Campaña ${newStatus === 'active' ? 'reanudada' : 'pausada'} correctamente`, true);
        } catch (error) {
            showError('Error', error.response?.data?.message || 'Error al cambiar estado');
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (id) => {
        if (actionLoading) return;
        if (!window.confirm('¿Estás seguro de que deseas eliminar esta campaña? Esta acción no se puede deshacer.')) return;

        setActionLoading(id);
        try {
            await deleteAdCampaign(id);
            setCampaigns(prev => prev.filter(c => c.id !== id));
            showSuccess('Eliminado', 'La campaña fue eliminada correctamente', true);
        } catch (error) {
            showError('Error', error.response?.data?.message || 'Error al eliminar campaña');
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) return <div className={styles.loading}>Cargando campañas...</div>;
    if (!campaigns || !Array.isArray(campaigns) || !campaigns.length) return <div className={styles.empty}>Aún no tienes campañas. ¡Crea tu primera en "Nueva Campaña"!</div>;

    return (
        <div className={styles.tabContent}>
            <div className={styles.campaignList}>
                {campaigns.map(campaign => {
                    const statusInfo = STATUS_LABELS[campaign.status] || { label: campaign.status, color: '#6b7280' };
                    const pct = campaign.budget_mxne > 0
                        ? Math.min(100, ((campaign.spent_mxne || 0) / campaign.budget_mxne) * 100)
                        : 0;
                    return (
                        <div key={campaign.id} className={styles.campaignCard}>
                            <div className={styles.campaignHeader}>
                                {campaign.media_url && (
                                    campaign.media_type === 'video'
                                        ? <video src={campaign.media_url} className={styles.campaignThumb} muted />
                                        : <img src={campaign.media_url} alt={campaign.title} className={styles.campaignThumb} />
                                )}
                                <div className={styles.campaignInfo}>
                                    <div className={styles.campaignTitleRow}>
                                        <h3 className={styles.campaignTitle}>{campaign.title}</h3>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span className={styles.statusBadge} style={{ background: statusInfo.color + '22', color: statusInfo.color, border: `1px solid ${statusInfo.color}44` }}>
                                                {statusInfo.label}
                                            </span>
                                            {/* Action Buttons */}
                                            {['active', 'paused'].includes(campaign.status) && (
                                                <button
                                                    onClick={() => handleToggleStatus(campaign.id, campaign.status)}
                                                    disabled={actionLoading === campaign.id}
                                                    style={{ background: 'transparent', border: 'none', color: campaign.status === 'active' ? '#f59e0b' : '#22c55e', cursor: 'pointer', padding: '4px' }}
                                                    title={campaign.status === 'active' ? 'Pausar campaña' : 'Reanudar campaña'}
                                                >
                                                    {campaign.status === 'active' ? <Pause size={18} /> : <Play size={18} />}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(campaign.id)}
                                                disabled={actionLoading === campaign.id}
                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                title="Eliminar campaña"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                    {campaign.status === 'rejected' && campaign.rejection_reason && (
                                        <p className={styles.rejectionReason}>Razón: {campaign.rejection_reason}</p>
                                    )}
                                    <div className={styles.campaignMeta}>
                                        <span>Audience: {campaign.target_audience === 'all' ? 'Todos los usuarios' : campaign.target_audience}</span>
                                        <span>CPM ${campaign.cpm}</span>
                                        <span>Fecha: {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString('es-MX') : 'Reciente'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.campaignStats}>
                                <div className={styles.statItem}>
                                    <span className={styles.statLabel}>Impresiones</span>
                                    <strong className={styles.statValue}>{(campaign.impressions || 0).toLocaleString()}</strong>
                                </div>
                                <div className={styles.statItem}>
                                    <span className={styles.statLabel}>Completions</span>
                                    <strong className={styles.statValue}>{(campaign.completions || 0).toLocaleString()}</strong>
                                </div>
                                <div className={styles.statItem}>
                                    <span className={styles.statLabel}>Completion Rate</span>
                                    <strong className={styles.statValue}>{campaign.completion_rate || 0}%</strong>
                                </div>
                                <div className={styles.statItem}>
                                    <span className={styles.statLabel}>Gasto</span>
                                    <strong className={styles.statValue}>{(campaign.spent_mxne || 0).toFixed(2)} MXNe</strong>
                                </div>
                            </div>

                            <div className={styles.budgetBar}>
                                <div className={styles.budgetBarInner} style={{ width: `${pct}%` }} />
                            </div>
                            <div className={styles.budgetLabels}>
                                <span>Gastado: {(campaign.spent_mxne || 0).toFixed(2)} MXNe</span>
                                <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Disponible: {(campaign.budget_mxne - (campaign.spent_mxne || 0)).toFixed(2)} MXNe</span>
                                <span>Total: {campaign.budget_mxne} MXNe</span>
                            </div>
                        </div>
                    );
                })}
            </div>
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
        </div>
    );
}

// ─────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────
const TABS = [
    { id: 'new', label: 'Nueva Campaña' },
    { id: 'campaigns', label: 'Mis Campañas' },
];

const Advertise = () => {
    const [activeTab, setActiveTab] = useState('new');

    return (
        <div className={styles.portalWrapper}>
            {/* Header Independiente Tipo "Google Ads" */}
            <header className={styles.portalHeader}>
                <div className={styles.headerLeft}>
                    <Link to="/feed" className={styles.backBtn}>
                        <ArrowLeft size={20} />
                        <span>Volver a Aseria</span>
                    </Link>
                    <div className={styles.divider} />
                    <div className={styles.brand}>
                        <img src={logoImg} alt="Aseria" className={styles.headerLogo} />
                        <span className={styles.brandName}>Aseria <span className={styles.brandAccent}>Ads</span></span>
                    </div>
                </div>
                <div className={styles.headerRight}>
                </div>
            </header>

            <div className={styles.container}>
                <header className={styles.pageHeader}>
                    <h1 className={styles.title}>Centro de Publicidad</h1>
                    <p className={styles.subtitle}>Crea y gestiona tus campañas verificadas on-chain en Stellar.</p>
                </header>

                <div className={styles.tabs}>
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'new' && <NewCampaignTab />}
                {activeTab === 'campaigns' && <MyCampaignsTab />}
            </div>
        </div>
    );
};

export default Advertise;
