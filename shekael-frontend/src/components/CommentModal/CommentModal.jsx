import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Image as ImageIcon, Smile } from 'lucide-react';
import useStore from '../../store';
import { createComment, uploadCommentImage } from '../../api/posts.api';
import useFeedbackModal from '../FeedbackModal/useFeedbackModal';
import FeedbackModal from '../FeedbackModal/FeedbackModal';
import Avatar from '../Avatar/Avatar';
import { cleanTitle } from '../../utils/stringUtils';
import styles from './CommentModal.module.css';

const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud';

const EMOJIS = ['😊', '😂', '❤️', '🔥', '👍', '🎉', '😍', '💀', '🙏', '✨', '💯', '😭', '🥺', '🤣', '😎', '💪'];

export default function CommentModal() {
    const { isCommentModalOpen, commentTargetPost, closeCommentModal, user } = useStore();
    const [text, setText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showEmojis, setShowEmojis] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const fileInputRef = useRef(null);
    const { modalState, showSuccess, showError, hideModal } = useFeedbackModal();

    if (!isCommentModalOpen || !commentTargetPost) return null;

    const insertEmoji = (emoji) => {
        setText((prev) => prev + emoji);
        setShowEmojis(false);
    };

    const handleImageSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingImage(true);
        try {
            const formData = new FormData();
            formData.append('image', file);
            const res = await uploadCommentImage(formData);
            const imgUrl = res.data.url;
            setText((prev) => prev + `\n![imagen](${imgUrl})`);
            showSuccess('Imagen agregada', '', true);
        } catch (err) {
            console.error('Error uploading comment image:', err);
            showError('Error', 'No se pudo subir la imagen');
        } finally {
            setUploadingImage(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!text.trim()) return;

        setIsSubmitting(true);
        try {
            await createComment(commentTargetPost.id, text);
            setText('');
            showSuccess('¡Respuesta enviada!', '', true);

            // Notificar al feed que el contador debe aumentar
            window.dispatchEvent(new CustomEvent('Shekael:comment-created', {
                detail: { postId: commentTargetPost.id }
            }));

            setTimeout(() => {
                closeCommentModal();
            }, 2500);
        } catch (err) {
            console.error(err);
            showError('Error', 'No se pudo enviar tu respuesta');
        } finally {
            setIsSubmitting(false);
        }
    };

    const authorName = commentTargetPost.display_name || 'Usuario';
    const authorInitials = authorName.slice(0, 2).toUpperCase();

    const getCleanContent = () => {
        const type = commentTargetPost.type;
        const rawContent = commentTargetPost.content || '';
        const parts = rawContent.split('|||');
        
        if (type === 'video') {
            const rawTitle = commentTargetPost.video_title || parts[1] || '';
            return cleanTitle(rawTitle, 'Video sin título');
        }
        
        if (type === 'image') {
            const raw = parts[2] || parts[1] || '';
            return cleanTitle(raw, 'Imagen de Shekael');
        }
        
        return rawContent;
    };

    const getMediaPreview = () => {
        const type = commentTargetPost.type;
        const rawContent = commentTargetPost.content || '';
        const parts = rawContent.split('|||');

        if (type === 'image') {
            if (parts[0].startsWith('http') || parts[0].startsWith('r2://')) {
                return parts[0].startsWith('r2://') ? null : parts[0];
            }
            return `${PINATA_GATEWAY}/ipfs/${parts[0]}`;
        }

        if (type === 'video') {
            return commentTargetPost.video_thumbnail_url || null;
        }

        return null;
    };

    const cleanContent = getCleanContent();
    const mediaUrl = getMediaPreview();

    return (
        <AnimatePresence>
            {isCommentModalOpen && (
                <div className={styles.overlay} onClick={closeCommentModal}>
                    <motion.div
                        className={styles.modal}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.header}>
                            <h3 className={styles.title}>Nueva Respuesta</h3>
                            <button className={styles.closeBtn} onClick={closeCommentModal} aria-label="Cerrar">
                                <X size={20} />
                            </button>
                        </div>

                        <div className={styles.content}>
                            {/* Post al que se responde */}
                            <div className={styles.targetPostCard}>
                                <div className={styles.targetHeader}>
                                    <Avatar avatarUrl={commentTargetPost.avatar_url} name={authorName} size="sm" />
                                    <div className={styles.authorMeta}>
                                        <span className={styles.authorName}>{authorName}</span>
                                        <span className={styles.authorHandle}>@{commentTargetPost.author_id?.slice(0, 8)}</span>
                                    </div>
                                </div>
                                <div className={styles.targetBody}>
                                    <div className={styles.targetTextWrapper}>
                                        <p className={styles.targetText}>
                                            {cleanContent.length > 120
                                                ? cleanContent.slice(0, 120) + '...'
                                                : cleanContent}
                                        </p>
                                        {mediaUrl && (
                                            <div className={styles.targetMedia}>
                                                <img src={mediaUrl} alt="Preview" className={styles.targetImg} />
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.replyingTo}>
                                        Respondiendo a <span className={styles.link}>@{authorName}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Formulario de respuesta */}
                            <div className={styles.replyArea}>
                                <form className={styles.form} onSubmit={handleSubmit}>
                                    <div className={styles.textareaWrapper}>
                                        <Avatar avatarUrl={user?.avatarUrl} name={user?.displayName || 'U'} size="md" />
                                        <textarea
                                            className={styles.textarea}
                                            placeholder="Escribe tu respuesta..."
                                            value={text}
                                            onChange={(e) => setText(e.target.value)}
                                            autoFocus
                                        />
                                    </div>

                                    {/* Emoji picker */}
                                    {showEmojis && (
                                        <div className={styles.emojiPicker}>
                                            {EMOJIS.map((emoji) => (
                                                <button
                                                    key={emoji}
                                                    type="button"
                                                    className={styles.emojiBtn}
                                                    onClick={() => insertEmoji(emoji)}
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <div className={styles.footer}>
                                        <div className={styles.tools}>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/*"
                                                style={{ display: 'none' }}
                                                onChange={handleImageSelect}
                                            />
                                            <button
                                                type="button"
                                                className={styles.toolBtn}
                                                title="Imagen"
                                                disabled={uploadingImage}
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                <ImageIcon size={18} />
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.toolBtn}
                                                title="Emoji"
                                                onClick={() => setShowEmojis(!showEmojis)}
                                            >
                                                <Smile size={18} />
                                            </button>
                                        </div>
                                        <button
                                            type="submit"
                                            className={styles.submitBtn}
                                            disabled={!text.trim() || isSubmitting || uploadingImage}
                                        >
                                            {uploadingImage ? 'Subiendo...' : isSubmitting ? 'Enviando...' : 'Responder'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </motion.div>

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
                </div>
            )}
        </AnimatePresence>
    );
}
