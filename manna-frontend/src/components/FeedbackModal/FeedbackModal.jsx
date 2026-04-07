import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Loader, X } from 'lucide-react';
import styles from './FeedbackModal.module.css';

const ICONS = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
    loading: Loader,
};

const TITLES_COLOR = {
    success: 'var(--color-success)',
    error: 'var(--color-danger)',
    warning: 'var(--color-warning)',
    loading: 'var(--color-primary)',
};

export function FeedbackModal({
    isOpen,
    onClose,
    type = 'loading',
    title = '',
    message = '',
    showCloseButton = true,
    autoClose = false,
    autoCloseDelay = 2500,
}) {
    const Icon = ICONS[type];

    useEffect(() => {
        if (isOpen && autoClose) {
            const t = setTimeout(onClose, autoCloseDelay);
            return () => clearTimeout(t);
        }
    }, [isOpen, autoClose, autoCloseDelay, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={styles.overlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={showCloseButton ? onClose : undefined}
                >
                    <motion.div
                        className={styles.modal}
                        initial={{ opacity: 0, scale: 0.85, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.85, y: 20 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {showCloseButton && (
                            <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
                                <X size={18} />
                            </button>
                        )}

                        <div
                            className={styles.iconWrapper}
                            style={{ '--icon-color': TITLES_COLOR[type] }}
                        >
                            <Icon
                                size={40}
                                color={TITLES_COLOR[type]}
                                className={type === 'loading' ? styles.spinning : ''}
                            />
                        </div>

                        {title && (
                            <h3 className={styles.title} style={{ color: TITLES_COLOR[type] }}>
                                {title}
                            </h3>
                        )}
                        {message && <p className={styles.message}>{message}</p>}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default FeedbackModal;
