import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, RefreshCw, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import useStore from '../../store';
import useWallet from '../../hooks/useWallet';
import WalletRamp from '../WalletRamp/WalletRamp';
import DepositModal from '../DepositModal/DepositModal';
import styles from './WalletWidget.module.css';

export function WalletWidget({ variant = 'default' }) {
    const { mxneBalance, balance, currency, user, balanceLoading } = useStore();
    const { fetchBalance } = useWallet();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isRampOpen, setIsRampOpen] = useState(false);
    const [isDepositOpen, setIsDepositOpen] = useState(false);

    useEffect(() => {
        if (user) fetchBalance();
    }, [user, fetchBalance]);

    const mxneAmount = parseFloat(mxneBalance || balance || 0);
    const shortKey = user?.stellarPublicKey
        ? `${user.stellarPublicKey.slice(0, 5)}...${user.stellarPublicKey.slice(-4)}`
        : '';

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
                    className={`${styles.floatingBtn} ${isExpanded ? styles.active : ''}`}
                    onClick={() => setIsExpanded(!isExpanded)}
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
