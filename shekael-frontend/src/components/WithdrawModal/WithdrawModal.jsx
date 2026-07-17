import { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { X, ArrowUpFromLine, Loader2, ArrowDownToLine, Wallet, QrCode, ExternalLink, Banknote, Clock, CheckCircle2 } from 'lucide-react';
import useStore from '../../store';
import styles from './WithdrawModal.module.css';

export default function WithdrawModal({ isOpen, onClose, onRefreshBalance }) {
    const { balance } = useStore();
    const overlayRef = useRef(null);
    const panelRef = useRef(null);
    const contentRef = useRef(null);
    const [activeTab, setActiveTab] = useState('exchange');
    const [address, setAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(null);
    const [shouldRender, setShouldRender] = useState(false);

    const usdcAmount = parseFloat(balance || "0");

    const animateIn = useCallback(() => {
        setShouldRender(true);
        requestAnimationFrame(() => {
            if (!panelRef.current) return;

            // Overlay fade-in
            gsap.fromTo(overlayRef.current,
                { opacity: 0 },
                { opacity: 1, duration: 0.25, ease: 'power2.out' }
            );

            // Panel: slide+fade+scale similar to wallet float
            gsap.fromTo(panelRef.current,
                { opacity: 0, y: 40, scale: 0.92, rotate: -2, filter: 'blur(6px)' },
                {
                    opacity: 1, y: 0, scale: 1, rotate: 0, filter: 'blur(0px)',
                    duration: 0.55, ease: 'power3.out', clearProps: 'filter'
                }
            );

            // Content stagger
            const children = contentRef.current?.children;
            if (children) {
                gsap.set(children, { opacity: 0, y: 12 });
                gsap.to(children, {
                    opacity: 1, y: 0,
                    duration: 0.4, stagger: 0.04, delay: 0.15,
                    ease: 'power2.out'
                });
            }
        });
    }, []);

    const animateOut = useCallback((callback) => {
        if (!panelRef.current) { callback?.(); return; }

        const tl = gsap.timeline({
            onComplete: () => {
                setShouldRender(false);
                callback?.();
            }
        });

        tl.to(panelRef.current, {
            opacity: 0, y: 24, scale: 0.95,
            duration: 0.22, ease: 'power2.in'
        });
        tl.to(overlayRef.current, {
            opacity: 0, duration: 0.15, ease: 'power2.out'
        }, '-=0.1');
    }, []);

    const handleClose = useCallback(() => {
        animateOut(onClose);
    }, [animateOut, onClose]);

    // Animate in on open
    useEffect(() => {
        if (isOpen) {
            animateIn();
            // reset state
            setActiveTab('exchange');
            setAddress('');
            setAmount('');
            setSent(false);
            setError(null);
        } else {
            // When isOpen becomes false from parent, clean up
            setShouldRender(false);
        }
    }, [isOpen, animateIn]);

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

    if (!shouldRender && !isOpen) return null;

    return createPortal(
        <div className={styles.overlay} ref={overlayRef} onClick={handleClose}
            style={{ opacity: 0 }}>
            <div className={styles.modal} ref={panelRef}
                onClick={e => e.stopPropagation()}
                style={{ opacity: 0 }}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.titleGroup}>
                        <h3 className={styles.title}>Retirar fondos</h3>
                        <p className={styles.balanceLabel}>
                            <Wallet size={12} />
                            {usdcAmount.toFixed(2)} USDC disponibles
                        </p>
                    </div>
                    <button className={styles.closeBtn} onClick={handleClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'exchange' ? styles.activeTab : ''}`}
                        onClick={() => { setActiveTab('exchange'); setError(null); setSent(false); }}
                    >
                        <ArrowUpFromLine size={14} />
                        <span>A exchange</span>
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'moneygram' ? styles.activeTab : ''}`}
                        onClick={() => { setActiveTab('moneygram'); setError(null); setSent(false); }}
                    >
                        <Banknote size={14} />
                        <span>Efectivo</span>
                    </button>
                </div>

                {/* Content */}
                <div className={styles.content} ref={contentRef}>
                    {activeTab === 'exchange' ? (
                        sent ? (
                            <div className={styles.successBox}>
                                <div className={styles.successIcon}>
                                    <CheckCircle2 size={36} />
                                </div>
                                <h4 className={styles.successTitle}>Transferencia enviada</h4>
                                <p className={styles.successDesc}>Tus fondos están en camino a la dirección destino.</p>
                                <p className={styles.successHint}>Llegan en ~3-5 segundos a la red Stellar.</p>
                                <button className={styles.submitBtn} onClick={handleClose}>
                                    Finalizar
                                </button>
                            </div>
                        ) : (
                            <form className={styles.form} onSubmit={handleSend}>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.fieldLabel}>
                                        Dirección destino
                                        <span className={styles.fieldHint}>de Bitso, Binance o cualquier exchange</span>
                                    </label>
                                    <div className={styles.addressInputWrapper}>
                                        <input
                                            type="text"
                                            className={styles.addressInput}
                                            placeholder="G... o M..."
                                            value={address}
                                            onChange={e => setAddress(e.target.value)}
                                            required
                                            disabled={sending}
                                        />
                                        <div className={styles.addressIcon}>
                                            <QrCode size={16} />
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.fieldGroup}>
                                    <label className={styles.fieldLabel}>
                                        Monto a retirar
                                        <span className={styles.fieldHint}>
                                            Máximo {usdcAmount.toFixed(2)} USDC
                                        </span>
                                    </label>
                                    <div className={styles.amountInputWrapper}>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            max={usdcAmount}
                                            placeholder="0.00"
                                            value={amount}
                                            onChange={e => setAmount(e.target.value)}
                                            required
                                            disabled={sending}
                                            className={styles.amountInput}
                                        />
                                        <span className={styles.currencyBadge}>USDC</span>
                                    </div>
                                    <div className={styles.amountQuickRow}>
                                        {[50, 100, 200, 500].map(n => (
                                            <button
                                                key={n}
                                                type="button"
                                                className={styles.quickAmountBtn}
                                                onClick={() => setAmount(Math.min(n, usdcAmount))}
                                                disabled={sending || usdcAmount < n}
                                            >
                                                ${n}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {amount > 0 && !error && (
                                    <div className={styles.conversionNote}>
                                        <ArrowDownToLine size={14} />
                                        <span>
                                            USDC &rarr; XLM vía Stellar DEX &middot; Comisión ≈ $0.003 USD
                                        </span>
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
                                        <><ArrowUpFromLine size={18} /> Transferir a exchange</>
                                    )}
                                </button>
                            </form>
                        )
                    ) : (
                        /* MoneyGram tab — inline, no second modal */
                        <div className={styles.moneygramContent}>
                            <div className={styles.mgHero}>
                                <Banknote size={28} />
                                <h4>Retira en efectivo</h4>
                                <p>En más de 21,000 puntos Oxxo en todo México</p>
                            </div>

                            <div className={styles.mgSteps}>
                                <div className={styles.mgStep}>
                                    <div className={styles.stepNumber}>1</div>
                                    <div className={styles.stepInfo}>
                                        <strong>Ingresa el monto</strong>
                                        <p>Elige cuánto retirar de tu saldo USDC</p>
                                    </div>
                                </div>
                                <div className={styles.mgStep}>
                                    <div className={styles.stepNumber}>2</div>
                                    <div className={styles.stepInfo}>
                                        <strong>Recibe tu código</strong>
                                        <p>Generamos un código de retiro válido por 24h</p>
                                    </div>
                                </div>
                                <div className={styles.mgStep}>
                                    <div className={styles.stepNumber}>3</div>
                                    <div className={styles.stepInfo}>
                                        <strong>Cobra en Oxxo</strong>
                                        <p>Presenta tu código en cualquier Oxxo y recibe efectivo</p>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.mgComingSoon}>
                                <Clock size={16} />
                                <span>Próximamente &mdash; Activando convenio con MoneyGram</span>
                            </div>

                            <div className={styles.mgDisclaimer}>
                                <p>
                                    Shekael utilizará <strong>MoneyGram Ramps API</strong> (SEP-24) para
                                    habilitar retiros en efectivo. Cada transacción tiene un límite
                                    de $8,000 y requiere identificación oficial.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
