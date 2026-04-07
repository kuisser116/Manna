import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import styles from './ConfirmationModal.module.css';

export function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title = '¿Estás seguro?',
    message = 'Esta acción no se puede deshacer.',
    confirmText = 'Eliminar',
    cancelText = 'Cancelar',
    isDanger = true
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={styles.overlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className={styles.modal}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button className={styles.closeBtn} onClick={onClose}>
                            <X size={18} />
                        </button>

                        <div className={styles.iconWrapper}>
                            <AlertTriangle size={32} className={styles.icon} />
                        </div>

                        <h3 className={styles.title}>{title}</h3>
                        <p className={styles.message}>{message}</p>

                        <div className={styles.actions}>
                            <button className={styles.cancelBtn} onClick={onClose}>
                                {cancelText}
                            </button>
                            <button 
                                className={`${styles.confirmBtn} ${isDanger ? styles.danger : ''}`} 
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                            >
                                {confirmText}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default ConfirmationModal;
