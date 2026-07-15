import { useRef, useState, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase.js';
import { motion } from 'framer-motion';
import { Wallet, RefreshCw, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import useStore from '../../store';
import useWallet from '../../hooks/useWallet';
import WalletRamp from '../WalletRamp/WalletRamp';
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
    const { mxneBalance, balance, currency, user, balanceLoading } = useStore();
    const { fetchBalance } = useWallet();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isRampOpen, setIsRampOpen] = useState(false);
    const [isDepositOpen, setIsDepositOpen] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);

    const panelRef = useRef(null);
    const contentRef = useRef(null);
    const buttonRef = useRef(null);

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
            // Animacion mas exagerada: slide+rotate+blur con bounce
            gsap.to(panelRef.current, {
                y: 0,
                opacity: 1,
                scale: 1,
                rotate: 0,
                filter: 'blur(0px)',
                duration: 0.7,
                ease: 'shekael-bounce',
                onStart: () => {
                    // Los hijos con stagger mas marcado
                    if (contentRef.current) {
                        gsap.fromTo(contentRef.current.children,
                            { opacity: 0, y: 12 },
                            { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, delay: 0.15, ease: 'power3.out' }
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
            duration: 0.35,
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

    const mxneAmount = parseFloat(mxneBalance || balance || 0);
    const shortKey = user?.stellarPublicKey
        ? `${user.stellarPublicKey.slice(0, 5)}...${user.stellarPublicKey.slice(-4)}`
        : '';

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
                    <motion.div
                        key={`mxne-${mxneAmount}`}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={styles.balanceDisplay}
                    >
                        <span className={styles.balanceAmount}>
                            {mxneAmount.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })}
                        </span>
                        <span className={styles.balanceCurrency}>MXNe</span>
                    </motion.div>
                )}
                {shortKey && (
                    <span className={styles.pubKey}>{shortKey}</span>
                )}
            </div>

            <div className={styles.actions}>
                <button
                    className={styles.depositBtn}
                    onClick={(e) => { e.stopPropagation(); setIsDepositOpen(true); }}
                >
                    <ArrowDownToLine size={14} />
                    Depositar
                </button>
                {mxneAmount > 0 && (
                    <button
                        className={styles.withdrawBtn}
                        onClick={(e) => { e.stopPropagation(); setIsRampOpen(true); }}
                    >
                        <ArrowUpFromLine size={14} />
                        Retirar
                    </button>
                )}
            </div>

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
                        {mxneAmount.toFixed(2)}
                    </span>
                    <span className={styles.floatCurrency}>MXNe</span>
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
