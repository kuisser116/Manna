import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';
import styles from './ConfirmModal.module.css';

export function ConfirmModal({
    isOpen,
    onConfirm,
    onCancel,
    title = '¿Confirmar acción?',
    description,
    amount,
    children,
    confirmLabel = 'Confirmar',
    danger = false,
    loading = false,
}) {
    if (!isOpen) return null;

    const modal = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={styles.overlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={!loading ? onCancel : undefined}
                >
                    <motion.div
                        className={styles.modal}
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 20 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 320 }}
                        // Evitar que el clic en el modal propague al overlay (onCancel)
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button className={styles.closeBtn} onClick={onCancel} disabled={loading}>
                            <X size={18} />
                        </button>

                        <div className={`${styles.iconWrap} ${danger ? styles.iconDanger : styles.iconWarn}`}>
                            <AlertTriangle size={26} />
                        </div>

                        <h3 className={styles.title}>{title}</h3>
                        {description && <p className={styles.description}>{description}</p>}

                        {amount && (
                            <div className={styles.amountBox}>
                                <span className={styles.amountLabel}>Monto a mover</span>
                                <span className={styles.amountValue}>{amount}</span>
                                <span className={styles.amountNote}>⛓️ Transacción en Stellar Testnet · irreversible</span>
                            </div>
                        )}

                        {children}

                        <div className={styles.btnRow}>
                            <button className={styles.cancelBtn} onClick={onCancel} disabled={loading}>
                                Cancelar
                            </button>
                            <button
                                className={`${styles.confirmBtn} ${danger ? styles.confirmDanger : ''}`}
                                onClick={onConfirm}
                                disabled={loading}
                            >
                                {loading ? <span className={styles.spinner} /> : <CheckCircle size={15} />}
                                {loading ? 'Procesando...' : confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return createPortal(modal, document.body);
}

export default ConfirmModal;
