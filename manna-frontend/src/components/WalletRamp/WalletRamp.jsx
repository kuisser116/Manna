import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import api from '../../api/users.api';
import styles from './WalletRamp.module.css';

export default function WalletRamp({ isOpen, onClose, onRefreshBalance }) {
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [interactiveUrl, setInteractiveUrl] = useState(null);
    const [transactionId, setTransactionId] = useState(null);
    const [status, setStatus] = useState('idle'); // idle, loading, interactive, completed

    // Reiniciar estado al abrir el modal
    useEffect(() => {
        if (isOpen) {
            setAmount('');
            setLoading(false);
            setError(null);
            setInteractiveUrl(null);
            setTransactionId(null);
            setStatus('idle');
        }
    }, [isOpen]);

    const handleStartWithdraw = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // Retiro directo de MXNe (1 MXNe = 1 Peso)
            // No hacemos conversión ya que el usuario ingresa pesos y el activo es peso digital
            const mxnAmount = parseFloat(amount).toFixed(2);
            
            const { data } = await api.post('/anchor/withdraw', 
                { assetCode: 'MXNe', amount: mxnAmount }
            );

            if (data.url) {
                setInteractiveUrl(data.url);
                setTransactionId(data.id);
                setStatus('interactive');
                // Refrescar balance inmediatamente ya que el backend descuenta los fondos ahora
                if (onRefreshBalance) onRefreshBalance();
            } else {
                throw new Error('No se recibió la URL de retiro del servidor.');
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    // Polling opcional para detectar cuando el anchor marca la TX como completada
    useEffect(() => {
        let interval;
        if (status === 'interactive' && transactionId) {
            interval = setInterval(async () => {
                try {
                    const { data } = await api.get(`/anchor/status/${transactionId}`);
                    
                    if (data.status === 'completed') {
                        setStatus('completed');
                        clearInterval(interval);
                        if (onRefreshBalance) onRefreshBalance();
                    }
                } catch (e) {
                    console.warn('Error polling status:', e);
                }
            }, 5000);
        }
        return () => clearInterval(interval);
    }, [status, transactionId, onRefreshBalance]);

    if (!isOpen) return null;

    return createPortal(
        <div className={styles.overlay} onClick={status !== 'interactive' ? onClose : undefined}>
            <motion.div 
                className={`${styles.modal} ${status === 'interactive' ? styles.modalLarge : ''}`}
                onClick={e => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
            >
                <div className={styles.header}>
                    <div className={styles.titleGroup}>
                        <h3>Retirar en Efectivo</h3>
                        <p className={styles.subtitle}>MoneyGram Access • Oxxo y Walmart</p>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    {status === 'idle' && (
                        <form onSubmit={handleStartWithdraw} className={styles.form}>
                            <div className={styles.inputBox}>
                                <label>Monto a retirar (Aseria Pesos)</label>
                                <div className={styles.inputWrapper}>
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                    <span className={styles.currencyBadge}>MXNe</span>
                                </div>
                                <p className={styles.hint}>
                                    Retiras en Oxxo/MoneyGram. Usaremos tu balance de <strong>MXNe</strong> para completar la operación.
                                </p>
                            </div>

                            {error && (
                                <div className={styles.errorBox}>
                                    <AlertCircle size={16} />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button className={styles.submitBtn} disabled={loading || !amount}>
                                {loading ? <Loader2 className={styles.spin} size={18} /> : 'Iniciar Retiro'}
                            </button>
                        </form>
                    )}

                    {status === 'interactive' && interactiveUrl && (
                        <div className={styles.iframeContainer}>
                            <iframe 
                                src={interactiveUrl}
                                title="MoneyGram Withdrawal"
                                className={styles.iframe}
                                allow="camera; geolocation"
                            />
                            <div className={styles.iframeFooter}>
                                <p>Sigue las instrucciones en la ventana de MoneyGram para obtener tu código de retiro.</p>
                            </div>
                        </div>
                    )}

                    {status === 'completed' && (
                        <div className={styles.successBox}>
                            <CheckCircle2 size={48} className={styles.successIcon} />
                            <h4>¡Retiro Exitoso!</h4>
                            <p>Tu transacción ha sido procesada. Ya puedes recoger tu efectivo con el código proporcionado.</p>
                            <button className={styles.submitBtn} onClick={onClose}>Finalizar</button>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>,
        document.body
    );
}
