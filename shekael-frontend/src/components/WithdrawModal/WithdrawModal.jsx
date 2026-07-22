import { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { X, ArrowUpFromLine, Loader2, ExternalLink, ChevronRight, CheckCircle2, AlertCircle, Info, ArrowLeft } from 'lucide-react';
import useStore from '../../store';
import { getMxnRate } from '../../api/price.api';
import styles from './WithdrawModal.module.css';

const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet/tx';

export default function WithdrawModal({ isOpen, onClose, onRefreshBalance }) {
    const { balance, user } = useStore();
    const overlayRef = useRef(null);
    const panelRef = useRef(null);
    const contentRef = useRef(null);
    const pinInputRef = useRef(null);

    const [step, setStep] = useState(1); // 1=address, 2=amount, 3=pin, 4=confirm, 5=done
    const [address, setAddress] = useState('');
    const [addressError, setAddressError] = useState(null);
    const [amountMXN, setAmountMXN] = useState('');
    const [amountError, setAmountError] = useState(null);
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState(null);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [shouldRender, setShouldRender] = useState(false);
    const [mxnRate, setMxnRate] = useState(18.50);
    const [showInstructions, setShowInstructions] = useState(false);
    const [pinVerified, setPinVerified] = useState(false);

    const usdcAmount = parseFloat(balance || "0");
    const mxnAmount = usdcAmount * mxnRate;
    const enteredUSDC = parseFloat(amountMXN || '0') / mxnRate;

    useEffect(() => {
        getMxnRate().then(setMxnRate).catch(() => {});
    }, []);

    const animateIn = useCallback(() => {
        setShouldRender(true);
        requestAnimationFrame(() => {
            if (!panelRef.current) return;
            gsap.fromTo(overlayRef.current,
                { opacity: 0 },
                { opacity: 1, duration: 0.25, ease: 'power2.out' }
            );
            gsap.fromTo(panelRef.current,
                { opacity: 0, y: 40, scale: 0.92 },
                { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'power3.out' }
            );
            const children = contentRef.current?.children;
            if (children) {
                gsap.set(children, { opacity: 0, y: 12 });
                gsap.to(children, {
                    opacity: 1, y: 0, duration: 0.4, stagger: 0.04, delay: 0.15,
                    ease: 'power2.out'
                });
            }
        });
    }, []);

    const animateOut = useCallback((callback) => {
        if (!panelRef.current) { callback?.(); return; }
        const tl = gsap.timeline({
            onComplete: () => { setShouldRender(false); callback?.(); }
        });
        tl.to(panelRef.current, { opacity: 0, y: 24, scale: 0.95, duration: 0.22, ease: 'power2.in' });
        tl.to(overlayRef.current, { opacity: 0, duration: 0.15, ease: 'power2.out' }, '-=0.1');
    }, []);

    const handleClose = useCallback(() => {
        animateOut(onClose);
    }, [animateOut, onClose]);

    useEffect(() => {
        if (isOpen) {
            animateIn();
            setStep(1);
            setAddress('');
            setAddressError(null);
            setAmountMXN('');
            setAmountError(null);
            setPin('');
            setPinError(null);
            setSending(false);
            setResult(null);
            setError(null);
            setShowInstructions(false);
            setPinVerified(false);
        } else {
            setShouldRender(false);
        }
    }, [isOpen, animateIn]);

    // Auto-focus PIN input
    useEffect(() => {
        if (step === 3 && pinInputRef.current) {
            pinInputRef.current.focus();
        }
    }, [step]);

    // ── Validate address (Stellar public key format) ──
    const validateAddress = () => {
        if (!address || address.length < 20) {
            setAddressError('Pega la dirección USDC de tu Bitso');
            return false;
        }
        if (!address.startsWith('G') || address.length !== 56) {
            setAddressError('La dirección debe empezar con G y tener 56 caracteres');
            return false;
        }
        setAddressError(null);
        return true;
    };

    // ── Validate amount ──
    const validateAmount = () => {
        const amt = parseFloat(amountMXN);
        if (!amountMXN || isNaN(amt) || amt <= 0) {
            setAmountError('Ingresa un monto válido');
            return false;
        }
        if (amt > 10000) {
            setAmountError('Máximo $10,000 MXN por transacción');
            return false;
        }
        if (amt > mxnAmount) {
            setAmountError(`Saldo insuficiente. Tienes $${mxnAmount.toFixed(2)} MXN`);
            return false;
        }
        setAmountError(null);
        return true;
    };

    // ── Handle PIN verification ──
    const handlePinSubmit = async () => {
        if (!pin || pin.length < 4) {
            setPinError('Ingresa tu PIN');
            return;
        }
        setPinError(null);
        setSending(true);
        setError(null);

        try {
            const API = import.meta.env.VITE_API_URL || location.origin;
            const token = useStore.getState().token;

            // Step 1: Verify PIN
            const pinRes = await fetch(`${API}/auth/verify-pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ pinHash: pin })
            });
            const pinData = await pinRes.json();
            if (!pinRes.ok || !pinData.valid) {
                setPinError('PIN incorrecto');
                setSending(false);
                return;
            }

            // Step 2: Send withdrawal
            const wdRes = await fetch(`${API}/wallet/withdraw`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    destinationAddress: address,
                    amountMXN: parseFloat(amountMXN),
                    pinHash: pin
                })
            });
            const wdData = await wdRes.json();

            if (!wdRes.ok) {
                setError(wdData.message || 'Error al enviar');
                setSending(false);
                return;
            }

            setResult(wdData);
            setStep(5); // done
            setSending(false);
            onRefreshBalance?.();
        } catch (err) {
            setError('Error de conexión. Intenta de nuevo.');
            setSending(false);
        }
    };

    const handleNextStep = () => {
        if (step === 1) {
            if (!validateAddress()) return;
            setStep(2);
        } else if (step === 2) {
            if (!validateAmount()) return;
            setStep(3);
        }
    };

    const handleBack = () => {
        if (step > 1 && step < 5) {
            setStep(step - 1);
            setError(null);
        }
    };

    if (!shouldRender) return null;

    const modal = (
        <div ref={overlayRef} className={styles.overlay} onClick={handleClose}>
            <div ref={panelRef} className={styles.panel} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        {step < 5 && step > 1 && (
                            <button className={styles.backBtn} onClick={handleBack}>
                                <ArrowLeft size={16} />
                            </button>
                        )}
                        <ArrowUpFromLine size={16} className={styles.headerIcon} />
                        <span className={styles.headerTitle}>Retirar a Bitso</span>
                    </div>
                    <button className={styles.closeBtn} onClick={handleClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Progress dots */}
                {step < 5 && (
                    <div className={styles.progress}>
                        {[1,2,3].map(i => (
                            <div key={i} className={`${styles.progressDot} ${step >= i ? styles.progressActive : ''} ${step > i ? styles.progressDone : ''}`} />
                        ))}
                    </div>
                )}

                <div ref={contentRef} className={styles.content}>
                    {/* ── STEP 1: Address ── */}
                    {step === 1 && (
                        <>
                            <div className={styles.stepBody}>
                                <h3 className={styles.stepTitle}>¿A dónde quieres retirar?</h3>
                                <p className={styles.stepDesc}>Pega la dirección USDC de tu Bitso (red Stellar).</p>

                                <div className={styles.inputWrap}>
                                    <label className={styles.inputLabel}>Dirección Stellar de tu Bitso</label>
                                    <input
                                        className={`${styles.input} ${addressError ? styles.inputError : ''}`}
                                        type="text"
                                        placeholder="G..."
                                        value={address}
                                        onChange={e => { setAddress(e.target.value); setAddressError(null); }}
                                        onPaste={() => setTimeout(validateAddress, 100)}
                                    />
                                    {addressError && <span className={styles.fieldError}>{addressError}</span>}
                                </div>

                                <button className={styles.helpLink} onClick={() => setShowInstructions(!showInstructions)}>
                                    <Info size={13} />
                                    ¿Cómo obtener mi dirección USDC en Bitso?
                                </button>

                                {showInstructions && (
                                    <div className={styles.instructions}>
                                        <p>1. Abre Bitso</p>
                                        <p>2. Ve a <strong>Recibir</strong></p>
                                        <p>3. Selecciona <strong>USDC</strong></p>
                                        <p>4. Elige red <strong>Stellar</strong></p>
                                        <p>5. Copia la dirección (empieza con G)</p>
                                    </div>
                                )}
                            </div>

                            <div className={styles.footer}>
                                <button className={styles.primaryBtn} onClick={handleNextStep} disabled={!address}>
                                    Continuar <ChevronRight size={16} />
                                </button>
                            </div>
                        </>
                    )}

                    {/* ── STEP 2: Amount ── */}
                    {step === 2 && (
                        <>
                            <div className={styles.stepBody}>
                                <h3 className={styles.stepTitle}>¿Cuánto quieres retirar?</h3>
                                <p className={styles.stepDesc}>Saldo disponible: <strong>${mxnAmount.toFixed(2)} MXN</strong></p>

                                <div className={styles.inputWrap}>
                                    <label className={styles.inputLabel}>Monto en MXN</label>
                                    <div className={`${styles.amountInputWrap} ${amountError ? styles.inputError : ''}`}>
                                        <span className={styles.amountPrefix}>$</span>
                                        <input
                                            className={styles.amountInput}
                                            type="number"
                                            min="1"
                                            max={mxnAmount}
                                            step="0.01"
                                            placeholder="0.00"
                                            value={amountMXN}
                                            onChange={e => { setAmountMXN(e.target.value); setAmountError(null); }}
                                        />
                                    </div>
                                    {amountError && <span className={styles.fieldError}>{amountError}</span>}
                                    {amountMXN && !amountError && (
                                        <span className={styles.usdcHint}>
                                            ≈ {enteredUSDC.toFixed(4)} USDC
                                        </span>
                                    )}
                                </div>

                                {/* Quick amounts */}
                                <div className={styles.quickRow}>
                                    {[50, 100, 200, 500].map(v => (
                                        <button
                                            key={v}
                                            className={styles.quickBtn}
                                            onClick={() => {
                                                if (v <= mxnAmount) {
                                                    setAmountMXN(String(v));
                                                    setAmountError(null);
                                                }
                                            }}
                                            disabled={v > mxnAmount}
                                        >
                                            ${v}
                                        </button>
                                    ))}
                                    <button
                                        className={styles.quickBtn}
                                        onClick={() => {
                                            const max = Math.floor(mxnAmount * 100) / 100;
                                            setAmountMXN(String(max));
                                            setAmountError(null);
                                        }}
                                    >
                                        Máx.
                                    </button>
                                </div>
                            </div>

                            <div className={styles.footer}>
                                <button className={styles.primaryBtn} onClick={handleNextStep} disabled={!amountMXN || parseFloat(amountMXN) <= 0}>
                                    Continuar <ChevronRight size={16} />
                                </button>
                            </div>
                        </>
                    )}

                    {/* ── STEP 3: PIN ── */}
                    {step === 3 && (
                        <>
                            <div className={styles.stepBody}>
                                <h3 className={styles.stepTitle}>Confirma con tu PIN</h3>
                                <p className={styles.stepDesc}>Ingresa tu PIN de seguridad para autorizar el retiro.</p>

                                <div className={styles.inputWrap}>
                                    <label className={styles.inputLabel}>Tu PIN</label>
                                    <input
                                        ref={pinInputRef}
                                        className={`${styles.input} ${styles.pinInput} ${pinError ? styles.inputError : ''}`}
                                        type="password"
                                        inputMode="numeric"
                                        maxLength={20}
                                        placeholder="••••"
                                        value={pin}
                                        onChange={e => { setPin(e.target.value); setPinError(null); }}
                                        onKeyDown={e => { if (e.key === 'Enter') handlePinSubmit(); }}
                                    />
                                    {pinError && <span className={styles.fieldError}>{pinError}</span>}
                                </div>

                                {error && (
                                    <div className={styles.errorBox}>
                                        <AlertCircle size={14} />
                                        {error}
                                    </div>
                                )}

                                {/* Summary */}
                                <div className={styles.summary}>
                                    <div className={styles.summaryRow}>
                                        <span>Dirección</span>
                                        <span className={styles.summaryValue}>{address.slice(0, 8)}...{address.slice(-4)}</span>
                                    </div>
                                    <div className={styles.summaryRow}>
                                        <span>Monto</span>
                                        <span className={styles.summaryValue}>${parseFloat(amountMXN).toFixed(2)} MXN</span>
                                    </div>
                                    <div className={styles.summaryRow}>
                                        <span>Equivalente</span>
                                        <span className={styles.summaryValue}>{enteredUSDC.toFixed(4)} USDC</span>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.footer}>
                                <button
                                    className={styles.primaryBtn}
                                    onClick={handlePinSubmit}
                                    disabled={sending || !pin}
                                >
                                    {sending ? (
                                        <><Loader2 className={styles.spin} size={16} /> Enviando...</>
                                    ) : (
                                        <>Retirar ahora <ArrowUpFromLine size={14} /></>
                                    )}
                                </button>
                            </div>
                        </>
                    )}

                    {/* ── STEP 5: Done ── */}
                    {step === 5 && result && (
                        <>
                            <div className={styles.stepBody}>
                                <div className={styles.successIcon}>
                                    <CheckCircle2 size={40} />
                                </div>
                                <h3 className={styles.stepTitle}>¡Enviado!</h3>
                                <p className={styles.stepDesc}>
                                    ${result.amountMXN} MXN ({result.amountUSDC} USDC) enviado a tu Bitso.
                                    Llega en ~5 segundos.
                                </p>

                                {result.txHash && (
                                    <a
                                        href={`${STELLAR_EXPLORER}/${result.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.txLink}
                                    >
                                        <ExternalLink size={13} />
                                        Ver en Stellar Explorer
                                    </a>
                                )}
                            </div>

                            <div className={styles.footer}>
                                <button className={styles.primaryBtn} onClick={handleClose}>
                                    Listo
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}
