import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Send, ArrowLeft, ChevronDown, ChevronUp, Eye, Trash2, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SmartVideoPlayer from '../SmartVideoPlayer/SmartVideoPlayer';
import SupportButton from '../SupportButton/SupportButton';
import VideoThumbnailCard from '../VideoThumbnailCard/VideoThumbnailCard';
import Avatar from '../Avatar/Avatar';
import useStore from '../../store';
import { cleanTitle } from '../../utils/stringUtils';
import styles from './VideoDetailLayout.module.css';

/**
 * VideoDetailLayout
 * Layout de dos columnas estilo YouTube con esencia de Ehise.
 * 
 * Props:
 *   post           — el post de tipo 'video'
 *   comments       — array de comentarios
 *   commentText    — estado del input de comentario
 *   onCommentChange — setter del input
 *   onSubmitComment — handler para submit del form
 *   isSubmitting   — boolean para deshabilitar el submit
 *   recommendedPosts — posts sugeridos (máx. 8)
 *   likesCount     — número de likes actual
 *   isLiked        — boolean si el usuario ya dio like
 *   onLike         — handler para dar like
 *   onBack         — handler para volver atrás
 *   registerView   — función para registrar la vista del video
 */
export function VideoDetailLayout({
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
    registerView,
    onDelete,
}) {
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    // Empieza en `true` para evitar el flash de apertura al cargar
    const [needsCollapse, setNeedsCollapse] = useState(true);
    // `ready` controla si ya medimos el contenido (para evitar la animación de cierre inicial)
    const [descReady, setDescReady] = useState(false);
    const descriptionRef = useRef(null);
    const { videoMode, user } = useStore();
    
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
        video_status,
        video_r2_url,
        video_playback_id,
        video_hls_r2_url,
        video_thumbnail_url,
        video_view_count = 0,
        avatar_url,
        video_title,
        video_description,
        video_tags,
    } = post;

    // Lógica de Título y Descripción:
    // 1. Prioridad a campos dedicados del backend (video_title, video_description)
    // 2. Fallback a parsing de 'content' (legacy)
    const parts = (content || '').split('|||');
    // Para videos, nunca usar parts[0] (el CID/hash) como título.
    const rawTitle = video_title || parts[1] || 'Sin título';
    const title = cleanTitle(rawTitle);
    const description = video_description || parts[2] || '';

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

    useEffect(() => {
        if (!descriptionRef.current) return;

        // Usamos requestAnimationFrame para leer el layout DESPUÉS de que el navegador pinte
        const raf = requestAnimationFrame(() => {
            if (!descriptionRef.current) return;
            const isOverflowing = descriptionRef.current.scrollHeight > 100;
            setNeedsCollapse(isOverflowing);
            // Ahora que medimos, activamos las transiciones CSS
            setDescReady(true);
        });

        return () => cancelAnimationFrame(raf);
    }, [description]);

    // Resolver datos del video
    let finalStatus = video_status;
    let finalPlaybackId = video_playback_id;
    let finalR2Url = video_r2_url;
    let finalHlsR2Url = video_hls_r2_url;

    if (!finalStatus || finalStatus === 'none') {
        finalPlaybackId = parts[2];
        finalStatus = 'hls';
    }

    const videoData = {
        status: finalStatus,
        r2Url: finalR2Url,
        playbackId: finalPlaybackId,
        hlsR2Url: finalHlsR2Url,
    };

    const filteredRecommended = recommendedPosts
        .filter((p) => p.type === 'video' && p.id !== id)
        .slice(0, 8);

    return (
        <div className={`${styles.page} ${styles[videoMode]}`}>

            {/* ── Grid de contenido (diferente según modo) ── */}
            <div className={`${styles.contentGrid} ${styles[videoMode]}`}>
                {/* ── Player Section (Single instance) ── */}
                <div className={`${styles.playerSection} ${styles[videoMode]}`}>
                    <div className={styles.playerWrapper}>
                        <SmartVideoPlayer
                            videoData={videoData}
                            onViewValid={registerView}
                            isDetail={true}
                            postId={id}
                        />
                    </div>
                </div>

                {/* ── Columna Principal (Metadata + Comentarios) ── */}
                <main className={styles.mainCol}>
                    <div className={styles.videoMetadataWrapper}>
                        {/* Título */}
                        <h1 className={styles.videoTitle}>{title}</h1>

                        {/* Vistas + Fecha */}
                        <div className={styles.viewsRow}>
                            <span className={styles.viewsCount}>
                                <Eye size={16} className={styles.viewsIcon} />
                                {formatViews(video_view_count)} vistas
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
                            <div className={`${styles.descriptionBox} ${!isDescriptionExpanded && needsCollapse ? styles.collapsed : ''} ${!descReady ? styles.noTransition : ''}`}>
                                <div className={styles.descriptionContent}>
                                    <p ref={descriptionRef} className={styles.descriptionText}>{description}</p>
                                    {needsCollapse && (
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

                        {/* Etiquetas */}
                        {video_tags && (
                            <div className={styles.tagsBox}>
                                <div className={styles.tagsContent}>
                                    <Tag size={14} className={styles.tagsIcon} />
                                    <span className={styles.tagsText}>{video_tags}</span>
                                </div>
                            </div>
                        )}

                        {/* Divider */}
                        <div className={styles.divider} />
                    </div>

                    {/* ── Sección de comentarios ── */}
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

                {/* ── Columna de videos recomendados ── */}
                <aside className={`${styles.sideCol} ${styles[videoMode]}`}>
                    {filteredRecommended.length > 0 && (
                        <>
                            <h3 className={styles.sideTitle}>Más videos</h3>
                            <div className={styles.recommendedList}>
                                {filteredRecommended.map((p) => (
                                    <VideoThumbnailCard key={p.id} post={p} />
                                ))}
                            </div>
                        </>
                    )}
                </aside>
            </div>
        </div>
    );
}


export default VideoDetailLayout;
