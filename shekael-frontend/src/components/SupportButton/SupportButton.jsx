import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, X, ChevronDown, Sparkles } from 'lucide-react';
import useStore from '../../store';
import useWallet from '../../hooks/useWallet';

import PinKeypad, { pinHash } from '../PinKeypad/PinKeypad';
import { verifyPin as apiVerifyPin } from '../../api/auth.api';
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
    const { user, balance, addToast } = useStore();
    const { sendSupport } = useWallet();
    const [supported, setSupported] = useState(false);
    const [count, setCount] = useState(supportsCount);
    const [showParticles, setShowParticles] = useState(false);
    const [origin, setOrigin] = useState({ x: 0, y: 0 });
    const [modalOpen, setModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [customAmount, setCustomAmount] = useState('10');
    const [showCustom, setShowCustom] = useState(false);
    const [pinModalOpen, setPinModalOpen] = useState(false);

    // Bloquear scroll del body cuando el modal está abierto
    useEffect(() => {
        if (modalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [modalOpen]);

    const currentBalance = parseFloat(balance || "0");

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
            addToast('error', 'Monto inválido', 'Ingresa un monto mayor a 0');
            setModalOpen(false);
            return;
        }

        if (currentBalance < amountToDonate) {
            addToast('error', 'Fondos insuficientes', `Tu saldo es ${currentBalance.toFixed(2)} USDC y quieres enviar ${amountToDonate} USDC.`);
            setModalOpen(false);
            return;
        }

        // Cerrar modal de apoyo y abrir modal de PIN
        setModalOpen(false);
        setPinModalOpen(true);
    };

    const handlePinVerified = async (enteredPin) => {
        setLoading(true);
        try {
            // Verificar PIN contra el servidor
            const hash = pinHash(enteredPin);
            await apiVerifyPin(hash);

            const result = await sendSupport(recipientKey, postId, customAmount.toString());
            setSupported(true);
            setCount((c) => c + 1);
            setShowParticles(true);
            setPinModalOpen(false);
            setLoading(false);
            setTimeout(() => setShowParticles(false), 700);

            const hashResult = result?.hash;
            const explorerMsg = hashResult && !hashResult.startsWith('demo-')
                ? `TX confirmada · Ver en Stellar Explorer`
                : `${customAmount} USDC enviado al creador`;

            addToast('success', '¡Apoyo enviado!', explorerMsg);
        } catch (err) {
            setLoading(false);
            const errorCode = err.response?.data?.code || err.code;
            if (errorCode === 'WALLET_NOT_ACTIVE') {
                addToast('error', 'Billetera Inactiva', 'El creador necesita completar sus tareas para recibir fondos reales.');
            } else {
                const msg = err.response?.data?.message || err.message || 'Inténtalo de nuevo';
                addToast('error', 'Error', msg);
                throw err; // <-- importante: relanzar para que PinKeypad muestre error
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

            {createPortal(
                <AnimatePresence>
                {modalOpen && (
                    <motion.div
                        className={styles.overlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
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
                                Elige cuánto USDC enviar a este creador como reconocimiento.
                            </p>

                            <div className={styles.balance}>
                                <span className={styles.balanceLabel}>Disponible</span>
                                <span className={styles.balanceValue}>{currentBalance.toFixed(2)} USDC</span>
                            </div>

                            <div className={styles.presets}>
                                {PRESETS.map((val) => (
                                    <button
                                        key={val}
                                        type="button"
                                        className={`${styles.presetBtn} ${customAmount === String(val) && !showCustom ? styles.presetActive : ''}`}
                                        onClick={() => selectPreset(val)}
                                    >
                                        {val} USDC
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
                                        <span className={styles.inputSuffix}>USDC</span>
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
                                            Apoyar con {customAmount || '0'} USDC
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
            </AnimatePresence>,
            document.body
            )}

            {pinModalOpen && createPortal(
                <div
                    className={styles.pinOverlay}
                    onClick={(e) => {
                        // Solo cerrar si clickeó directamente el overlay, no el modal interno
                        if (e.target === e.currentTarget) setPinModalOpen(false);
                    }}
                >
                    <PinKeypad
                        mode="enter"
                        onComplete={handlePinVerified}
                        onCancel={() => setPinModalOpen(false)}
                        title="Confirmar transacción"
                        subtitle={`Estás por enviar ${customAmount} USDC. Ingresa tu PIN de seguridad.`}
                    />
                </div>,
                document.body
            )}
        </div>
    );
}

export default SupportButton;
