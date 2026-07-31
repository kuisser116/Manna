import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, Heart, MessageSquare, RefreshCw, Loader2 } from 'lucide-react';
import useStore from '../../store';
import styles from './AdminPostApproval.module.css';

export default function AdminPostApproval() {
    const { token, user, addToast } = useStore();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [approving, setApproving] = useState(null);
    const [pendingCount, setPendingCount] = useState(0);

    const API_URL = import.meta.env.VITE_API_URL || location.origin;

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/admin/pending-posts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPosts(data.posts || []);
                setPendingCount(data.posts?.length || 0);
            }
        } catch (err) {
            addToast('error', 'Error', 'No se pudo cargar');
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
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                addToast('success', 'Aprobado', data.message);
                setPosts(prev => prev.filter(p => p.id !== postId));
                setPendingCount(prev => prev - 1);
            } else {
                addToast('error', 'Error', data.message);
            }
        } catch {
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
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                addToast('success', 'Rechazado');
                setPosts(prev => prev.filter(p => p.id !== postId));
                setPendingCount(prev => prev - 1);
            }
        } catch {
            addToast('error', 'Error', 'Fallo de conexión');
        } finally {
            setApproving(null);
        }
    };

    const getContent = (post) => {
        if (!post?.content) return 'Contenido multimedia';
        if (post.type === 'micro-text' || post.type === 'capsule') return post.content;
        const parts = post.content.split('|||');
        if (post.type === 'image') return parts[2] || 'Sin descripción';
        if (post.type === 'video') return post.video_title || parts[1] || 'Sin título';
        return post.content;
    };

    if (!user?.is_admin) {
        return (
            <div className={styles.container}>
                <div className={styles.empty}>No tienes permisos de administrador.</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.headerTitle}>Aprobaciones</h1>
                <div className={styles.headerRight}>
                    <span className={styles.headerStat}>
                        <Clock size={14} />
                        <b>{pendingCount}</b> pendientes
                    </span>
                    <button onClick={fetchData} disabled={loading} style={{ background:'none', border:'none', color:'var(--color-text-muted)', cursor:'pointer', padding:0 }}>
                        <RefreshCw size={14} className={loading ? styles.spin : ''} />
                    </button>
                </div>
            </header>

            <main>
                {loading ? (
                    <div className={styles.loading}>
                        <Loader2 size={24} className={styles.spin} />
                        <p>Cargando...</p>
                    </div>
                ) : posts.length === 0 ? (
                    <div className={styles.empty}>
                        <CheckCircle size={32} style={{ opacity: 0.3 }} />
                        <p>Sin publicaciones pendientes.</p>
                    </div>
                ) : (
                    <div className={styles.postList}>
                        {posts.map(post => {
                            const author = post.author || {};
                            const bonusReleased = parseFloat(author.bonus_released_mxn || 0);
                            const bonusTotal = parseFloat(author.bonus_total_mxn || 20);

                            return (
                                <div key={post.id} className={styles.postRow}>
                                    <div className={styles.postHeader}>
                                        <img
                                            src={author.avatar_url || '/default-avatar.png'}
                                            alt=""
                                            className={styles.avatar}
                                            onError={(e) => { e.target.src = '/default-avatar.png'; }}
                                        />
                                        <span className={styles.authorName}>{author.display_name || 'Sin nombre'}</span>
                                        <span className={styles.authorMeta}>
                                            {new Date(post.created_at).toLocaleDateString()} · ${bonusReleased} / ${bonusTotal}
                                        </span>
                                    </div>
                                    <div className={styles.postBody}>{getContent(post)}</div>
                                    <div className={styles.postFooter}>
                                        <div className={styles.postInfo}>
                                            <span><Heart size={12} /> {post.like_count || 0}</span>
                                            <span><MessageSquare size={12} /> {post.comment_count || 0}</span>
                                            <span><Clock size={12} /> {post.view_count || 0}</span>
                                        </div>
                                        <div className={styles.actions}>
                                            <button
                                                className={styles.approveBtn}
                                                onClick={() => handleApprove(post.id)}
                                                disabled={approving === post.id}
                                            >
                                                {approving === postId ? <Loader2 size={14} className={styles.spin} /> : <CheckCircle size={14} />}
                                                {approving === postId ? '...' : 'Aprobar'}
                                            </button>
                                            <button
                                                className={styles.rejectBtn}
                                                onClick={() => handleReject(post.id)}
                                                disabled={approving === postId}
                                            >
                                                <XCircle size={14} /> Rechazar
                                            </button>
                                        </div>
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
