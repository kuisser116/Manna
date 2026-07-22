import { useRef, useState, useEffect, useCallback } from 'react';
import { getMxnRate } from '../../api/price.api';
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase.js';
import { motion } from 'framer-motion';
import { Wallet, RefreshCw, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import useStore from '../../store';
import useWallet from '../../hooks/useWallet';
import WithdrawModal from '../WithdrawModal/WithdrawModal';
import DepositModal from '../DepositModal/DepositModal';
import styles from './WalletWidget.module.css';

// Registrar CustomEase una sola vez (como en Landing.jsx)
gsap.registerPlugin(CustomEase);
try {
    CustomEase.create('shekael-bounce', 'M0,0 C0.3,0.9 0.4,1.2 0.5,1 C0.6,0.8 0.7,1.1 1,1');
} catch (e) {
    // Ya registrado
}

export function WalletWidget({ variant = 'default' }) {
    const { balance, currency, user, balanceLoading, walletNotFunded } = useStore();
    const { fetchBalance } = useWallet();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
    const [isDepositOpen, setIsDepositOpen] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const [mxnRate, setMxnRate] = useState(18.50);

    // Obtener tipo de cambio USD/MXN
    useEffect(() => {
        getMxnRate().then(setMxnRate).catch(() => {});
    }, []);

    const panelRef = useRef(null);
    const contentRef = useRef(null);
    const buttonRef = useRef(null);

    // Auto‑cargar saldo al montar y cuando cambie el usuario (login)
    useEffect(() => {
        fetchBalance();
    }, [user?.stellarPublicKey]);
    // eslint-disable-next-line react-hooks/exhaustive-deps — solo queremos que corra al montar / login

    // ── Slide up reveal (como hero de Landing) ──
    const animateIn = useCallback(() => {
        setShouldRender(true);
        // El panel ya tiene opacity: 0 en CSS, no hay flash al montar
        requestAnimationFrame(() => {
            if (!panelRef.current) return;
            // Estado inicial: mas abajo, mas pequeno, con tilt
            gsap.set(panelRef.current, {
                y: 36,
                scale: 0.85,
                rotate: -3,
                filter: 'blur(8px)',
                transformOrigin: 'bottom right',
            });
            // Animacion: slide+rotate+blur con elastic bounce (como tutorial Shekael)
            gsap.to(panelRef.current, {
                y: 0,
                opacity: 1,
                scale: 1,
                rotate: 0,
                filter: 'blur(0px)',
                duration: 0.6,
                ease: 'elastic.out(1, 0.5)',
                onStart: () => {
                    // Los hijos con stagger mas marcado
                    if (contentRef.current) {
                        gsap.fromTo(contentRef.current.children,
                            { opacity: 0, y: 12, scale: 0.95 },
                            { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.05, delay: 0.12, ease: 'elastic.out(1, 0.5)' }
                        );
                    }
                }
            });
        });
    }, []);

    // ── Slide down fade out (reversa) ──
    const animateOut = useCallback(() => {
        if (!panelRef.current) return;

        gsap.to(panelRef.current, {
            y: 24,
            opacity: 0,
            scale: 0.92,
            rotate: 2,
            filter: 'blur(6px)',
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => setShouldRender(false),
        });
    }, []);

    // ── Sync expand state with animation ──
    useEffect(() => {
        if (isExpanded) {
            animateIn();
        } else if (shouldRender) {
            animateOut();
        }
    }, [isExpanded, animateIn, animateOut, shouldRender]);

    const usdcAmount = parseFloat(balance || "0");
    const shortKey = user?.stellarPublicKey
        ? `${user.stellarPublicKey.slice(0, 5)}...${user.stellarPublicKey.slice(-4)}`
        : '';

    // ── Click outside handler ──
    useEffect(() => {
        if (!isExpanded || variant !== 'floating') return;

        const handleClickOutside = (e) => {
            if (
                panelRef.current && !panelRef.current.contains(e.target) &&
                buttonRef.current && !buttonRef.current.contains(e.target)
            ) {
                setIsExpanded(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isExpanded, variant]);

    // ── Toggle handler ──
    const togglePanel = useCallback(() => {
        if (isExpanded) {
            // Start closing - animateOut will run via useEffect
            setIsExpanded(false);
        } else {
            setIsExpanded(true);
        }
    }, [isExpanded]);

    // ── Contenido compartido ──
    const WidgetContent = (
        <>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <div className={styles.iconWrap}>
                        <Wallet size={16} />
                    </div>
                    <span className={styles.label}>Billetera</span>
                </div>
                <button
                    className={styles.refreshBtn}
                    onClick={(e) => { e.stopPropagation(); fetchBalance(); }}
                    disabled={balanceLoading}
                    title="Actualizar"
                >
                    <RefreshCw size={13} className={balanceLoading ? styles.spin : ''} />
                </button>
            </div>

            <div className={styles.balanceSection}>
                {balanceLoading ? (
                    <div className={styles.skeleton} />
                ) : (
                    <>
                        <motion.div
                            key={`usdc-${usdcAmount}`}
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={styles.balanceDisplay}
                        >
                            <span className={styles.balanceAmount}>
                                { (usdcAmount * mxnRate).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                })}
                            </span>
                            <span className={styles.balanceCurrency}>MXN</span>
                        </motion.div>
                        {shortKey && (
                            <span className={styles.pubKey}>{shortKey}</span>
                        )}
                    </>
                )}
            </div>

            {walletNotFunded && (
                <div className={styles.xlmNotice}>
                    <span className={styles.xlmNoticeIcon}>ⓘ</span>
                    <span className={styles.xlmNoticeText}>
                        Para activar tu cuenta necesitas enviar <strong>~2 XLM</strong> desde Bitso a tu dirección. Después puedes depositar USDC (lo ves como MXN).
                    </span>
                </div>
            )}

            {/* Bonus promocional */}
            {user?.bonus_total_mxn > 0 && user?.tutorial_completed && (
                <div className={styles.bonusSection}>
                    <div className={styles.bonusHeader}>
                        <span className={styles.bonusLabel}>Ganado del bono</span>
                        <span className={styles.bonusAmount}>
                            ${parseFloat(user.bonus_released_mxn || 0).toFixed(2)} MXN
                            <span className={styles.bonusTotal}> / ${user.bonus_total_mxn} MXN</span>
                        </span>
                    </div>
                    <div className={styles.bonusBar}>
                        <div
                            className={styles.bonusBarFill}
                            style={{
                                width: `${Math.min(100, ((user.bonus_released_mxn || 0) / user.bonus_total_mxn) * 100)}%`
                            }}
                        />
                    </div>
                    {user.bonus_expires_at && !user.bonus_expired && (
                        <span className={styles.bonusExpiry}>
                            Expira {(new Date(user.bonus_expires_at)).toLocaleDateString()}
                        </span>
                    )}
                    {user.bonus_expired && (
                        <span className={styles.bonusExpired}>
                            Bono expirado
                        </span>
                    )}
                </div>
            )}

            <div className={styles.actions}>
                <button
                    className={styles.depositBtn}
                    onClick={(e) => { e.stopPropagation(); setIsDepositOpen(true); }}
                >
                    <ArrowDownToLine size={14} />
                    Depositar
                </button>
                {usdcAmount > 0 && (
                    <button
                        className={styles.withdrawBtn}
                        onClick={(e) => { e.stopPropagation(); setIsWithdrawOpen(true); }}
                    >
                        <ArrowUpFromLine size={14} />
                        Retirar
                    </button>
                )}
            </div>

            <WithdrawModal
                isOpen={isWithdrawOpen}
                onClose={() => setIsWithdrawOpen(false)}
                onRefreshBalance={() => fetchBalance()}
            />
            <DepositModal
                isOpen={isDepositOpen}
                onClose={() => setIsDepositOpen(false)}
            />
        </>
    );

    // ── Variante FLOTANTE ──
    if (variant === 'floating') {
        return (
            <div className={styles.floatingWrapper}>
                {shouldRender && (
                    <div ref={panelRef} className={styles.floatingPanel}>
                        <div ref={contentRef}>
                            {WidgetContent}
                        </div>
                    </div>
                )}

                <motion.button
                    ref={buttonRef}
                    className={`${styles.floatingBtn} ${isExpanded ? styles.active : ''}`}
                    onClick={togglePanel}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <Wallet size={15} />
                    <span className={styles.floatBalance}>
                        {(usdcAmount * mxnRate).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                    <span className={styles.floatCurrency}>MXN</span>
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
