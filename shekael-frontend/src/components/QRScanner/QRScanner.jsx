import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, X, Check, ArrowRight, ShieldCheck, Zap, Camera, RefreshCw, Store, Gift, Wallet, BadgeCheck } from 'lucide-react';
import { payQR, getRegionalFund } from '../../api/transactions.api.js';
import { mxnToUsdc } from '../../api/price.api.js';
import { Html5Qrcode } from 'html5-qrcode';
import useStore from '../../store';
import styles from './QRScanner.module.css';

export default function QRScanner({ isOpen, onClose, onPaymentSuccess, defaultPublicKey, defaultBusinessName }) {
    const [step, setStep] = useState('scan'); // 'scan', 'confirm', 'processing', 'success'
    const [scanData, setScanData] = useState(null);
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);

    const [cameras, setCameras] = useState([]);
    const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
    const [scannerInstance, setScannerInstance] = useState(null);
    const [isScannerReady, setIsScannerReady] = useState(false);

    // Fondo regional: el descuento SOLO se muestra si hay fondos reales
    const [fundBalance, setFundBalance] = useState(0);
    const [fundChecked, setFundChecked] = useState(false);

    const { addToast } = useStore();

    // Buscar info del comercio desde un QR escaneado
    const fetchBusinessInfo = async (bizId, pubKey, qrAmount, setSD, setAmt, scanner, setSt) => {
        try {
            const resp = await fetch(`/api/businesses/${bizId}`);
            const biz = await resp.json();
            setSD({
                publicKey: pubKey,
                businessName: biz.name || 'Comercio',
                isVerified: biz.is_active || false,
                businessId: bizId,
            });
            if (qrAmount) setAmt(qrAmount);
            await scanner.stop().catch(() => {});
            setSt('confirm');
        } catch {
            setSD({ publicKey: pubKey, businessName: 'Comercio Shekael', isVerified: false, businessId: bizId });
            if (qrAmount) setAmt(qrAmount);
            await scanner.stop().catch(() => {});
            setSt('confirm');
        }
    };

    // Verificar el fondo regional cuando se confirma un pago a comercio
    useEffect(() => {
        if (step !== 'confirm' || !scanData?.isVerified || fundChecked) return;
        getRegionalFund()
            .then(d => {
                setFundBalance(parseFloat(d?.total) || 0);
                setFundChecked(true);
            })
            .catch(() => {
                setFundBalance(0);
                setFundChecked(true);
            });
    }, [step, scanData, fundChecked]);

    const rawAmount = parseFloat(amount || 0) || 0;
    const discount = rawAmount * 0.05;
    const canDiscount = scanData?.isVerified && fundChecked && fundBalance >= discount && discount > 0;
    const totalToPay = canDiscount ? rawAmount - discount : rawAmount;

    // Iniciar el escáner con control total
    useEffect(() => {
        if (isOpen && !defaultPublicKey && step === 'scan') {
            const html5QrCode = new Html5Qrcode("reader");
            setScannerInstance(html5QrCode);

            const startScanner = async () => {
                try {
                    const devices = await Html5Qrcode.getCameras();
                    setCameras(devices);

                    if (devices.length === 0) {
                        addToast('error', 'Cámara', 'No se encontró ninguna cámara. Usa el QR desde tu celular o ingresa el código manualmente.');
                        return;
                    }

                    const backCameraIndex = devices.findIndex(d =>
                        d.label.toLowerCase().includes('back') ||
                        d.label.toLowerCase().includes('trasera') ||
                        d.label.toLowerCase().includes('environment')
                    );

                    const targetIndex = backCameraIndex !== -1 ? backCameraIndex : 0;
                    setCurrentCameraIndex(targetIndex);

                    await html5QrCode.start(
                        devices[targetIndex].id,
                        {
                            fps: 15,
                            qrbox: { width: 250, height: 250 },
                            aspectRatio: 1.0
                        },
                        (decodedText) => {
                            // Formato: shekael://pay/{bizId}?dest={pubkey}&amount=X
                            if (decodedText.startsWith('shekael://')) {
                                try {
                                    const url = new URL(decodedText);
                                    const bizId = url.pathname.split('/').pop();
                                    const pubKey = url.searchParams.get('dest');
                                    const qrAmount = url.searchParams.get('amount');
                                    fetchBusinessInfo(bizId, pubKey, qrAmount, setScanData, setAmount, html5QrCode, setStep);
                                } catch {}
                            } else if (decodedText.startsWith('G') && decodedText.length === 56) {
                                setScanData({
                                    publicKey: decodedText,
                                    businessName: 'Usuario Shekael',
                                    isVerified: false
                                });
                                html5QrCode.stop().then(() => {
                                    setStep('confirm');
                                });
                            }
                        },
                        (errorMessage) => {
                            // Errores de escaneo silenciosos
                        }
                    );
                    setIsScannerReady(true);
                } catch (err) {
                    console.error("Error starting scanner:", err);
                    addToast('error', 'Cámara', 'No se pudo acceder a la cámara. Asegúrate de dar permisos.');
                }
            };

            const timer = setTimeout(startScanner, 300);
            return () => {
                clearTimeout(timer);
                if (html5QrCode.isScanning) {
                    html5QrCode.stop().catch(e => void("Stop error", e));
                }
            };
        } else if (isOpen && defaultPublicKey && step === 'scan') {
            setScanData({
                publicKey: defaultPublicKey,
                businessName: defaultBusinessName || 'Usuario Shekael',
                isVerified: false
            });
            setStep('confirm');
        }
    }, [isOpen, step, defaultPublicKey, defaultBusinessName]);

    const switchCamera = async () => {
        if (!scannerInstance || !cameras.length) return;

        try {
            await scannerInstance.stop();
            const nextIndex = (currentCameraIndex + 1) % cameras.length;
            setCurrentCameraIndex(nextIndex);

            await scannerInstance.start(
                cameras[nextIndex].id,
                {
                    fps: 15,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0
                },
                (decodedText) => {
                    if (decodedText.startsWith('shekael://')) {
                        try {
                            const url = new URL(decodedText);
                            const bizId = url.pathname.split('/').pop();
                            const pubKey = url.searchParams.get('dest');
                            const qrAmount = url.searchParams.get('amount');
                            fetchBusinessInfo(bizId, pubKey, qrAmount, setScanData, setAmount, scannerInstance, setStep);
                        } catch {}
                    } else if (decodedText.startsWith('G') && decodedText.length === 56) {
                        setScanData({
                            publicKey: decodedText,
                            businessName: 'Usuario Shekael',
                            isVerified: false
                        });
                        scannerInstance.stop().then(() => {
                            setStep('confirm');
                        });
                    }
                }
            );
        } catch (err) {
            console.error("Error switching camera:", err);
        }
    };

    const handlePay = async () => {
        if (!amount || parseFloat(amount) <= 0 || loading) return;

        setLoading(true);

        // --- WebAuthn Biometric Protection ---
        try {
            if (window.PublicKeyCredential) {
                const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
                if (available) {
                    const challenge = new Uint8Array(32);
                    window.crypto.getRandomValues(challenge);

                    await navigator.credentials.create({
                        publicKey: {
                            challenge,
                            rp: { name: "Shekael Wallet" },
                            user: {
                                id: new Uint8Array(16),
                                name: "payment_auth",
                                displayName: "Firma de Seguridad"
                            },
                            pubKeyCredParams: [
                                { type: "public-key", alg: -7 },   // ES256 (Más común en móviles)
                                { type: "public-key", alg: -257 } // RS256 (Común en Windows Hello)
                            ],
                            authenticatorSelection: {
                                authenticatorAttachment: "platform",
                                userVerification: "required"
                            },
                            timeout: 60000
                        }
                    });
                }
            }
        } catch (err) {
            setLoading(false);
            console.error('WebAuthn Cancelled/Failed:', err);
            addToast('error', 'Seguridad Shekael', 'Validación biométrica cancelada o no disponible. Tu dinero está seguro.');
            return;
        }
        // ------------------------------------

        try {
            const usdcAmount = await mxnToUsdc(amount);
            const { data } = await payQR(scanData.publicKey, String(usdcAmount), 'USDC');

            if (data.success) {
                setStep('success');
                try {
                    if (onPaymentSuccess) onPaymentSuccess();
                } catch (e) {
                    console.error('Error in onPaymentSuccess callback:', e);
                }
            }
        } catch (err) {
            console.error('Payment API Error:', err);
            const errorCode = err.response?.data?.code || err.code;
            if (errorCode === 'WALLET_NOT_ACTIVE') {
                addToast('error', 'Billetera Inactiva', 'El usuario destino aún no tiene su billetera activa en Stellar. Necesita completar sus tareas para poder recibir pagos físicos digitales.');
            } else {
                addToast('error', 'Error de Pago', err.response?.data?.message || 'No se pudo procesar el pago en este momento.');
            }
        } finally {
            setLoading(false);
        }
    };

    const reset = async () => {
        if (scannerInstance && scannerInstance.isScanning) {
            await scannerInstance.stop().catch(() => {});
        }
        setStep('scan');
        setScanData(null);
        setAmount('');
        setIsScannerReady(false);
        setFundBalance(0);
        setFundChecked(false);
        onClose();
    };

    if (!isOpen) return null;

    const isBusiness = !!scanData?.isVerified;
    const amountStr = amount || '0';
    const fmt = (n) => n.toFixed(2);

    return (
        <AnimatePresence>
            <motion.div
                className={styles.overlay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={reset}
            >
                <motion.div
                    className={styles.modal}
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button className={styles.closeBtn} onClick={reset} aria-label="Cerrar">
                        <X size={24} />
                    </button>

                    {step === 'scan' && (
                        <div className={styles.stepContent}>
                            <div className={styles.scannerWrapper}>
                                <div id="reader" className={styles.reader}></div>
                                {cameras.length > 1 && (
                                    <button className={styles.switchCamBtn} onClick={switchCamera} title="Cambiar cámara">
                                        <RefreshCw size={20} />
                                    </button>
                                )}
                            </div>

                            <div className={styles.scanFooter}>
                                <h2 className={styles.title}>Escanear Pago</h2>
                                <p className={styles.desc}>Apunta al QR de otro usuario o negocio.</p>

                                <div className={styles.hint}>
                                    <ShieldCheck size={14} className={styles.hintIcon} />
                                    <span>Pagos seguros y sin comisiones</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'confirm' && (
                        <div className={`${styles.stepContent} ${styles.paddedStep}`}>
                            <div className={styles.confirmHeader}>
                                <div className={`${styles.avatar} ${isBusiness ? styles.avatarBusiness : ''}`}>
                                    {isBusiness ? <Store size={24} /> : <Wallet size={24} />}
                                </div>
                                <h3 className={styles.merchantName}>{scanData.businessName}</h3>
                                <p className={styles.merchantSub}>
                                    {isBusiness ? 'Comercio verificado' : 'Pago entre usuarios'}
                                </p>
                                {isBusiness && <span className={styles.verifiedTag}><BadgeCheck size={12} /> Comercio Verificado</span>}
                            </div>

                            <div className={styles.amountInputWrapper}>
                                <span className={styles.currency}>$</span>
                                <input
                                    className={styles.amountInput}
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    autoFocus
                                />
                                <span className={styles.currencyCode}>MXN</span>
                            </div>

                            {isBusiness && (
                                canDiscount ? (
                                    <motion.div
                                        className={styles.benefitCard}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                    >
                                        <div className={styles.benefitIcon}><Gift size={18} /></div>
                                        <div className={styles.benefitText}>
                                            <strong>5% de descuento regional</strong>
                                            <p>Cortesía de Shekael</p>
                                        </div>
                                        <div className={styles.benefitAmount}>-${fmt(discount)}</div>
                                    </motion.div>
                                ) : (
                                    <div className={styles.noDiscountNote}>
                                        <Zap size={14} />
                                        <span>{fundChecked && fundBalance < discount ? 'Descuento no disponible: fondo regional insuficiente' : 'Verificando descuento...'}</span>
                                    </div>
                                )
                            )}

                            <div className={styles.summary}>
                                <div className={styles.summaryRow}>
                                    <span>Monto</span>
                                    <span>${fmt(rawAmount)} MXN</span>
                                </div>
                                {canDiscount && (
                                    <div className={styles.summaryRow}>
                                        <span>Descuento regional (5%)</span>
                                        <span className={styles.discountValue}>-${fmt(discount)} MXN</span>
                                    </div>
                                )}
                                <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                                    <span>Total a pagar</span>
                                    <span>${fmt(totalToPay)} MXN</span>
                                </div>
                            </div>

                            <button
                                className={styles.payBtn}
                                onClick={handlePay}
                                disabled={loading || !amount}
                            >
                                {loading ? 'Procesando...' : (
                                    <>Confirmar Pago <ArrowRight size={18} /></>
                                )}
                            </button>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className={`${styles.stepContent} ${styles.paddedStep}`}>
                            <div className={styles.successIcon}>
                                <Check size={48} color="#fff" />
                            </div>
                            <h2 className={styles.title}>Pago Exitoso</h2>
                            <p className={styles.desc}>
                                Has enviado los fondos a <strong>{scanData.businessName}</strong>.
                            </p>

                            <div className={styles.receipt}>
                                <div className={styles.receiptRow}>
                                    <span>Pagado</span>
                                    <span>${fmt(totalToPay)} MXN</span>
                                </div>
                                {canDiscount && (
                                    <div className={styles.receiptRow}>
                                        <span>Descuento regional</span>
                                        <span className={styles.discountValue}>-${fmt(discount)} MXN</span>
                                    </div>
                                )}
                                <div className={`${styles.receiptRow} ${styles.receiptTotal}`}>
                                    <span>Total enviado</span>
                                    <span>${fmt(totalToPay)} MXN</span>
                                </div>
                            </div>

                            <button className={styles.doneBtn} onClick={reset}>
                                Finalizar
                            </button>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
