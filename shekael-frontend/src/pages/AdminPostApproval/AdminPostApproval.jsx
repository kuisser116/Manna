import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, Users, Award, Eye, RefreshCw, Loader2, Heart, MessageSquare, Wallet } from 'lucide-react';
import useStore from '../../store';
import styles from './AdminPostApproval.module.css';

export default function AdminPostApproval() {
    const { token, user, addToast } = useStore();
    const [posts, setPosts] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [approving, setApproving] = useState(null);

    const API_URL = import.meta.env.VITE_API_URL || location.origin;

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [postsRes, statsRes] = await Promise.all([
                fetch(`${API_URL}/admin/pending-posts`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${API_URL}/admin/stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);
            if (postsRes.ok) {
                const data = await postsRes.json();
                setPosts(data.posts || []);
            }
            if (statsRes.ok) {
                setStats(await statsRes.json());
            }
        } catch (err) {
            addToast('error', 'Error', 'No se pudo cargar el panel');
        } finally {
            setLoading(false);
        }
    }, [token, API_URL, addToast]);

    useEffect(() => {
        if (token) fetchData();
    }, [token, fetchData]);

    const handleApprove = async (postId) => {
        setApproving(postId);
        try {
            const res = await fetch(`${API_URL}/admin/approve-post/${postId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                }
            });
            const data = await res.json();
            if (res.ok) {
                addToast('success', 'Post aprobado', data.message);
                setPosts(prev => prev.filter(p => p.id !== postId));
                // Refresh stats
                const statsRes = await fetch(`${API_URL}/admin/stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (statsRes.ok) setStats(await statsRes.json());
            } else {
                addToast('error', 'Error', data.message || 'No se pudo aprobar');
            }
        } catch (err) {
            addToast('error', 'Error', 'Fallo de conexión');
        } finally {
            setApproving(null);
        }
    };

    const handleReject = async (postId) => {
        setApproving(postId);
        try {
            const res = await fetch(`${API_URL}/admin/reject-post/${postId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                }
            });
            if (res.ok) {
                addToast('success', 'Rechazado', 'Post rechazado');
                setPosts(prev => prev.filter(p => p.id !== postId));
            } else {
                addToast('error', 'Error', 'No se pudo rechazar');
            }
        } catch (err) {
            addToast('error', 'Error', 'Fallo de conexión');
        } finally {
            setApproving(null);
        }
    };

    const getDisplayContent = (post) => {
        if (!post?.content) return 'Contenido multimedia';
        if (post.type === 'micro-text' || post.type === 'capsule') {
            return post.content;
        }
        const parts = post.content.split('|||');
        if (post.type === 'image') return parts[2] || 'Sin descripción';
        if (post.type === 'video') return post.video_title || parts[1] || 'Sin título';
        return post.content;
    };

    if (!user?.is_admin) {
        return (
            <div className={styles.container}>
                <div className={styles.empty}>
                    No tienes permisos de administrador para acceder aquí.
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.titleBox}>
                    <Award size={32} className={styles.titleIcon} />
                    <div>
                        <h1>Aprobación de Contenido</h1>
                        <p>Revisa y aprueba publicaciones para liberar recompensas.</p>
                    </div>
                </div>

                {stats && (
                    <div className={styles.statsRow}>
                        <div className={styles.statCard}>
                            <span className={styles.statValue}>{stats.pending_posts}</span>
                            <span className={styles.statLabel}>Pendientes</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statValue}>{stats.activated_wallets}</span>
                            <span className={styles.statLabel}>Wallets activas</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statValue}>{stats.total_users}</span>
                            <span className={styles.statLabel}>Usuarios totales</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statValue}>{stats.approved_today}</span>
                            <span className={styles.statLabel}>Aprobados hoy</span>
                        </div>
                    </div>
                )}
            </header>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button
                    onClick={fetchData}
                    className={styles.rejectBtn}
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    disabled={loading}
                >
                    <RefreshCw size={14} className={loading ? styles.spin : ''} />
                    Recargar
                </button>
            </div>

            <main>
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={32} className={styles.spin} />
                        <p>Cargando publicaciones pendientes...</p>
                    </div>
                ) : posts.length === 0 ? (
                    <div className={styles.empty}>
                        <CheckCircle size={48} className={styles.emptyIcon} />
                        <p>No hay publicaciones pendientes. Todo está al día.</p>
                    </div>
                ) : (
                    <div className={styles.postList}>
                        {posts.map(post => {
                            const author = post.author || {};
                            const bonusReleased = parseFloat(author.bonus_released_mxn || 0);
                            const bonusTotal = parseFloat(author.bonus_total_mxn || 50);
                            const isNewWallet = !author.wallet_activated;

                            return (
                                <div key={post.id} className={styles.card}>
                                    <div className={styles.cardHeader}>
                                        <div className={styles.authorInfo}>
                                            <img
                                                src={author.avatar_url || '/default-avatar.png'}
                                                alt={author.display_name}
                                                className={styles.avatar}
                                                onError={(e) => { e.target.src = '/default-avatar.png'; }}
                                            />
                                            <div>
                                                <div className={styles.authorName}>
                                                    {author.display_name || 'Sin nombre'}
                                                </div>
                                                <div className={styles.authorEmail}>{author.email}</div>
                                            </div>
                                        </div>
                                        <div className={styles.postMeta}>
                                            <span className={styles.metaItem}>
                                                <Clock size={12} />
                                                {new Date(post.created_at).toLocaleDateString()}
                                            </span>
                                            <span className={styles.metaItem}>
                                                <Eye size={12} />
                                                {post.view_count || 0} views
                                            </span>
                                        </div>
                                    </div>

                                    <div className={styles.postContent}>
                                        {getDisplayContent(post)}
                                    </div>

                                    <div className={styles.activityInfo}>
                                        {isNewWallet && (
                                            <span className={styles.activityBadge}>
                                                <Wallet size={12} /> Wallet nueva — se activará al aprobar
                                            </span>
                                        )}
                                        <span><Heart size={12} /> {post.like_count || 0} likes</span>
                                        <span><MessageSquare size={12} /> {post.comment_count || 0} comments</span>
                                    </div>

                                    <div className={styles.bonusInfo}>
                                        <span className={styles.bonusTag}>
                                            <Award size={12} />
                                            ${bonusReleased} / ${bonusTotal} MXN liberados
                                        </span>
                                        <span className={styles.pendingTag}>
                                            <Clock size={12} />
                                            Pendiente
                                        </span>
                                    </div>

                                    <div className={styles.actions}>
                                        <button
                                            className={styles.approveBtn}
                                            onClick={() => handleApprove(post.id)}
                                            disabled={approving === post.id}
                                        >
                                            {approving === post.id ? (
                                                <Loader2 size={16} className={styles.spin} />
                                            ) : (
                                                <CheckCircle size={16} />
                                            )}
                                            {approving === post.id ? 'Aprobando...' : 'Aprobar (+$1 MXN)'}
                                        </button>
                                        <button
                                            className={styles.rejectBtn}
                                            onClick={() => handleReject(post.id)}
                                            disabled={approving === post.id}
                                        >
                                            <XCircle size={16} />
                                            Rechazar
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
