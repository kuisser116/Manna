import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Send, ArrowLeft, ZoomIn, Eye, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import SupportButton from '../SupportButton/SupportButton';
import ImageModal from '../ImageModal/ImageModal';
import Avatar from '../Avatar/Avatar';
import { cleanTitle, isValidCID } from '../../utils/stringUtils';
import useStore from '../../store';
import styles from './ImageDetailLayout.module.css';

const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
// Se usa isValidCID desde stringUtils.js

/** Mini-card para la columna de imágenes recomendadas */
function ImageRecommendCard({ post }) {
    const navigate = useNavigate();
    const parts = (post.content || '').split('|||');
    let imgUrl = '';
    let caption = '';

    if (parts[0].startsWith('http') || parts[0].startsWith('r2://')) {
        imgUrl = parts[0].startsWith('r2://')
            ? `https://via.placeholder.com/400x300?text=${parts[0]}`
            : parts[0];
        // Para R2: parts[1] es CID, parts[2] es caption
        caption = cleanTitle(parts[2] || parts[1] || '', '');
    } else {
        imgUrl = `${PINATA_GATEWAY}/ipfs/${parts[0]}`;
        caption = cleanTitle(parts[1] || '', '');
    }

    return (
        <motion.div
            className={styles.recommendCard}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate(`/post/${post.id}`)}
            style={{ cursor: 'pointer' }}
        >
            <div className={styles.recommendThumb}>
                {imgUrl
                    ? <img src={imgUrl} alt={caption || 'Imagen'} className={styles.recommendImg} />
                    : <div className={styles.recommendImgFallback}>📷</div>
                }
            </div>
            <div className={styles.recommendInfo}>
                <p className={styles.recommendCaption}>{caption || 'Sin descripción'}</p>
                <span className={styles.recommendAuthor}>{post.display_name || 'Usuario'}</span>
            </div>
        </motion.div>
    );
}

/**
 * ImageDetailLayout
 * Layout de dos columnas para posts de tipo 'image'.
 * Sincronizado con VideoDetailLayout para consistencia.
 */
export function ImageDetailLayout({
    post,
    comments = [],
    commentText = '',
    onCommentChange,
    onSubmitComment,
    isSubmitting = false,
    recommendedPosts = [],
    likesCount = 0,
    isLiked = false,
    onLike,
    onBack,
    onDelete,
}) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const { user } = useStore();

    const isOwner = user?.id === post.author_id;
    const isAdmin = user?.is_admin;
    const canDelete = isOwner || isAdmin;

    const {
        id,
        author_id,
        display_name,
        content,
        supports_count = 0,
        stellar_public_key,
        created_at,
        image_view_count = 0, // Asumiendo que existe o se registra similar al video
        avatar_url,
    } = post;

    const parts = (content || '').split('|||');
    let imgUrl = '';
    let title = 'Sin título';
    let description = '';

    if (parts[0].startsWith('http') || parts[0].startsWith('r2://')) {
        imgUrl = parts[0].startsWith('r2://')
            ? `https://via.placeholder.com/800x600?text=${parts[0]}`
            : parts[0];
        // Para R2: parts[1] es CID, parts[2] es caption
        title = cleanTitle(parts[2] || parts[1] || 'Imagen de Ehise', 'Imagen de Ehise');
        description = parts[2] || '';
    } else {
        imgUrl = `${PINATA_GATEWAY}/ipfs/${parts[0]}`;
        title = cleanTitle(parts[1] || 'Imagen de Ehise', 'Imagen de Ehise');
        description = parts[2] || '';
    }

    const formattedDate = new Date(created_at).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    const formatViews = (views) => {
        if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
        if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
        return views.toString();
    };

    const shouldTruncateDescription = description && !isDescriptionExpanded && description.length > 300;
    const displayDescription = shouldTruncateDescription ? description.substring(0, 300) + '...' : description;

    const filteredRecommended = recommendedPosts
        .filter((p) => p.type === 'image' && p.id !== id)
        .slice(0, 8);

    return (
        <div className={styles.page}>
            <div className={styles.contentGrid}>
                {/* ── Columna Principal ── */}
                <main className={styles.mainCol}>
                    {/* Imagen principal (Equivalente al player wrapper) */}
                    <div className={styles.imageWrapper} onClick={() => setIsModalOpen(true)}>
                        {imgUrl
                            ? <img src={imgUrl} alt={title} className={styles.mainImage} />
                            : <div className={styles.imageFallback}>📷 Sin imagen</div>
                        }
                        <div className={styles.zoomHint}>
                            <ZoomIn size={16} />
                            <span>Click para ampliar</span>
                        </div>
                    </div>

                    {/* Metadata del post (Mismo orden que VideoDetailLayout) */}
                    <div className={styles.videoMetadataWrapper}>
                        {/* Título - Removido por redundancia en imágenes */}

                        {/* Vistas + Fecha */}
                        <div className={styles.viewsRow}>
                            <span className={styles.viewsCount}>
                                <Eye size={16} className={styles.viewsIcon} />
                                {formatViews(image_view_count)} vistas
                            </span>
                            <span className={styles.dateText}>{formattedDate}</span>
                        </div>

                        {/* Autor + acciones */}
                        <div className={styles.metaRow}>
                            <Link to={`/profile/${author_id}`} className={styles.authorRow}>
                                <Avatar avatarUrl={avatar_url} name={display_name || author_id} size="md" />
                                <div className={styles.authorInfo}>
                                    <span className={styles.displayName}>{display_name || 'Usuario'}</span>
                                </div>
                            </Link>

                            <div className={styles.actions}>
                                <button
                                    className={`${styles.actionBtn} ${isLiked ? styles.likedBtn : ''}`}
                                    onClick={onLike}
                                >
                                    <Heart
                                        size={16}
                                        fill={isLiked ? '#e0245e' : 'none'}
                                        stroke={isLiked ? '#e0245e' : 'currentColor'}
                                    />
                                    <span>{likesCount}</span>
                                </button>
                                {!isOwner && (
                                    <SupportButton
                                        recipientKey={stellar_public_key}
                                        postId={id}
                                        supportsCount={supports_count}
                                    />
                                )}

                                {canDelete && (
                                    <button
                                        className={styles.deleteBtn}
                                        onClick={onDelete}
                                        title="Eliminar publicación"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Descripción expandible */}
                        {description && (
                            <div className={styles.descriptionBox}>
                                <div className={styles.descriptionContent}>
                                    <p className={styles.descriptionText}>{displayDescription}</p>
                                    {shouldTruncateDescription && (
                                        <button
                                            className={styles.showMoreBtn}
                                            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                        >
                                            {isDescriptionExpanded ? (
                                                <>
                                                    Ver menos
                                                    <ChevronUp size={14} />
                                                </>
                                            ) : (
                                                <>
                                                    Ver más
                                                    <ChevronDown size={14} />
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className={styles.divider} />
                    </div>

                    {/* Comentarios */}
                    <section className={styles.commentsSection}>
                        <h2 className={styles.commentsTitle}>
                            {comments.length} {comments.length === 1 ? 'Comentario' : 'Comentarios'}
                        </h2>

                        <form className={styles.commentForm} onSubmit={onSubmitComment}>
                            <input
                                type="text"
                                className={styles.commentInput}
                                placeholder="Agrega un comentario..."
                                value={commentText}
                                onChange={(e) => onCommentChange(e.target.value)}
                                disabled={isSubmitting}
                            />
                            <button
                                type="submit"
                                className={styles.sendBtn}
                                disabled={!commentText.trim() || isSubmitting}
                            >
                                <Send size={16} />
                            </button>
                        </form>

                        <div className={styles.commentsList}>
                            <AnimatePresence>
                                {comments.length === 0 ? (
                                    <p className={styles.emptyComments}>
                                        Sin comentarios aún. ¡Sé el primero en responder! 🌾
                                    </p>
                                ) : (
                                    comments.map((comment) => (
                                        <motion.div
                                            key={comment.id}
                                            className={styles.commentItem}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                        >
                                            <Avatar avatarUrl={comment.avatar_url} name={comment.display_name} size="sm" />
                                            <div className={styles.commentContent}>
                                                <span className={styles.commentName}>
                                                    {comment.display_name}
                                                </span>
                                                <p className={styles.commentText}>{comment.content}</p>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </AnimatePresence>
                        </div>
                    </section>
                </main>

                {/* ── Columna de imágenes recomendadas ── */}
                <aside className={styles.sideCol}>
                    {filteredRecommended.length > 0 && (
                        <>
                            <h3 className={styles.sideTitle}>Más imágenes</h3>
                            <div className={styles.recommendedList}>
                                {filteredRecommended.map((p) => (
                                    <ImageRecommendCard key={p.id} post={p} />
                                ))}
                            </div>
                        </>
                    )}
                </aside>
            </div>

            {/* Modal de zoom */}
            {isModalOpen && imgUrl && (
                <ImageModal
                    src={imgUrl}
                    alt={title}
                    onClose={() => setIsModalOpen(false)}
                />
            )}

            {/* ── Floating Wallet ── */}
        </div>
    );
}

export default ImageDetailLayout;
