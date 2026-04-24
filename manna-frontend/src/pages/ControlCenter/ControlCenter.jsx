import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, RotateCcw, Search, Eye } from 'lucide-react';
import useStore from '../../store';
import { useFeedbackModal } from '../../components/FeedbackModal/useFeedbackModal.js';
import styles from './ControlCenter.module.css';

export default function ControlCenter() {
    const { token, user } = useStore();
    const { showSuccess, showError } = useFeedbackModal();
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending'); // 'pending' | 'appealed' | 'resolved'
    
    const getDisplayContent = (post) => {
        if (!post?.content) return 'Contenido multimedia';
        if (post.type === 'micro-text' || post.type === 'capsule') {
            return post.content;
        }
        
        // Para imagen/video, el formato es URL|||CID|||Caption o CID|||Title
        const parts = post.content.split('|||');
        if (post.type === 'image') return parts[2] || 'Sin descripción';
        if (post.type === 'video') return post.video_title || parts[1] || 'Sin título';
        
        return post.content;
    };

    const getMediaUrl = (post) => {
        if (!post?.content) return null;
        if (post.type === 'image') return post.content.split('|||')[0];
        if (post.type === 'video') return post.video_thumbnail_url || null;
        return null;
    };

    const fetchQueue = async () => {
        setLoading(true);
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
            const res = await fetch(`${API_URL}/moderation/admin/queue?status=${filter}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setQueue(data.queue || []);
        } catch (error) {
            showError('Error', 'No se pudo cargar la cola de moderación');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) fetchQueue();
    }, [filter, token]);

    const handleAction = async (postId, action, reason = '') => {
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
            const res = await fetch(`${API_URL}/moderation/admin/resolve`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ postId, action, reason })
            });

            if (res.ok) {
                showSuccess('Acción completada', `El reporte ha sido marcado como ${action}.`);
                // Actualización optimista: lo quitamos de la lista local
                setQueue(prev => prev.filter(item => item.post_id !== postId));
            } else {
                showError('Error', 'No se pudo procesar la acción');
            }
        } catch (error) {
            showError('Error', 'Fallo de conexión');
        }
    };

    if (!user?.is_admin) {
        return <div className={styles.state}>No tienes permisos para acceder aquí.</div>;
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.titleBox}>
                    <Shield className={styles.icon} size={32} />
                    <div>
                        <h1>Aseria Control Center</h1>
                        <p>Gestión global de seguridad, moderación y apelaciones.</p>
                        <a href="/admin/ads" className={styles.adsAdminLink} style={{ color: 'var(--color-primary)', fontSize: '0.85rem', fontWeight: 600, marginTop: '8px', display: 'inline-block' }}>
                            Ir a Gestión de Anuncios
                        </a>
                    </div>
                </div>
                
                <div className={styles.tabs}>
                    <button 
                        className={filter === 'pending' ? styles.activeTab : ''} 
                        onClick={() => setFilter('pending')}
                    >
                        <AlertTriangle size={16} /> Pendientes
                    </button>
                    <button 
                        className={filter === 'appealed' ? styles.activeTab : ''} 
                        onClick={() => setFilter('appealed')}
                    >
                        <RotateCcw size={16} /> Apelaciones
                    </button>
                    <button 
                        className={filter === 'resolved' ? styles.activeTab : ''} 
                        onClick={() => setFilter('resolved')}
                    >
                        <CheckCircle size={16} /> Historial
                    </button>
                </div>
            </header>

            <main className={styles.content}>
                {loading ? (
                    <div className={styles.state}>Cargando cola de moderación...</div>
                ) : queue.length === 0 ? (
                    <div className={styles.state}>No hay elementos que requieran atención en esta categoría.</div>
                ) : (
                    <div className={styles.grid}>
                        {queue.map(item => (
                            <div key={item.id} className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <span className={styles.typeBadge}>{item.post?.type}</span>
                                    <span className={styles.reportCount}>{item.reports?.length || 0} reportes</span>
                                    <span className={styles.date}>{new Date(item.created_at).toLocaleString()}</span>
                                </div>

                                <div className={styles.postPreview}>
                                    {getMediaUrl(item.post) && (
                                        <div className={styles.mediaContainer}>
                                            <img src={getMediaUrl(item.post)} alt="Preview" className={styles.thumbnail} />
                                        </div>
                                    )}
                                    <p className={styles.postContent}>{getDisplayContent(item.post).substring(0, 100)}</p>
                                    <div className={styles.authorInfo}>
                                        Por: <strong>{item.post?.author?.display_name}</strong> ({item.post?.author?.email})
                                    </div>
                                    <a 
                                        href={`/post/${item.post_id}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className={styles.viewPostBtn}
                                    >
                                        <Eye size={14} /> Ver publicación
                                    </a>
                                </div>

                                <div className={styles.aiReason}>
                                    <div className={styles.reasonTitle}>Veredicto IA:</div>
                                    <p>{item.ai_verdict === 'rejected' ? 'Rechazado' : 'Aprobado'} ({item.ai_confidence ? (item.ai_confidence * 100).toFixed(0) : 0}% confianza)</p>
                                    <p className={styles.reasonText}>"{item.ai_reason || 'Sin razón especificada'}"</p>
                                </div>

                                <div className={styles.userReasons}>
                                    <div className={styles.reasonTitle}>Motivos de reportes:</div>
                                    <ul className={styles.reasonsList}>
                                        {item.reports?.map((r, idx) => (
                                            <li key={r.id || idx}>
                                                <strong>{r.reporter?.display_name || 'Anónimo'}:</strong> {r.reason}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {item.status === 'appealed' && (
                                    <div className={styles.userAppeal}>
                                        <div className={styles.reasonTitle}>Razón de la apelación:</div>
                                        <p className={styles.appealText}>"{item.reports?.[0]?.reason || 'Sin mensaje'}"</p>
                                    </div>
                                )}

                                <div className={styles.actions}>
                                    {item.status !== 'resolved' ? (
                                        <>
                                            <button 
                                                className={styles.restoreBtn}
                                                onClick={() => handleAction(item.post_id, 'restore', 'Aprobado por admin humano')}
                                            >
                                                <CheckCircle size={16} /> Restaurar
                                            </button>
                                            <button 
                                                className={styles.banBtn}
                                                onClick={() => handleAction(item.post_id, 'confirm_ban', 'Baneo confirmado por admin humano')}
                                            >
                                                <XCircle size={16} /> Confirmar Baneo
                                            </button>
                                        </>
                                    ) : (
                                        <div className={`${styles.resolutionBadge} ${item.post?.is_banned ? styles.banBadgeResult : styles.restoreBadgeResult}`}>
                                            {item.post?.is_banned ? (
                                                <>
                                                    <XCircle size={16} /> Acción: Baneo Confirmado
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle size={16} /> Acción: Publicación Restaurada
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
