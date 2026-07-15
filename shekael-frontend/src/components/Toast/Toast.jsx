import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';
import useStore from '../../store';
import ConfirmToast from './ConfirmToast';
import styles from './Toast.module.css';

const ICONS = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
};

export default function ToastContainer() {
    const { toasts, removeToast } = useStore();

    // Auto-remove after 3s
    useEffect(() => {
        if (toasts.length === 0) return;
        const timers = toasts.map((t) =>
            setTimeout(() => removeToast(t.id), 3000)
        );
        return () => timers.forEach(clearTimeout);
    }, [toasts, removeToast]);

    return (
        <>
            <div className={styles.container}>
                <AnimatePresence>
                    {toasts.map((t) => {
                        const Icon = ICONS[t.type] || CheckCircle;
                        return (
                            <motion.div
                                key={t.id}
                                className={`${styles.toast} ${styles[t.type] || ''}`}
                                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                                transition={{ duration: 0.2 }}
                            >
                                <Icon size={18} />
                                <div className={styles.content}>
                                    <span className={styles.title}>{t.title}</span>
                                    {t.message && <span className={styles.message}>{t.message}</span>}
                                </div>
                                <button className={styles.closeBtn} onClick={() => removeToast(t.id)}>
                                    <X size={14} />
                                </button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
            <ConfirmToast />
        </>
    );
}
