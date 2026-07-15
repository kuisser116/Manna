import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, ArrowUpFromLine, ExternalLink, Loader2, ArrowDownToLine } from 'lucide-react';
import useStore from '../../store';
import WalletRamp from '../WalletRamp/WalletRamp';
import styles from './WithdrawModal.module.css';

export default function WithdrawModal({ isOpen, onClose, onRefreshBalance }) {
    const { mxneBalance, user } = useStore();
    const [activeTab, setActiveTab] = useState('exchange');
    const [address, setAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(null);
    const [isRampOpen, setIsRampOpen] = useState(false);

    const mxneAmount = parseFloat(mxneBalance || 0);

    const handleSend = async (e) => {
        e.preventDefault();
        setError(null);
        if (!address || !amount) return;

        setSending(true);
        try {
            const api = (await import('../../api/users.api')).default;
            const { data } = await api.post('/wallet/withdraw-exchange', {
                to: address.trim(),
                amount: parseFloat(amount),
            });
            if (data?.hash) {
                setSent(true);
                if (onRefreshBalance) onRefreshBalance();
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Error al enviar');
        } finally {
            setSending(false);
        }
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setError(null);
        setSent(false);
        if (tab === 'moneygram') {
            setIsRampOpen(true);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <motion.div
                className={styles.modal}
                onClick={e => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
            >
                <div className={styles.header}>
                    <div className={styles.titleGroup}>
                        <h3>Retirar fondos</h3>
                        <p className={styles.subtitle}>Saldo disponible: {mxneAmount.toFixed(2)} MXNe</p>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'exchange' ? styles.activeTab : ''}`}
                        onClick={() => handleTabChange('exchange')}
                    >
                        <ArrowUpFromLine size={14} />
                        A exchange
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'moneygram' ? styles.activeTab : ''}`}
                        onClick={() => handleTabChange('moneygram')}
                    >
                        <ExternalLink size={14} />
                        Efectivo (Oxxo)
                    </button>
                </div>

                <div className={styles.content}>
                    {activeTab === 'exchange' ? (
                        sent ? (
                            <div className={styles.successBox}>
                                <div className={styles.successIcon}>
                                    <ArrowUpFromLine size={32} />
                                </div>
                                <h4>Transferencia enviada</h4>
                                <p>Tus fondos están en camino a la dirección destino.</p>
                                <p className={styles.successHint}>Llegan en ~3-5 segundos a la red Stellar.</p>
                                <button className={styles.submitBtn} onClick={onClose}>
                                    Finalizar
                                </button>
                            </div>
                        ) : (
                            <form className={styles.form} onSubmit={handleSend}>
                                <div className={styles.inputBox}>
                                    <label>Dirección Stellar destino (de Bitso, Binance...)</label>
                                    <input
                                        type="text"
                                        placeholder="G... o M..."
                                        value={address}
                                        onChange={e => setAddress(e.target.value)}
                                        required
                                        disabled={sending}
                                    />
                                </div>

                                <div className={styles.inputBox}>
                                    <label>Monto en MXNe</label>
                                    <div className={styles.inputWrapper}>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            max={mxneAmount}
                                            placeholder="0.00"
                                            value={amount}
                                            onChange={e => setAmount(e.target.value)}
                                            required
                                            disabled={sending}
                                        />
                                        <span className={styles.currencyBadge}>MXNe</span>
                                    </div>
                                    {mxneAmount > 0 && (
                                        <p className={styles.hint}>
                                            Máximo: {mxneAmount.toFixed(2)} MXNe
                                        </p>
                                    )}
                                </div>

                                {amount > 0 && !error && (
                                    <div className={styles.conversionNote}>
                                        <ArrowDownToLine size={12} />
                                        Se convertirá MXNe → XLM en el DEX y se enviará a tu exchange
                                    </div>
                                )}

                                {error && (
                                    <div className={styles.errorBox}>
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className={styles.submitBtn}
                                    disabled={sending || !address || !amount}
                                >
                                    {sending ? (
                                        <><Loader2 className={styles.spin} size={18} /> Enviando...</>
                                    ) : (
                                        <><ArrowUpFromLine size={16} /> Transferir a exchange</>
                                    )}
                                </button>
                            </form>
                        )
                    ) : (
                        /* Pestaña MoneyGram - abre el WalletRamp directo */
                        <div className={styles.rampPlaceholder}>
                            {isRampOpen && (
                                <WalletRamp
                                    isOpen={isRampOpen}
                                    onClose={() => { setIsRampOpen(false); onClose(); }}
                                    onRefreshBalance={onRefreshBalance}
                                />
                            )}
                            {!isRampOpen && (
                                <button
                                    className={styles.openRampBtn}
                                    onClick={() => setIsRampOpen(true)}
                                >
                                    <ExternalLink size={16} />
                                    Abrir retiro en Oxxo
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>,
        document.body
    );
}
