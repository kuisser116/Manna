import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, X, Check, ArrowRight, ShieldCheck, Zap, Camera, RefreshCw } from 'lucide-react';
import { payQR } from '../../api/transactions.api.js';
import { Html5Qrcode } from 'html5-qrcode';
import useFeedbackModal from '../FeedbackModal/useFeedbackModal';
import FeedbackModal from '../FeedbackModal/FeedbackModal';
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

    const { modalState, showLoading, showSuccess, showError, hideModal } = useFeedbackModal();

    // Iniciar el escáner con control total
    useEffect(() => {
        if (isOpen && !defaultPublicKey && step === 'scan') {
            const html5QrCode = new Html5Qrcode("reader");
            setScannerInstance(html5QrCode);

            const startScanner = async () => {
                try {
                    const devices = await Html5Qrcode.getCameras();
                    if (devices && devices.length > 0) {
                        setCameras(devices);
                        
                        // Intentar encontrar la cámara trasera primero
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
                                if (decodedText.startsWith('G') && decodedText.length === 56) {
                                    setScanData({
                                        publicKey: decodedText,
                                        businessName: 'Usuario Escaneado',
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
                    }
                } catch (err) {
                    console.error("Error starting scanner:", err);
                    showError('Cámara', 'No se pudo acceder a la cámara. Asegúrate de dar permisos.');
                }
            };

            const timer = setTimeout(startScanner, 300);
            return () => {
                clearTimeout(timer);
                if (html5QrCode.isScanning) {
                    html5QrCode.stop().catch(e => console.log("Stop error", e));
                }
            };
        } else if (isOpen && defaultPublicKey && step === 'scan') {
            setScanData({
                publicKey: defaultPublicKey,
                businessName: defaultBusinessName || 'Usuario Ehise',
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
                    if (decodedText.startsWith('G') && decodedText.length === 56) {
                        setScanData({
                            publicKey: decodedText,
                            businessName: 'Usuario Escaneado',
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
;

    // La funcionalidad de escáner real iría aquí.
    // Para el demo web, el paso de datos se hace directo desde el componente Profile.jsx

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
                            rp: { name: "Ehise Wallet" },
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
            // Solo mostramos error si no fue cancelación manual (opcional, por ahora mostramos el aviso de protección)
            showError('Seguridad Ehise', 'Validación biométrica cancelada o no disponible. Tu dinero está seguro.', true);
            return;
        }
        // ------------------------------------

        try {
            const { data } = await payQR(scanData.publicKey, amount, 'MXNe');
            
            if (data.success) {
                setStep('success');
                // IMPORTANTE: envolvemos el callback externo en try/catch independiente 
                // para que si falla la recarga del balance no se muestre el modal de error de pago
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
                showError(
                    'Billetera Inactiva', 
                    'El usuario destino aún no tiene su billetera activa en Stellar. Necesita completar sus tareas para poder recibir pagos físicos digitales.',
                    true
                );
            } else {
                showError('Error de Pago', err.response?.data?.message || 'No se pudo procesar el pago en este momento.', true);
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
        onClose();
    };

    if (!isOpen) return null;

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
                    <button className={styles.closeBtn} onClick={reset}>
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
                        <div className={styles.stepContent}>
                            <div className={styles.merchantInfo}>
                                <div className={styles.avatar}>
                                    <ShieldCheck size={24} color="#22c55e" />
                                </div>
                                <h3 className={styles.merchantName}>{scanData.businessName}</h3>
                                {scanData.isVerified && <span className={styles.verifiedTag}>Comercio Verificado</span>}
                            </div>

                            <div className={styles.amountInputWrapper}>
                                <span className={styles.currency}>$</span>
                                <input 
                                    className={styles.amountInput}
                                    type="number" 
                                    placeholder="0" 
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    autoFocus
                                />
                                <span className={styles.currencyCode}>MXNe</span>
                            </div>

                            {scanData.isVerified && (
                                <motion.div 
                                    className={styles.benefitCard}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                >
                                    <div className={styles.benefitIcon}>🎁</div>
                                    <div className={styles.benefitText}>
                                        <strong>-5% de Descuento Regional</strong>
                                        <p>Pagado por el fondo de tu estado</p>
                                    </div>
                                    <div className={styles.benefitAmount}>
                                        -${(parseFloat(amount || 0) * 0.05).toFixed(4)}
                                    </div>
                                </motion.div>
                            )}

                            <div className={styles.summary}>
                                <div className={styles.summaryRow}>
                                    <span>Total a pagar</span>
                                    <span>${(parseFloat(amount || 0) * (scanData.isVerified ? 0.95 : 1.0)).toFixed(2)} MXNe</span>
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
                        <div className={styles.stepContent}>
                            <div className={styles.successIcon}>
                                <Check size={48} color="#fff" />
                            </div>
                            <h2 className={styles.title}>¡Pago Exitoso!</h2>
                            <p className={styles.desc}>Has enviado los fondos a <strong>{scanData.businessName}</strong>.</p>
                            
                            <div className={styles.receipt}>
                                <div className={styles.receiptRow}>
                                    <span>Pagado</span>
                                    <span>${(parseFloat(amount || 0) * 0.95).toFixed(2)} MXNe</span>
                                </div>
                                <div className={styles.receiptRow}>
                                    <span>Subsidio Regional</span>
                                    <span>${(parseFloat(amount || 0) * 0.05).toFixed(2)} MXNe</span>
                                </div>
                            </div>

                            <button className={styles.doneBtn} onClick={reset}>
                                Finalizar
                            </button>
                        </div>
                    )}
                </motion.div>
            </motion.div>

            {step !== 'success' && (
                <FeedbackModal
                    isOpen={modalState.isOpen}
                    onClose={hideModal}
                    type={modalState.type}
                    title={modalState.title}
                    message={modalState.message}
                    showCloseButton={modalState.showCloseButton}
                />
            )}
        </AnimatePresence>
    );
}
