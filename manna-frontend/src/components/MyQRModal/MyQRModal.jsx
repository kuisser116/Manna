import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, QrCode, Download, Share2 } from 'lucide-react';
import useStore from '../../store';
import styles from './MyQRModal.module.css';

export default function MyQRModal({ isOpen, onClose }) {
    const { user } = useStore();
    
    if (!isOpen || !user?.stellarPublicKey) return null;

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${user.stellarPublicKey}`;

    const copyToClipboard = () => {
        navigator.clipboard.writeText(user.stellarPublicKey);
        // Podríamos añadir un toast aquí
    };

    return (
        <AnimatePresence>
            <motion.div 
                className={styles.overlay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div 
                    className={styles.modal}
                    initial={{ scale: 0.9, y: 30 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 30 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={24} />
                    </button>

                    <div className={styles.content}>
                        <div className={styles.header}>
                            <div className={styles.avatar}>
                                {user.photoURL ? (
                                    <img src={user.photoURL} alt={user.displayName} />
                                ) : (
                                    <QrCode size={32} />
                                )}
                            </div>
                            <h2 className={styles.name}>{user.displayName || 'Mi Wallet'}</h2>
                            <p className={styles.handle}>@{user.username || 'usuario'}</p>
                        </div>

                        <div className={styles.qrWrapper}>
                            <motion.img 
                                key={qrUrl}
                                src={qrUrl} 
                                alt="QR Code" 
                                className={styles.qrImage}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                            />
                            <div className={styles.scannerCorners}>
                                <div className={styles.corner} />
                                <div className={styles.corner} />
                                <div className={styles.corner} />
                                <div className={styles.corner} />
                            </div>
                        </div>

                        <p className={styles.hint}>Muestra este código para recibir MXNe al instante.</p>

                        <div className={styles.addressBox} onClick={copyToClipboard}>
                            <code className={styles.address}>
                                {user.stellarPublicKey.slice(0, 8)}...{user.stellarPublicKey.slice(-8)}
                            </code>
                            <Copy size={16} />
                        </div>

                        <div className={styles.actions}>
                            <button className={styles.actionBtn}>
                                <Download size={18} /> Guardar
                            </button>
                            <button className={styles.actionBtn}>
                                <Share2 size={18} /> Compartir
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
