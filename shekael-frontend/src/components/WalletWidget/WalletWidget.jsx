import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, TrendingUp, ExternalLink, RefreshCw, PlaySquare, Heart, UserPlus, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useStore from '../../store';
import useWallet from '../../hooks/useWallet';
import { useQuests } from '../../hooks/useQuests';
import { verifyWallet } from '../../api/users.api';
import Confetti from 'react-confetti';
import WalletRamp from '../WalletRamp/WalletRamp';
import DepositModal from '../DepositModal/DepositModal';
import { Gift } from 'lucide-react';
import styles from './WalletWidget.module.css';

const EXPLORER_BASE = 'https://stellar.expert/explorer/testnet/account/';

function QuestProgress({ pct, icon: Icon, label }) {
    const radius = 16;
    const circumference = 2 * Math.PI * radius;
    const safePct = Math.min(Math.max(pct, 0), 100);
    const strokeDashoffset = circumference - (safePct / 100) * circumference;
    const isDone = safePct >= 100;

    return (
        <div className={`${styles.questItem} ${isDone ? styles.questDone : ''}`}>
            <div className={styles.questCircleWrap}>
                <svg width="36" height="36" className={styles.questSvg}>
                    <circle cx="18" cy="18" r={radius} stroke="var(--color-surface-2)" strokeWidth="3" fill="none" />
                    <circle
                        cx="18"
                        cy="18"
                        r={radius}
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        className={styles.questRing}
                    />
                </svg>
                <div className={styles.questIcon}>
                    {isDone ? <Check size={14} /> : <Icon size={14} />}
                </div>
            </div>
            <div className={styles.questLabel}>
                <span className={styles.questLabelText}>{label}</span>
            </div>
        </div>
    );
}

export function WalletWidget({ variant = 'default' }) {
    const { t } = useTranslation();
    const { balance, balanceMXN, mxneBalance, currency, user, balanceLoading } = useStore();
    const { fetchBalance } = useWallet();
    const { progress, status, hints, tasks, fetchStatus } = useQuests();
    const [showConfetti, setShowConfetti] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    // Tasa de cambio en tiempo real (por defecto 20.00 como fallback)
    const [usdRate, setUsdRate] = useState(20.00);
    const [isRampOpen, setIsRampOpen] = useState(false);
    const [isDepositOpen, setIsDepositOpen] = useState(false);

    // Obtener tasa real al montar
    useEffect(() => {
        fetch('https://api.frankfurter.app/latest?from=USD&to=MXN')
            .then(res => res.json())
            .then(data => {
                if (data?.rates?.MXN) setUsdRate(data.rates.MXN);
            })
            .catch(() => void('Usando tasa MXN de fallback'));
    }, []);

    useEffect(() => {
        if (user) {
            fetchBalance();
            fetchStatus();
        }
    }, [user, fetchBalance, fetchStatus]);

    // Refrescar misiones cuando se dispara el evento desde Profile/PostCard
    useEffect(() => {
        const handleQuestRefresh = () => {
            void('[WalletWidget] Event received: Shekael:quest-refresh');
            fetchStatus();
        };
        window.addEventListener('Shekael:quest-refresh', handleQuestRefresh);
        return () => window.removeEventListener('Shekael:quest-refresh', handleQuestRefresh);
    }, [fetchStatus]);

    // Confetti al completar misiones
    useEffect(() => {
        const handleCelebration = () => {
            setShowConfetti(true);
            setTimeout(() => {
                setShowConfetti(false);
                fetchBalance();
            }, 6000);
        };
        window.addEventListener('Shekael:celebration', handleCelebration);
        return () => window.removeEventListener('Shekael:celebration', handleCelebration);
    }, [fetchBalance]);

    const explorerUrl = user?.stellarPublicKey
        ? `${EXPLORER_BASE}${user.stellarPublicKey}`
        : null;

    const shortKey = user?.stellarPublicKey
        ? `${user.stellarPublicKey.slice(0, 6)}...${user.stellarPublicKey.slice(-4)}`
        : 'Wallet no conectada';

    const showMissions = (!balance || parseFloat(balance) <= 0) && status === 'pending';

    // ── Variante MINI ──
    if (variant === 'mini') {
        return (
            <div className={styles.miniContainer}>
                <Wallet size={12} className={styles.miniIcon} />
                <span className={styles.miniBalance}>
                    {balanceLoading ? '...' : parseFloat(balance || 0).toFixed(2)}
                    <span className={styles.miniCurrency}> {currency}</span>
                </span>
            </div>
        );
    }

    // ── Contenido compartido ──
    const WidgetContent = (
        <>
            {showConfetti && <Confetti width={300} height={200} recycle={false} numberOfPieces={200} />}
            <div className={styles.header}>
                <div className={styles.iconWrap}>
                    <Wallet size={18} color="var(--color-primary)" />
                </div>
                <span className={styles.label}>{t('wallet.yourWallet')}</span>
                <button
                    className={styles.refreshBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        fetchBalance(); fetchStatus();
                    }}
                    disabled={balanceLoading}
                    title="Actualizar"
                >
                    <RefreshCw size={13} className={balanceLoading ? styles.spinning : ''} />
                </button>
            </div>

            {showMissions ? (
                <div className={styles.progressSection}>
                    <p className={styles.progressTitle}> Activa tu Wallet</p>
                    <p className={styles.progressSubtitle}>Completa estas tareas para recibir tu bono:</p>
                    {tasks ? (
                        <div className={styles.questList}>
                            <QuestProgress
                                pct={tasks.watch.pct}
                                icon={PlaySquare}
                                label={`Ver ${Math.ceil(tasks.watch.target / 60)} min de videos`}
                            />
                            <QuestProgress
                                pct={tasks.likes.pct}
                                icon={Heart}
                                label={`Dar ${tasks.likes.target} Likes`}
                            />
                            <QuestProgress
                                pct={tasks.follows.pct}
                                icon={UserPlus}
                                label={`Seguir a ${tasks.follows.target} creadores`}
                            />
                        </div>
                    ) : hints.length > 0 ? (
                        <ul className={styles.hintList}>
                            {hints.map((h, i) => (
                                <li key={i} className={styles.hintItem}>{h}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className={styles.hintItem}>¡Casi listo! Sigue interactuando con la app.</p>
                    )}
                    <div className={styles.progressBarContainer}>
                        <motion.div
                            className={styles.progressBarFill}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.5 }}
                        />
                    </div>
                    <p className={styles.progressPct}>{progress}% completado</p>
                </div>
            ) : (
                <>
                    <div className={styles.balanceRow}>
                        {balanceLoading ? (
                            <div className={styles.skeleton} />
                        ) : (
                            <motion.div
                                key={`${balance}-${mxneBalance}`}
                                className={styles.balanceContainer}
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                            >
                                <div className={styles.balanceContainer}>
                                    <p className={styles.balanceLabel}>{t('wallet.personalBalance')}</p>
                                    <div className={styles.mainBalance}>
                                        <h2 className={styles.amount}>
                                            {balanceLoading ? '...' : Number(balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            <span className={styles.currency}> {currency}</span>
                                        </h2>
                                    </div>
                                    {currency !== 'XLM' && (
                                        <div className={styles.secondaryBalance}>
                                            <span>≈ {(parseFloat(balance || 0) / (usdRate || 20)).toFixed(2)} USDC</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </div>

                    <div className={styles.todayRow}>
                        <TrendingUp size={13} color="var(--color-success)" />
                        <span className={styles.todayText}>Stellar Testnet</span>
                    </div>

                    <div className={styles.pubKey}>{shortKey}</div>

                    {explorerUrl && (
                        <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.historyBtn}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ExternalLink size={14} />
                            Ver en Explorer
                        </a>
                    )}

                    <div className={styles.walletActions}>
                        <button
                            className={styles.depositBtn}
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsDepositOpen(true);
                            }}
                        >
                            Depositar
                        </button>
                        {!balanceLoading && (parseFloat(mxneBalance || 0) > 0 || (currency !== 'XLM' && parseFloat(balance) > 0)) && (
                            <button
                                className={styles.rampBtn}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsRampOpen(true);
                                }}
                            >
                                {t('wallet.withdrawOxxo')}
                            </button>
                        )}
                    </div>

                    {!balanceLoading && parseFloat(balance || 0) <= 0 && (
                        <button
                            className={styles.repairLink}
                            onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                    await verifyWallet();
                                    fetchBalance();
                                    fetchStatus();
                                } catch (err) {
                                    console.error('Repair failed', err);
                                }
                            }}
                        >
                            ¿No ves tu bono? Verificar
                        </button>
                    )}
                </>
            )}

            <WalletRamp
                isOpen={isRampOpen}
                onClose={() => setIsRampOpen(false)}
                onRefreshBalance={() => fetchBalance()}
            />
            <DepositModal
                isOpen={isDepositOpen}
                onClose={() => setIsDepositOpen(false)}
            />
        </>
    );

    // ── Variante FLOATING ──
    if (variant === 'floating') {
        return (
            <div className={styles.floatingWrapper}>
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            className={styles.floatingPanel}
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        >
                            {WidgetContent}
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.button
                    className={`${styles.floatingButton} ${isExpanded ? styles.active : ''}`}
                    onClick={() => setIsExpanded(!isExpanded)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <div className={styles.buttonBalance}>
                        <Wallet size={16} />
                        <span>{parseFloat(mxneBalance || balanceMXN || 0).toFixed(2)}</span>
                        <span className={styles.btnCurrency}> MXNe</span>
                    </div>
                </motion.button>
            </div>
        );
    }

    // ── Variante DEFAULT ──
    return (
        <motion.div
            className={styles.widget}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
        >
            {WidgetContent}
        </motion.div>
    );
}

export default WalletWidget;