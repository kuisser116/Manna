import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from '../../store';
import useWallet from '../../hooks/useWallet';
import useFeedbackModal from '../FeedbackModal/useFeedbackModal';
import FeedbackModal from '../FeedbackModal/FeedbackModal';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import styles from './SupportButton.module.css';

// Partículas al hacer clic
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
    const { user, balance, mxneBalance, balanceMXN } = useStore();
    const { sendSupport } = useWallet();
    const { modalState, showLoading, showSuccess, showError, hideModal } = useFeedbackModal();
    const [supported, setSupported] = useState(false);
    const [count, setCount] = useState(supportsCount);
    const [showParticles, setShowParticles] = useState(false);
    const [origin, setOrigin] = useState({ x: 0, y: 0 });
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [customAmount, setCustomAmount] = useState('10');

    const currentBalance = parseFloat(mxneBalance || balanceMXN || balance || '0');

    const handleClick = (e) => {
        if (supported || !user) return;

        const rect = e.currentTarget.getBoundingClientRect();
        setOrigin({ x: rect.width / 2, y: rect.height / 2 });
        setConfirmOpen(true);
    };

    const handleConfirm = async () => {
        const amountToDonate = parseFloat(customAmount || '0');

        if (isNaN(amountToDonate) || amountToDonate <= 0) {
            showError('Monto inválido', 'Por favor ingresa un monto válido mayor a 0');
            setConfirmOpen(false);
            return;
        }

        if (currentBalance < amountToDonate) {
            showError('Fondos insuficientes', `No tienes fondos suficientes. Tu saldo es ${currentBalance} MXne y quieres donar ${amountToDonate} MXne.`);
            setConfirmOpen(false);
            return;
        }

        setConfirmLoading(true);
        try {
            showLoading('Enviando apoyo...', '⛓️ Firmando en Stellar Testnet...');
            const result = await sendSupport(recipientKey, postId, customAmount.toString());
            setSupported(true);
            setCount((c) => c + 1);
            setShowParticles(true);
            setTimeout(() => setShowParticles(false), 700);

            const hash = result?.hash;
            const explorerMsg = hash && !hash.startsWith('demo-')
                ? `✅ TX confirmada · Ver en Stellar Explorer\nhttps://stellar.expert/explorer/testnet/tx/${hash}`
                : `${customAmount} MXne enviado al creador`;

            showSuccess('¡Apoyo enviado!', explorerMsg, true);
        } catch (err) {
            hideModal();
            const errorCode = err.response?.data?.code || err.code;
            if (errorCode === 'WALLET_NOT_ACTIVE') {
                showError(
                    'Billetera Inactiva', 
                    'El creador aún no tiene su billetera activa. Necesita completar sus tareas del tutorial para poder recibir fondos reales.',
                    true
                );
            } else {
                showError('Error', err.response?.data?.message || err.message || 'Inténtalo de nuevo', true);
            }
        } finally {
            setConfirmLoading(false);
            setConfirmOpen(false);
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
                <span className={styles.icon}>{supported ? '★' : '☆'}</span>
                <span className={styles.label}>{supported ? 'Apoyado' : 'Apoyar'}</span>
                {count > 0 && <span className={styles.count}>{count}</span>}
            </motion.button>

            <ConfirmModal
                isOpen={confirmOpen}
                onConfirm={handleConfirm}
                onCancel={() => setConfirmOpen(false)}
                title="¿Enviar apoyo?"
                description="Ingresa la cantidad que deseas enviar a este creador como muestra de reconocimiento. La transacción se registrará en la blockchain de Stellar."
                confirmLabel="Sí, apoyar"
                loading={confirmLoading}
            >
                <div className={styles.modalInputWrapper}>
                    <div className={styles.balanceInfo}>
                        Fondos disponibles: <span className={styles.balanceValue}>{currentBalance.toFixed(2)} MXne</span>
                    </div>
                    <label className={styles.modalInputLabel}>Monto a enviar (MXne)</label>
                    <input 
                        type="number" 
                        value={customAmount} 
                        onChange={(e) => setCustomAmount(e.target.value)} 
                        min="1"
                        step="1"
                        placeholder="MXne"
                        className={styles.modalInput}
                    />
                </div>
            </ConfirmModal>

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
