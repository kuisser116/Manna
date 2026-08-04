import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Eye, MessageSquare, Trash2 } from 'lucide-react';
import SupportButton from '../SupportButton/SupportButton';
import Avatar from '../Avatar/Avatar';
import CommentsSection from '../CommentsSection/CommentsSection';
import CreatorAd from '../CreatorAd/CreatorAd';
import useStore from '../../store';
import styles from './TextDetailLayout.module.css';

function TextRecommendCard({ post }) {
    const { id, display_name, content, avatar_url } = post;
    const previewText = (content || '').slice(0, 70) + (content?.length > 70 ? '...' : '');

    return (
        <Link to={`/post/${id}`} className={styles.recommendCard}>
            <div className={styles.recommendInfo}>
                <p className={styles.recommendCaption}>{previewText || 'Publicación'}</p>
                <div className={styles.recommendBottom}>
                    <Avatar avatarUrl={avatar_url} name={display_name} size="sm" />
                    <span className={styles.recommendAuthor}>{display_name || 'Usuario'}</span>
                </div>
            </div>
        </Link>
    );
}

export function TextDetailLayout({
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
    onDelete,
    hideActions = false,
    commentsTotal = 0,
    commentsHasMore = false,
    commentsLoadingMore = false,
    onLoadMoreComments,
}) {
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
        avatar_url,
    } = post;

    const formattedDate = new Date(created_at).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    const filteredRecommended = recommendedPosts
        .filter((p) => p.type !== 'video' && p.type !== 'image' && p.id !== id)
        .slice(0, 8);

    return (
        <div className={styles.page}>
            <div className={styles.contentGrid}>
                {/* ── Columna Principal ── */}
                <main className={styles.mainCol}>
                    <div className={styles.mainPostContainer}>
                        {/* Autor en cabecera similar a PostCard */}
                        <div className={styles.authorHeader}>
                            <Link to={`/profile/${author_id}`} className={styles.authorRow}>
                                <Avatar avatarUrl={avatar_url} name={display_name || author_id} size="md" />
                                <div className={styles.authorInfo}>
                                    <span className={styles.displayName}>{display_name || 'Usuario'}</span>
                                    <span className={styles.dateText}>{formattedDate}</span>
                                </div>
                            </Link>
                        </div>

                        {/* Contenido principal limpio */}
                        <motion.div
                            className={styles.contentArea}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <div className={styles.mainContent}>
                                {content}
                            </div>
                        </motion.div>

                        {/* Acciones e interacciones */}
                        {!hideActions && <div className={styles.interactionsRow}>
                            <div className={styles.actions}>
                                <button
                                    className={`${styles.actionBtn} ${isLiked ? styles.likedBtn : ''}`}
                                    onClick={onLike}
                                >
                                    <Heart
                                        size={18}
                                        fill={isLiked ? '#e0245e' : 'none'}
                                        stroke={isLiked ? '#e0245e' : 'currentColor'}
                                    />
                                    <span>{likesCount}</span>
                                </button>

                                <div className={styles.statItem}>
                                    <MessageSquare size={18} />
                                    <span>{comments.length}</span>
                                </div>

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
                        </div>}

                        {/* Anuncio en contenido del creador (70% creador / 15% usuario / 15% app) */}
                        {!isOwner && (
                            <CreatorAd postId={id} creatorId={author_id} />
                        )}
                    </div>

                    <div className={styles.divider} />

                    {/* Comentarios (desplegable + paginada) */}
                    <CommentsSection
                        comments={comments}
                        total={commentsTotal || comments.length}
                        commentText={commentText}
                        onCommentChange={onCommentChange}
                        onSubmitComment={onSubmitComment}
                        isSubmitting={isSubmitting}
                        onLoadMore={onLoadMoreComments}
                        hasMore={commentsHasMore}
                        loadingMore={commentsLoadingMore}
                        title="Respuestas"
                        emptyText="Sin respuestas aún. ¡Sé el primero!"
                    />
                </main>

                {/* ── Columna Lateral ── */}
                <aside className={styles.sideCol}>
                    {filteredRecommended.length > 0 && (
                        <>
                            <h3 className={styles.sideTitle}>Recomendados</h3>
                            <div className={styles.recommendedList}>
                                {filteredRecommended.map((p) => (
                                    <TextRecommendCard key={p.id} post={p} />
                                ))}
                            </div>
                        </>
                    )}
                </aside>
            </div>

        </div>
    );
}

export default TextDetailLayout;
