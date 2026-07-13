import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smile } from 'lucide-react';
import useStore from '../../store';
import { createComment } from '../../api/posts.api';
import Avatar from '../Avatar/Avatar';
import { cleanTitle } from '../../utils/stringUtils';
import styles from './CommentModal.module.css';

const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
const EMOJIS = ['😊', '😂', '❤️', '🔥', '👍', '🎉', '😍', '💀', '🙏', '✨', '💯', '😭', '🥺', '🤣', '😎', '💪'];

export default function CommentModal() {
    const { isCommentModalOpen, commentTargetPost, closeCommentModal, user, addToast } = useStore();
    const [text, setText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showEmojis, setShowEmojis] = useState(false);

    if (!isCommentModalOpen || !commentTargetPost) return null;

    const insertEmoji = (emoji) => {
        setText((prev) => prev + emoji);
        setShowEmojis(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!text.trim()) return;

        setIsSubmitting(true);
        try {
            await createComment(commentTargetPost.id, text);
            setText('');
            addToast('success', 'Respuesta enviada');

            window.dispatchEvent(new CustomEvent('Shekael:comment-created', {
                detail: { postId: commentTargetPost.id }
            }));

            setTimeout(() => closeCommentModal(), 1500);
        } catch (err) {
            console.error(err);
            addToast('error', 'Error', 'No se pudo enviar tu respuesta');
        } finally {
            setIsSubmitting(false);
        }
    };

    const authorName = commentTargetPost.display_name || 'Usuario';
    const getCleanContent = () => {
        const type = commentTargetPost.type;
        const rawContent = commentTargetPost.content || '';
        const parts = rawContent.split('|||');
        if (type === 'video') return cleanTitle(commentTargetPost.video_title || parts[1] || '', 'Video sin título');
        if (type === 'image') return cleanTitle(parts[2] || parts[1] || '', 'Imagen de Shekael');
        return rawContent;
    };

    const getMediaPreview = () => {
        const type = commentTargetPost.type;
        const rawContent = commentTargetPost.content || '';
        const parts = rawContent.split('|||');
        if (type === 'image') {
            if (parts[0].startsWith('http') || parts[0].startsWith('r2://')) return parts[0].startsWith('r2://') ? null : parts[0];
            return `${PINATA_GATEWAY}/ipfs/${parts[0]}`;
        }
        if (type === 'video') return commentTargetPost.video_thumbnail_url || null;
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
                            <div className={styles.targetPostCard}>
                                <div className={styles.targetHeader}>
                                    <Avatar avatarUrl={commentTargetPost.avatar_url} name={authorName} size="sm" />
                                    <div className={styles.authorMeta}>
                                        <span className={styles.authorName}>{authorName}</span>
                                        <span className={styles.authorHandle}>@{commentTargetPost.author_id?.slice(0, 8)}</span>
                                    </div>
                                </div>
                                <div className={styles.targetBody}>
                                    <p className={styles.targetText}>
                                        {cleanContent.length > 120 ? cleanContent.slice(0, 120) + '...' : cleanContent}
                                    </p>
                                    {mediaUrl && (
                                        <div className={styles.targetMedia}>
                                            <img src={mediaUrl} alt="Preview" className={styles.targetImg} />
                                        </div>
                                    )}
                                    <div className={styles.replyingTo}>
                                        Respondiendo a <span className={styles.link}>@{authorName}</span>
                                    </div>
                                </div>
                            </div>

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

                                    {showEmojis && (
                                        <div className={styles.emojiPicker}>
                                            {EMOJIS.map((emoji) => (
                                                <button key={emoji} type="button" className={styles.emojiBtn} onClick={() => insertEmoji(emoji)}>
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <div className={styles.footer}>
                                        <div className={styles.tools}>
                                            <button type="button" className={styles.toolBtn} title="Emoji" onClick={() => setShowEmojis(!showEmojis)}>
                                                <Smile size={18} />
                                            </button>
                                        </div>
                                        <button type="submit" className={styles.submitBtn} disabled={!text.trim() || isSubmitting}>
                                            {isSubmitting ? 'Enviando...' : 'Responder'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
