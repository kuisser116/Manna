import { useState, useEffect } from 'react';
import styles from './AdminAds.module.css';
import { getPendingAds, approveAd, rejectAd } from '../../api/ads.api';
import { useFeedbackModal } from '../../components/FeedbackModal/useFeedbackModal.js';
import useStore from '../../store';
import { ArrowLeft, Shield } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import logoImg from '../../assets/personaje_1.12.png';

const AdminAds = () => {
    const { user } = useStore();
    const navigate = useNavigate();
    const { showSuccess, showError } = useFeedbackModal();
    const [ads, setAds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [rejecting, setRejecting] = useState(null); // adId in reject flow
    const [rejectReason, setRejectReason] = useState('');
    const [processing, setProcessing] = useState(null);

    useEffect(() => {
        // Guard: solo admins (explicitamente false)
        if (user && user.is_admin === false) {
            navigate('/feed', { replace: true });
            return;
        }
        
        // Si hay usuario y es admin, o si estamos esperando a que cargue
        if (user?.is_admin) {
            fetchPending();
        }
    }, [user, navigate]);

    const fetchPending = () => {
        setLoading(true);
        getPendingAds()
            .then(res => setAds(res.data.pending))
            .catch(() => showError('Error al cargar anuncios'))
            .finally(() => setLoading(false));
    };

    const handleApprove = async (adId) => {
        setProcessing(adId);
        try {
            await approveAd(adId);
            showSuccess('Anuncio Aprobado', 'El anuncio ya está activo en el feed de usuarios.');
            setAds(prev => prev.filter(a => a.id !== adId));
        } catch (err) {
            showError(err.response?.data?.message || 'Error al aprobar');
        } finally {
            setProcessing(null);
        }
    };

    const handleReject = async (adId) => {
        if (!rejectReason || rejectReason.trim().length < 3) {
            showError('La razón debe tener al menos 3 caracteres.');
            return;
        }
        setProcessing(adId);
        try {
            await rejectAd(adId, rejectReason.trim());
            showSuccess('Anuncio Rechazado', 'El anunciante verá la razón en su panel.');
            setAds(prev => prev.filter(a => a.id !== adId));
            setRejecting(null);
            setRejectReason('');
        } catch (err) {
            console.error('Reject Error:', err);
            showError('Error al rechazar', err.response?.data?.message || 'Hubo un problema al procesar el rechazo y el reembolso.');
        } finally {
            setProcessing(null);
        }
    };

    return (
        <div className={styles.portalWrapper}>
            {/* Header Independiente Tipo "Admin Center" */}
            <header className={styles.portalHeader}>
                <div className={styles.headerLeft}>
                    <Link to="/feed" className={styles.backBtn}>
                        <ArrowLeft size={20} />
                        <span>Volver a Ehise</span>
                    </Link>
                    <div className={styles.divider} />
                    <div className={styles.brand}>
                        <img src={logoImg} alt="Ehise" className={styles.headerLogo} />
                        <span className={styles.brandName}>Admin Ads</span>
                    </div>
                </div>
                <div className={styles.headerRight}>
                    <div className={styles.adminBadge}>
                        <Shield size={16} />
                        <span>Admin Access</span>
                    </div>
                </div>
            </header>

            <div className={styles.container}>
                <header className={styles.pageHeader}>
                    <h1 className={styles.title}>Revisión de Campañas</h1>
                    <p className={styles.subtitle}>
                        {loading ? 'Cargando...' : `${ads.length} anuncio${ads.length !== 1 ? 's' : ''} en espera de revisión física.`}
                    </p>
                </header>

                {loading && <div className={styles.loading}>Cargando anuncios pendientes...</div>}

                {!loading && ads.length === 0 && (
                    <div className={styles.empty}>
                        <p>No hay anuncios pendientes de revisión.</p>
                    </div>
                )}

                <div className={styles.adList}>
                    {ads.map(ad => (
                        <div key={ad.id} className={styles.adCard}>
                            {/* ... rest of the card content ... */}
                            <div className={styles.adHeader}>
                                {/* Creative preview */}
                                <div className={styles.adPreviewWrap}>
                                    {ad.media_type === 'video' ? (
                                        <video
                                            src={ad.media_url}
                                            className={styles.adMedia}
                                            controls muted
                                        />
                                    ) : (
                                        <img
                                            src={ad.media_url}
                                            alt={ad.alt_text || ad.title}
                                            className={styles.adMedia}
                                        />
                                    )}
                                </div>

                                {/* Metadata */}
                                <div className={styles.adMeta}>
                                    <h2 className={styles.adTitle}>{ad.title}</h2>
                                    {ad.description && <p className={styles.adDesc}>{ad.description}</p>}

                                    <div className={styles.adDetails}>
                                        <div className={styles.detail}>
                                            <span>Anunciante:</span>
                                            <strong>{ad.advertiser?.display_name || 'Desconocido'} ({ad.advertiser?.email || '-'})</strong>
                                        </div>
                                        <div className={styles.detail}>
                                            <span>Alcance:</span>
                                            <strong>{ad.target_audience === 'regional' ? `Regional (${ad.community_id})` : 'Global'}</strong>
                                        </div>
                                        <div className={styles.detail}>
                                            <span>Tipo:</span>
                                            <strong>{ad.media_type === 'video' ? 'Video' : 'Banner'}</strong>
                                        </div>
                                        <div className={styles.detail}>
                                            <span>Presupuesto:</span>
                                            <strong>${ad.budget_usdc} MXNe</strong>
                                        </div>
                                        <div className={styles.detail}>
                                            <span>CPM:</span>
                                            <strong>${ad.cpm} MXNe</strong>
                                        </div>
                                        <div className={styles.detail}>
                                            <span>Audiencia:</span>
                                            <strong>{ad.target_audience || 'all'}</strong>
                                        </div>
                                        {ad.alt_text && (
                                            <div className={styles.detail}>
                                                <span>Alt text:</span>
                                                <strong>{ad.alt_text}</strong>
                                            </div>
                                        )}
                                        <div className={styles.detail}>
                                            <span>Enviado:</span>
                                            <strong>{new Date(ad.created_at).toLocaleString('es-MX')}</strong>
                                        </div>
                                    </div>

                                    <a href={ad.media_url} target="_blank" rel="noreferrer" className={styles.mediaLink}>
                                        Ver creative completo
                                    </a>
                                </div>
                            </div>

                            {/* Acciones */}
                            {rejecting === ad.id ? (
                                <div className={styles.rejectForm}>
                                    <label>Razón del rechazo (se mostrará al anunciante):</label>
                                    <textarea
                                        rows={3}
                                        value={rejectReason}
                                        onChange={e => setRejectReason(e.target.value)}
                                        placeholder="Ej: Contenido engañoso..."
                                    />
                                    <div className={styles.rejectActions}>
                                        <button
                                            className={styles.confirmRejectBtn}
                                            onClick={() => handleReject(ad.id)}
                                            disabled={processing === ad.id}
                                        >
                                            {processing === ad.id ? 'Procesando...' : 'Confirmar Rechazo'}
                                        </button>
                                        <button
                                            className={styles.cancelBtn}
                                            onClick={() => { setRejecting(null); setRejectReason(''); }}
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.actions}>
                                    <button
                                        className={styles.approveBtn}
                                        onClick={() => handleApprove(ad.id)}
                                        disabled={processing === ad.id}
                                    >
                                        {processing === ad.id ? 'Procesando...' : 'Aprobar'}
                                    </button>
                                    <button
                                        className={styles.rejectBtn}
                                        onClick={() => setRejecting(ad.id)}
                                        disabled={!!processing}
                                    >
                                        Rechazar
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AdminAds;
