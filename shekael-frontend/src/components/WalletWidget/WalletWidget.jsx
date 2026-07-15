import { useRef, useState, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import { motion } from 'framer-motion';
import { Wallet, RefreshCw, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import useStore from '../../store';
import useWallet from '../../hooks/useWallet';
import WalletRamp from '../WalletRamp/WalletRamp';
import DepositModal from '../DepositModal/DepositModal';
import styles from './WalletWidget.module.css';

const NUM_PARTICLES = 12;

export function WalletWidget({ variant = 'default' }) {
    const { mxneBalance, balance, currency, user, balanceLoading } = useStore();
    const { fetchBalance } = useWallet();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isRampOpen, setIsRampOpen] = useState(false);
    const [isDepositOpen, setIsDepositOpen] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);

    const panelRef = useRef(null);
    const particlesRef = useRef(null);
    const buttonRef = useRef(null);

    // ── Bubble inflate ──
    const animateIn = useCallback(() => {
        setShouldRender(true);
        requestAnimationFrame(() => {
            if (!panelRef.current) return;
            // Reset particles
            if (particlesRef.current) {
                gsap.set(particlesRef.current.children, {
                    x: 0, y: 0, scale: 1, opacity: 0.5
                });
            }
            // Bubble inflate from bottom-right
            gsap.set(panelRef.current, {
                scale: 0,
                opacity: 0,
                transformOrigin: 'bottom right',
            });
            gsap.to(panelRef.current, {
                scale: 1,
                opacity: 1,
                duration: 0.45,
                ease: 'back.out(3)',
            });
        });
    }, []);

    // ── Bubble pop ──
    const animateOut = useCallback(() => {
        if (!panelRef.current) return;

        const tl = gsap.timeline({
            onComplete: () => setShouldRender(false),
        });

        // Stretch like bubble about to pop
        tl.to(panelRef.current, {
            scale: 1.08,
            y: -4,
            duration: 0.1,
            ease: 'power1.out',
        })
        // POP!
        .to(panelRef.current, {
            scale: 0.01,
            y: -18,
            opacity: 0,
            duration: 0.25,
            ease: 'back.in(3)',
            onStart: burstParticles,
            onComplete: () => {
                if (panelRef.current) gsap.set(panelRef.current, { y: 0 });
            }
        });
    }, []);

    // ── Burst particles ──
    const burstParticles = useCallback(() => {
        if (!particlesRef?.current) return;
        const children = particlesRef.current.children;
        if (!children?.length) return;

        gsap.to(children, {
            x: () => gsap.utils.random(-80, 80),
            y: () => gsap.utils.random(-80, 80),
            scale: 0,
            opacity: 0,
            duration: 0.55,
            ease: 'power2.out',
            stagger: 0.015,
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
                    <div className={styles.popWrapper}>
                        <div ref={particlesRef} className={styles.particles}>
                            {Array.from({ length: NUM_PARTICLES }).map((_, i) => (
                                <div
                                    key={i}
                                    className={styles.particle}
                                    style={{
                                        width: 4 + (i % 3) * 2,
                                        height: 4 + (i % 3) * 2,
                                        background: i % 2 === 0
                                            ? 'var(--color-text-muted)'
                                            : 'var(--color-text-dim)',
                                    }}
                                />
                            ))}
                        </div>
                        <div ref={panelRef} className={styles.floatingPanel}>
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
