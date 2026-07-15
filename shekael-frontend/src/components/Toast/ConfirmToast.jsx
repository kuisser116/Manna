import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check } from 'lucide-react';
import useStore from '../../store';
import styles from './Toast.module.css';

export default function ConfirmToast() {
    const { confirmToast, hideConfirm } = useStore();

    return (
        <AnimatePresence>
            {confirmToast && (
                <motion.div
                    className={styles.confirmOverlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={hideConfirm}
                >
                    <motion.div
                        className={styles.confirmToast}
                        initial={{ opacity: 0, y: 30, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        transition={{ duration: 0.2 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.confirmIcon}>
                            <AlertTriangle size={22} />
                        </div>
                        <div className={styles.confirmContent}>
                            <span className={styles.confirmTitle}>{confirmToast.title}</span>
                            {confirmToast.message && (
                                <span className={styles.confirmMessage}>{confirmToast.message}</span>
                            )}
                        </div>
                        <div className={styles.confirmActions}>
                            <button
                                className={styles.confirmCancel}
                                onClick={hideConfirm}
                            >
                                Cancelar
                            </button>
                            <button
                                className={`${styles.confirmOk} ${confirmToast.danger ? styles.confirmDanger : ''}`}
                                onClick={() => {
                                    confirmToast.onConfirm?.();
                                    hideConfirm();
                                }}
                            >
                                <Check size={14} />
                                {confirmToast.confirmLabel || 'Sí'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
