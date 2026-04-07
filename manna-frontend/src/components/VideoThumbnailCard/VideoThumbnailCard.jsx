import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Eye, Heart, MessageCircle } from 'lucide-react';
import Avatar from '../Avatar/Avatar';
import { cleanTitle, isValidCID } from '../../utils/stringUtils';
import styles from './VideoThumbnailCard.module.css';

/**
 * VideoThumbnailCard
 * Muestra un video como tarjeta compacta 16:9 con miniatura.
 * Sin reproducción inline — al hacer click navega a /post/:id.
 * Usada en Feed y Profile para posts de tipo 'video'.
 */
export function VideoThumbnailCard({ post }) {
    const navigate = useNavigate();
    const {
        id,
        author_id,
        display_name,
        content,
        likes_count = 0,
        comments_count = 0,
        video_thumbnail_url,
        video_title,
        created_at,
        avatar_url,
    } = post;

    const parts = (content || '').split('|||');
    // Prioridad 1: video_title (nuevo backend)
    // Prioridad 2: parts[1] (legacy content formatting)
    // Fallback: parts[0] solo si no es un video (para posts de texto plano viejos)
    // Para videos, si no hay título, mostrar 'Sin título' en lugar del hash CID
    // Se usa isValidCID desde stringUtils.js
    const rawTitle = video_title || parts[1] || (post.type === 'video' ? 'Sin título' : parts[0]) || 'Sin título';
    const title = cleanTitle(rawTitle);

    const formattedDate = new Date(created_at).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });

    const handleClick = () => navigate(`/post/${id}`);

    return (
        <article className={styles.card} onClick={handleClick} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') handleClick(); }}>
            {/* Thumbnail 16:9 */}
            <div className={styles.thumbnailWrapper}>
                {video_thumbnail_url ? (
                    <img
                        src={video_thumbnail_url}
                        alt={title}
                        className={styles.thumbnail}
                        loading="lazy"
                    />
                ) : (
                    <div className={styles.thumbnailPlaceholder}>
                        <span className={styles.placeholderIcon}>🌾</span>
                    </div>
                )}
            </div>

            {/* Info debajo de la thumbnail */}
            <div className={styles.info}>
                <div className={styles.topRow}>
                    <Link
                        to={`/profile/${author_id}`}
                        className={styles.avatarLink}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Avatar avatarUrl={avatar_url} name={display_name || author_id} />
                    </Link>

                    <div className={styles.meta}>
                        <h3 className={styles.title}>{title}</h3>
                        <div className={styles.subMeta}>
                            <Link
                                to={`/profile/${author_id}`}
                                className={styles.authorLink}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {display_name || 'Usuario'}
                            </Link>
                            <span className={styles.dot}>·</span>
                            <span className={styles.date}>{formattedDate}</span>
                        </div>
                        <div className={styles.stats}>
                            <span className={styles.stat}>
                                <Heart size={12} /> {likes_count}
                            </span>
                            <span className={styles.stat} style={{ marginLeft: '12px' }}>
                                <MessageCircle size={12} /> {comments_count}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </article>
    );
}

export default VideoThumbnailCard;
