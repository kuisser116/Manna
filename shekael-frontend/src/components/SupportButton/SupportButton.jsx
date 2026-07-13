import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, X, ChevronDown, Sparkles } from 'lucide-react';
import useStore from '../../store';
import useWallet from '../../hooks/useWallet';
import useFeedbackModal from '../FeedbackModal/useFeedbackModal';
import FeedbackModal from '../FeedbackModal/FeedbackModal';
import styles from './SupportButton.module.css';

const PRESETS = [5, 10, 25, 50, 100];

function Particles({ show, originX, originY }) {
    const particles = Array.from({ length: 8 }, (_, i) => i);
    return (
        <AnimatePresence>
            {show && particles.map((i) => {
                const angle = (i / particles.length) * Math.PI * 2;
                const dist = 36 + Math.random() * 24;
                const tx = Math.cos(angle) * dist;
                const ty = Math.sin(angle) * dist - 16;
                return (
                    <motion.div
                        key={i}
                        className={styles.particle}
                        style={{ left: originX, top: originY }}
                        initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                        animate={{ opacity: 0, scale: 0, x: tx, y: ty }}
                        transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.03 }}
                    />
                );
            })}
        </AnimatePresence>
    );
}

export function SupportButton({ recipientKey, postId, supportsCount = 0 }) {
    const { user, mxneBalance } = useStore();
    const { sendSupport } = useWallet();
    const { modalState, showLoading, showSuccess, showError, hideModal } = useFeedbackModal();
    const [supported, setSupported] = useState(false);
    const [count, setCount] = useState(supportsCount);
    const [showParticles, setShowParticles] = useState(false);
    const [origin, setOrigin] = useState({ x: 0, y: 0 });
    const [modalOpen, setModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [customAmount, setCustomAmount] = useState('10');
    const [showCustom, setShowCustom] = useState(false);

    const currentBalance = parseFloat(mxneBalance || '0');

    const handleClick = (e) => {
        if (supported || !user || loading) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setOrigin({ x: rect.width / 2, y: rect.height / 2 });
        setModalOpen(true);
    };

    const selectPreset = (val) => {
        setCustomAmount(String(val));
        setShowCustom(false);
    };

    const handleConfirm = async () => {
        const amountToDonate = parseFloat(customAmount || '0');

        if (isNaN(amountToDonate) || amountToDonate <= 0) {
            showError('Monto inválido', 'Ingresa un monto mayor a 0');
            setModalOpen(false);
            return;
        }

        if (currentBalance < amountToDonate) {
            showError('Fondos insuficientes', `Tu saldo es ${currentBalance.toFixed(2)} MXne y quieres enviar ${amountToDonate} MXne.`);
            setModalOpen(false);
            return;
        }

        setLoading(true);
        try {
            showLoading('Enviando apoyo...', 'Firmando en Stellar Testnet...');
            const result = await sendSupport(recipientKey, postId, customAmount.toString());
            setSupported(true);
            setCount((c) => c + 1);
            setShowParticles(true);
            setLoading(false);
            setModalOpen(false);
            setTimeout(() => setShowParticles(false), 700);

            const hash = result?.hash;
            const explorerMsg = hash && !hash.startsWith('demo-')
                ? `TX confirmada · Ver en Stellar Explorer`
                : `${customAmount} MXne enviado al creador`;

            showSuccess('¡Apoyo enviado!', explorerMsg, true);
        } catch (err) {
            hideModal();
            setLoading(false);
            const errorCode = err.response?.data?.code || err.code;
            if (errorCode === 'WALLET_NOT_ACTIVE') {
                showError('Billetera Inactiva', 'El creador necesita completar sus tareas para recibir fondos reales.', true);
            } else {
                showError('Error', err.response?.data?.message || err.message || 'Inténtalo de nuevo', true);
            }
        }
    };

    return (
        <div className={styles.wrapper}>
            <motion.button
                className={`${styles.btn} ${supported ? styles.supported : ''}`}
                onClick={handleClick}
                whileTap={{ scale: 0.88 }}
                whileHover={{ scale: 1.06 }}
                disabled={supported}
            >
                <Particles show={showParticles} originX={origin.x} originY={origin.y} />
                <Heart size={14} className={styles.heartIcon} />
                <span>{supported ? 'Apoyado' : 'Apoyar'}</span>
                {count > 0 && <span className={styles.count}>{count}</span>}
            </motion.button>

            <AnimatePresence>
                {modalOpen && (
                    <motion.div
                        className={styles.overlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => { if (!loading) setModalOpen(false); }}
                    >
                        <motion.div
                            className={styles.supportModal}
                            initial={{ opacity: 0, scale: 0.92, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: 30 }}
                            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button className={styles.modalClose} onClick={() => setModalOpen(false)} disabled={loading}>
                                <X size={18} />
                            </button>

                            <div className={styles.modalIcon}>
                                <Heart size={28} />
                            </div>

                            <h3 className={styles.modalTitle}>Apoyar contenido</h3>
                            <p className={styles.modalDesc}>
                                Elige cuánto MXne enviar a este creador como reconocimiento.
                            </p>

                            <div className={styles.balance}>
                                <span className={styles.balanceLabel}>Disponible</span>
                                <span className={styles.balanceValue}>{currentBalance.toFixed(2)} MXne</span>
                            </div>

                            <div className={styles.presets}>
                                {PRESETS.map((val) => (
                                    <button
                                        key={val}
                                        type="button"
                                        className={`${styles.presetBtn} ${customAmount === String(val) && !showCustom ? styles.presetActive : ''}`}
                                        onClick={() => selectPreset(val)}
                                    >
                                        {val} MXne
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    className={`${styles.presetBtn} ${styles.presetCustom} ${showCustom ? styles.presetActive : ''}`}
                                    onClick={() => { setShowCustom(true); setCustomAmount(''); }}
                                >
                                    <Sparkles size={13} />
                                    Personalizado
                                </button>
                            </div>

                            {showCustom && (
                                <motion.div
                                    className={styles.customField}
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                >
                                    <div className={styles.inputWrap}>
                                        <input
                                            type="number"
                                            value={customAmount}
                                            onChange={(e) => setCustomAmount(e.target.value)}
                                            min="1"
                                            step="1"
                                            placeholder="0"
                                            className={styles.amountInput}
                                            autoFocus
                                        />
                                        <span className={styles.inputSuffix}>MXne</span>
                                    </div>
                                </motion.div>
                            )}

                            <div className={styles.modalActions}>
                                <button
                                    className={styles.cancelBtn}
                                    onClick={() => setModalOpen(false)}
                                    disabled={loading}
                                >
                                    Cancelar
                                </button>
                                <button
                                    className={styles.confirmBtn}
                                    onClick={handleConfirm}
                                    disabled={loading || !customAmount || parseFloat(customAmount) <= 0}
                                >
                                    {loading ? (
                                        <span className={styles.spinner} />
                                    ) : (
                                        <>
                                            <Heart size={15} />
                                            Apoyar con {customAmount || '0'} MXne
                                        </>
                                    )}
                                </button>
                            </div>

                            <p className={styles.stellarNote}>
                                Transacción en Stellar Testnet · irreversible
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <FeedbackModal
                isOpen={modalState.isOpen}
                onClose={hideModal}
                type={modalState.type}
                title={modalState.title}
                message={modalState.message}
                showCloseButton={modalState.showCloseButton}
                autoClose={modalState.autoClose}
                autoCloseDelay={modalState.autoCloseDelay}
            />
        </div>
    );
}

export default SupportButton;
