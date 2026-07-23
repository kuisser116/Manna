import { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, Heart, Repeat2, MessageCircle, Globe, Loader2 } from 'lucide-react';
import { shouldShowAd } from '../AdSlot/AdSlot';
import AdSlot from '../AdSlot/AdSlot';
import styles from './FederatedFeed.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Renderizar contenido HTML de Mastodon a texto simple
 */
function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<p>/gi, '')
        .replace(/<\/p>/gi, ' ')
        .replace(/<a[^>]*>/gi, '')
        .replace(/<\/a>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .trim();
}

/**
 * Truncar texto largo
 */
function truncate(text, max = 200) {
    if (!text || text.length <= max) return text;
    return text.substring(0, max) + '...';
}

/**
 * Obtener timeline federada
 */
async function fetchTimeline(limit = 20) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/federation/timeline?limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Error al obtener timeline');
    return res.json();
}

export default function FederatedFeed() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retryCount, setRetryCount] = useState(0);

    const loadTimeline = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchTimeline(20);
            if (data.posts && data.posts.length > 0) {
                setPosts(data.posts);
            } else {
                setError('No se pudieron obtener posts del Fediverso. Intenta de nuevo.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTimeline();
    }, [loadTimeline, retryCount]);

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <Loader2 size={24} className={styles.spinner} />
                <span className={styles.loadingText}>Cargando Fediverso...</span>
            </div>
        );
    }

    if (error && posts.length === 0) {
        return (
            <div className={styles.errorContainer}>
                <Globe size={32} className={styles.errorIcon} />
                <p className={styles.errorText}>{error}</p>
                <button className={styles.retryBtn} onClick={loadTimeline}>
                    Intentar de nuevo
                </button>
            </div>
        );
    }

    return (
        <div className={styles.federatedFeed}>
            <div className={styles.feedHeader}>
                <Globe size={16} />
                <span className={styles.feedTitle}>Global — Contenido del Fediverso</span>
                <button className={styles.refreshBtn} onClick={loadTimeline} title="Actualizar">
                    ↻
                </button>
            </div>

            {posts.map((post, index) => (
                <div key={post.id || index}>
                    {shouldShowAd(index) && (
                        <AdSlot postIndex={index} source="fediverso" />
                    )}

                    <article className={styles.fedPost}>
                        {/* Author */}
                        <div className={styles.postAuthor}>
                            <img
                                src={post.author?.avatar}
                                alt={post.author?.displayName}
                                className={styles.authorAvatar}
                                onError={e => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%236366f1"/></svg>'; }}
                            />
                            <div className={styles.authorInfo}>
                                <span className={styles.authorName}>
                                    {post.author?.displayName || post.author?.username}
                                </span>
                                <span className={styles.authorHandle}>
                                    {post.author?.handle}
                                </span>
                            </div>
                            <span className={styles.instanceBadge}>
                                {post.instance}
                            </span>
                        </div>

                        {/* Content */}
                        <div className={styles.postContent}>
                            <p className={styles.postText}>
                                {truncate(stripHtml(post.content), 280)}
                            </p>
                        </div>

                        {/* Media */}
                        {post.firstMedia && post.contentType === 'image' && (
                            <div className={styles.postMedia}>
                                <img
                                    src={post.firstMedia.preview_url || post.firstMedia.url}
                                    alt={post.firstMedia.description || ''}
                                    className={styles.mediaImage}
                                    loading="lazy"
                                    onError={e => { e.target.style.display = 'none'; }}
                                />
                            </div>
                        )}

                        {post.firstMedia && post.contentType === 'video' && (
                            <div className={styles.postMedia}>
                                <div className={styles.videoPlaceholder}>
                                    🎬 Video — Ver en {post.instance}
                                </div>
                            </div>
                        )}

                        {/* Stats */}
                        <div className={styles.postStats}>
                            <span className={styles.statItem}>
                                <Heart size={14} /> {post.stats?.likes || 0}
                            </span>
                            <span className={styles.statItem}>
                                <Repeat2 size={14} /> {post.stats?.shares || 0}
                            </span>
                            <span className={styles.statItem}>
                                <MessageCircle size={14} /> {post.stats?.replies || 0}
                            </span>
                            <a
                                href={post.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.viewOriginal}
                                onClick={e => e.stopPropagation()}
                            >
                                <ExternalLink size={14} />
                                Original
                            </a>
                        </div>

                        {/* Tags */}
                        {post.tags && post.tags.length > 0 && (
                            <div className={styles.postTags}>
                                {post.tags.slice(0, 5).map(tag => (
                                    <span key={tag} className={styles.tag}>#{tag}</span>
                                ))}
                            </div>
                        )}
                    </article>
                </div>
            ))}
        </div>
    );
}
