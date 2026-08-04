import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ChevronDown, ChevronUp } from 'lucide-react';
import Avatar from '../Avatar/Avatar';
import styles from './CommentsSection.module.css';

/**
 * CommentsSection
 * Sección de comentarios compartida (PostDetail de video/imagen/texto):
 *  - Colapsada por defecto: muestra 3 y botón "Ver los N comentarios"
 *  - Expandida: muestra los cargados + paginación "Cargar más comentarios"
 */
export function CommentsSection({
    comments = [],
    total = 0,
    commentText = '',
    onCommentChange,
    onSubmitComment,
    isSubmitting = false,
    onLoadMore,
    hasMore = false,
    loadingMore = false,
    title = null,
    emptyText = 'Sin comentarios aún. ¡Sé el primero en responder!',
}) {
    const [expanded, setExpanded] = useState(false);
    const visibleComments = expanded ? comments : comments.slice(0, 3);
    const hiddenCount = Math.max(0, total - comments.length);

    return (
        <section className={styles.commentsSection}>
            <h2 className={styles.commentsTitle}>
                {title || (total === 1 ? '1 Comentario' : `${total} Comentarios`)}
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
                        <p className={styles.emptyComments}>{emptyText}</p>
                    ) : (
                        visibleComments.map((comment) => (
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

            {/* Desplegable: mostrar todos */}
            {!expanded && total > 3 && (
                <button className={styles.toggleBtn} onClick={() => setExpanded(true)}>
                    Ver los {total} comentarios
                    <ChevronDown size={15} />
                </button>
            )}

            {/* Expandido: paginación si hay más sin cargar */}
            {expanded && (
                <>
                    {hiddenCount > 0 && (
                        <button className={styles.toggleBtn} onClick={onLoadMore} disabled={loadingMore}>
                            {loadingMore
                                ? 'Cargando...'
                                : `Cargar ${Math.min(hiddenCount, 20)} más comentarios`}
                            <ChevronDown size={15} />
                        </button>
                    )}
                    {total > 3 && (
                        <button
                            className={styles.collapseBtn}
                            onClick={() => setExpanded(false)}
                        >
                            Mostrar menos
                            <ChevronUp size={15} />
                        </button>
                    )}
                </>
            )}
        </section>
    );
}

export default CommentsSection;
