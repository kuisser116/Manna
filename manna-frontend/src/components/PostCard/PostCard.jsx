import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Share2, Bookmark, Heart, Eye, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import useStore from '../../store';
import SupportButton from '../SupportButton/SupportButton';
import SmartVideoPlayer from '../SmartVideoPlayer/SmartVideoPlayer';
import StandardVideoPlayer from '../StandardVideoPlayer/StandardVideoPlayer';
import VideoThumbnailCard from '../VideoThumbnailCard/VideoThumbnailCard';
import useFeedbackModal from '../FeedbackModal/useFeedbackModal';
import FeedbackModal from '../FeedbackModal/FeedbackModal';
import ImageModal from '../ImageModal/ImageModal';
import Avatar from '../Avatar/Avatar';
import { cleanTitle, isValidCID } from '../../utils/stringUtils';
import styles from './PostCard.module.css';
import { likePostCounter, unlikePost } from '../../api/quests.api';
import { toggleSavePost } from '../../api/posts.api';
import { useQuests } from '../../hooks/useQuests';
import ReportModal from '../ReportModal/ReportModal';

const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
const TYPE_LABELS = { 'micro-text': null, image: '📷 Imagen', video: '🎥 Video', capsule: '✨ Cápsula de Manná' };

// Se usa isValidCID desde stringUtils.js

export function PostCard({ post, isDetail = false }) {
    const {
        id,
        author_id,
        display_name,
        type,
        content,
        supports_count = 0,
        likes_count = 0,
        has_liked = false,
        stellar_public_key,
        created_at,
        video_status,
        video_r2_url,
        video_playback_id,
        video_hls_r2_url,
        video_view_count = 0,
        avatar_url,
        video_title,
        video_description,
        comments_count = 0,
        has_saved = false,
    } = post;


    const [isLiked, setIsLiked] = useState(has_liked);
    const [likesCount, setLikesCount] = useState(likes_count);
    const [isLiking, setIsLiking] = useState(false);
    const [isSaved, setIsSaved] = useState(has_saved);
    const [isSaving, setIsSaving] = useState(false);
    const [viewRegistered, setViewRegistered] = useState(false);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [modalImageUrl, setModalImageUrl] = useState('');
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [isReporting, setIsReporting] = useState(false);
    const { verifyCompletion } = useQuests();
    const { token, user } = useStore();
    const isOwner = user?.id === author_id;
    const { modalState, showSuccess, showError, showWarning, hideModal } = useFeedbackModal();
    const navigate = useNavigate();

    useEffect(() => {
        setIsLiked(has_liked);
        setLikesCount(likes_count);
        setIsSaved(has_saved);
    }, [has_liked, likes_count, has_saved]);

    const handleLike = async () => {
        if (isLiking) return; // Prevent double-clicking
        setIsLiking(true);

        const wasLiked = isLiked;

        try {
            // Optimistic UI Update
            setIsLiked(!wasLiked);
            setLikesCount(prev => wasLiked ? Math.max(0, prev - 1) : prev + 1);

            // Backend call
            let res;
            if (wasLiked) {
                res = await unlikePost(id);
            } else {
                res = await likePostCounter(id);
            }

            // Refrescar misiones en tiempo real
            window.dispatchEvent(new CustomEvent('manna:quest-refresh'));

            // Si la misión se completa gracias a este like, disparamos el evento de celebración
            if (!wasLiked && res?.data?.missionCompleted) {
                window.dispatchEvent(new CustomEvent('manna:celebration'));
            }
        } catch (error) {
            console.error('Failed to toggle like:', error);
            // Revert optimistic update
            setIsLiked(wasLiked);
            setLikesCount(prev => wasLiked ? prev + 1 : Math.max(0, prev - 1));
        } finally {
            setIsLiking(false);
        }
    };

    const handleShare = async () => {
        const postUrl = `${window.location.origin}/`; // En MVP mandamos a la raíz o feed general
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Post de ${display_name || 'Manna'}`,
                    text: 'Mira este aporte en Manná Network 🌾',
                    url: postUrl,
                });
            } catch (err) {
                console.log('Cancelado o error al compartir', err);
            }
        } else {
            navigator.clipboard.writeText(postUrl);
            showSuccess('¡Compartido!', 'Enlace copiado al portapapeles', true);
        }
    };
    
    const handleSave = async (e) => {
        e.stopPropagation();
        if (isSaving) return;
        setIsSaving(true);
        
        try {
            // Optimistic UI Update
            setIsSaved(!isSaved);
            
            await toggleSavePost(id);
        } catch (error) {
            console.error('Failed to toggle save post:', error);
            // Revert optimistic update
            setIsSaved(prev => !prev);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReport = () => {
        setIsReportModalOpen(true);
    };

    const confirmReport = async (reason) => {
        setIsReporting(true);
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
            const res = await fetch(`${API_URL}/moderation/report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ postId: id, reason })
            });

            if (res.ok) {
                showSuccess('Reporte enviado', 'Nuestros sistemas de IA y comunidad revisarán esta publicación.', true);
                setIsReportModalOpen(false);
            } else {
                showError('Error', 'No se pudo enviar el reporte');
            }
        } catch (error) {
            console.error('Report error:', error);
            showError('Error', 'Error de conexión al reportar');
        } finally {
            setIsReporting(false);
        }
    };

    const { setFeedScrollPosition, openCommentModal } = useStore();

    const handleComment = (e) => {
        e.stopPropagation();
        openCommentModal(post);
    };

    const handleCardClick = (e) => {
        // Prevent generic card click if clicking on a link or button
        if (e.target.closest('a') || e.target.closest('button')) {
            return;
        }
        setFeedScrollPosition(window.scrollY);
        navigate(`/post/${id}`);
    };

    const formattedDate = new Date(created_at).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    const isCapsule = type === 'capsule';
    const isImage = type === 'image';
    const isVideo = type === 'video';

    const formatViews = (views) => {
        if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
        if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
        return views.toString();
    };

    const getCaption = () => {
        const parts = content.split('|||');
        if (isVideo) {
            const rawTitle = video_title || parts[1] || '';
            return cleanTitle(rawTitle, ''); // Para captions en cards, fallback ''
        }
        return '';
    };

    const videoCaption = getCaption();
    const shouldTruncateDescription = videoCaption && !isDescriptionExpanded && videoCaption.length > 150;
    const displayCaption = shouldTruncateDescription ? videoCaption.substring(0, 150) + '...' : videoCaption;



    const registerView = async (watchedSeconds = 0, videoDuration = 0) => {
        if (viewRegistered || type !== 'video') return;
        setViewRegistered(true);
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
            const res = await fetch(`${API_URL}/posts/${id}/view`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ watchedSeconds, videoDuration })
            });

            if (res.ok) {
                const data = await res.json();
                console.log(`Vista registrada para video ${id} | visto: ${watchedSeconds}s de ${videoDuration}s`, data);
                // Refrescar misiones para que suba la barra
                verifyCompletion(true);
            } else {
                const errorData = await res.json();
                console.warn("Error en registro de vista:", errorData.message);
                verifyCompletion(false);
            }
        } catch (e) {
            console.error('Error registrando vista', e);
            verifyCompletion(false);
        }
    };

    const renderVideoMedia = () => {
        const parts = content.split('|||');
        let finalStatus = video_status;
        let finalPlaybackId = video_playback_id;
        let finalR2Url = video_r2_url;
        let finalHlsR2Url = video_hls_r2_url;

        // Fallback para videos legacy (antes de Phase 2)
        if (!finalStatus || finalStatus === 'none') {
            finalPlaybackId = parts[2];
            finalStatus = 'hls';
        }

        return (
            <div className={styles.videoWrapper}>
                <SmartVideoPlayer
                    videoData={{
                        status: finalStatus,
                        r2Url: finalR2Url,
                        playbackId: finalPlaybackId,
                        hlsR2Url: finalHlsR2Url,
                        duration: post.video_duration || 0,
                    }}
                    onViewValid={isDetail ? registerView : undefined}
                    isDetail={isDetail}
                    postId={id}
                    creatorId={author_id}
                    context="video-post"
                />
                {!isDetail && <div className={styles.thumbnailOverlay} />}
            </div>
        );
    };


    const renderContent = () => {
        const parts = (content || '').split('|||');

        if (isImage) {
            // Nuevo formato Híbrido: r2_url|||cid|||caption
            // Formato Legacy: cid|||caption
            let imgUrl = '';
            let imgCaption = '';

            // Si parts[0] empieza con http o r2://, es el nuevo formato
            if (parts[0].startsWith('http') || parts[0].startsWith('r2://')) {
                // Para las demos con r2:// usamos un placeholder o la URL pública si existe
                imgUrl = parts[0].startsWith('r2://')
                    ? `https://via.placeholder.com/800x600?text=${parts[0]}`
                    : parts[0];
                imgCaption = cleanTitle(parts[2] || '', '');
            } else {
                // Formato legacy Web3 nativo
                if (isValidCID(parts[0])) {
                    imgUrl = `${PINATA_GATEWAY}/ipfs/${parts[0]}`;
                }
                imgCaption = cleanTitle(parts[1] || '', '');
            }

            const handleImageClick = (e) => {
                if (!isDetail) return;
                e.stopPropagation();
                setModalImageUrl(imgUrl);
                setIsImageModalOpen(true);
            };

            return (
                <>
                    {imgUrl && (
                        <img
                            src={imgUrl}
                            alt="Post image"
                            className={`${styles.postImage} ${isDetail ? styles.postImageClickable : ''}`}
                            onClick={handleImageClick}
                        />
                    )}
                    {imgCaption && <p className={`${styles.textContent} ${styles.textImageMargin}`}>{imgCaption}</p>}
                </>
            );
        }

        return (
            <p className={`${styles.textContent} ${isCapsule ? styles.capsuleText : ''}`}>
                {content}
            </p>
        );
    };

    // Para videos en el feed/perfil (isDetail=false), mostrar solo la tarjeta compacta con thumbnail
    if (isVideo && !isDetail) {
        return <VideoThumbnailCard post={post} />;
    }

    return (
        <motion.article
            className={`${styles.card} ${isCapsule ? styles.capsule : ''} ${isVideo ? styles.videoCardWrapper : ''}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            onClick={handleCardClick}
            style={{ cursor: 'pointer' }}
        >
            {isCapsule && (
                <div className={styles.capsuleLabel}>
                    <span>✨ Cápsula de Manná</span>
                </div>
            )}

            {isVideo && (
                <div className={styles.youtubeThumbnailArea}>
                    {renderVideoMedia()}
                </div>
            )}

            <div className={isVideo ? styles.youtubeInfoArea : ''}>
                <div className={styles.header}>
                    <Link to={`/profile/${author_id}`} className={styles.avatarLink}>
                        <Avatar avatarUrl={avatar_url} name={display_name || author_id} />
                    </Link>
                    <div className={styles.meta}>
                        <Link to={`/profile/${author_id}`} className={styles.nameLink}>
                            <span className={styles.displayName}>{display_name || 'Usuario'}</span>
                        </Link>
                        <span className={styles.dateText}>
                            {isVideo && video_view_count > 0 && (
                                <>
                                    {formatViews(video_view_count)} vistas ·{' '}
                                </>
                            )}
                            {formattedDate}
                        </span>
                    </div>
                    {TYPE_LABELS[type] && !isCapsule && (
                        <span className={styles.typeBadge}>{TYPE_LABELS[type]}</span>
                    )}
                </div>

                <div className={styles.body}>
                    {!isVideo && renderContent()}
                    {isVideo && videoCaption && (
                        <div className={styles.youtubeDescription}>
                            <h3 className={styles.youtubeCaptionText}>{displayCaption}</h3>
                            {shouldTruncateDescription && (
                                <button
                                    className={styles.showMoreBtn}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsDescriptionExpanded(!isDescriptionExpanded);
                                    }}
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
                    )}
                </div>
            </div>

            <div className={styles.actions}>
                <button
                    className={`${styles.actionBtn} ${isLiked ? styles.likedHeart : ''}`}
                    onClick={handleLike}
                    disabled={isLiking}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={isLiked ? 'liked' : 'unliked'}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Heart
                                size={18}
                                fill={isLiked ? '#e0245e' : 'none'}
                                stroke={isLiked ? '#e0245e' : 'currentColor'}
                            />
                        </motion.div>
                    </AnimatePresence>
                    <span>{likesCount}</span>
                </button>
                {!isOwner && (
                    <SupportButton
                        recipientKey={stellar_public_key}
                        postId={id}
                        supportsCount={supports_count}
                    />
                )}
                <button className={styles.actionBtn} onClick={handleComment}>
                    <MessageCircle size={16} />
                    <span>{comments_count}</span>
                </button>
                <button className={styles.actionBtn} onClick={handleShare}>
                    <Share2 size={16} />
                </button>
                <div className={styles.actionBtn} style={{ cursor: 'default' }} title="Vistas">
                    <Eye size={16} />
                    <span>{formatViews(video_view_count || 0)}</span>
                </div>
                <button 
                    className={`${styles.actionBtn} ${isSaved ? styles.savedBtn : ''}`}
                    onClick={handleSave}
                    disabled={isSaving}
                >
                    <Bookmark 
                        size={16} 
                        fill={isSaved ? 'var(--color-primary)' : 'none'}
                        stroke={isSaved ? 'var(--color-primary)' : 'currentColor'}
                    />
                </button>
                <button 
                    className={styles.actionBtn} 
                    onClick={handleReport}
                    title="Reportar"
                >
                    <AlertTriangle size={16} />
                </button>
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

            <ReportModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                onConfirm={confirmReport}
                isSubmitting={isReporting}
            />

            {isDetail && isImageModalOpen && modalImageUrl && (
                <ImageModal
                    src={modalImageUrl}
                    alt="Imagen del post"
                    onClose={() => setIsImageModalOpen(false)}
                />
            )}
        </motion.article>
    );
}

export default PostCard;
