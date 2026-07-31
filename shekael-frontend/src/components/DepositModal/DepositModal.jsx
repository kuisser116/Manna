import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, ExternalLink, Loader2, ArrowLeft } from 'lucide-react';
import QRCode from 'qrcode';
import api from '../../api/users.api';
import useStore from '../../store';
import styles from './DepositModal.module.css';

const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet/account/';

export default function DepositModal({ isOpen, onClose }) {
    const { walletNotFunded } = useStore();
    const { user } = useStore();
    const [address, setAddress] = useState('');
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const generateQR = useCallback(async (addr) => {
        try {
            const url = await QRCode.toDataURL(addr, {
                width: 300,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' }
            });
            setQrDataUrl(url);
        } catch (e) {
            console.error('QR generation error:', e);
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        
        const fetchInfo = async () => {
            setLoading(true);
            setError(null);
            try {
                // Try to get from store first
                if (user?.stellarPublicKey) {
                    setAddress(user.stellarPublicKey);
                    generateQR(user.stellarPublicKey);
                    setLoading(false);
                    return;
                }
                // Fallback: fetch from API
                const { data } = await api.get('/wallet/deposit-info');
                if (data?.address) {
                    setAddress(data.address);
                    generateQR(data.address);
                } else {
                    throw new Error('No se encontró la dirección de la wallet');
                }
            } catch (err) {
                setError(err.response?.data?.message || err.message || 'Error al cargar información');
            } finally {
                setLoading(false);
            }
        };
        fetchInfo();
    }, [isOpen, user?.stellarPublicKey, generateQR]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            // Fallback para HTTP
            const ta = document.createElement('textarea');
            ta.value = address;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    const handleOpenExplorer = () => {
        window.open(`${STELLAR_EXPLORER}${address}`, '_blank', 'noopener');
    };

    if (!isOpen) return null;

    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <motion.div
                className={styles.modal}
                onClick={e => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
            >
                <div className={styles.header}>
                    <div className={styles.titleGroup}>
                        <h3>Depositar fondos</h3>
                        <p className={styles.subtitle}>Recibe XLM desde cualquier exchange</p>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    {loading ? (
                        <div className={styles.loadingBox}>
                            <Loader2 className={styles.spin} size={28} />
                            <p>Cargando información de depósito...</p>
                        </div>
                    ) : error ? (
                        <div className={styles.errorBox}>
                            <p>{error}</p>
                            <button className={styles.retryBtn} onClick={() => window.location.reload()}>
                                Reintentar
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* QR Code */}
                            <div className={styles.qrSection}>
                                <div className={styles.qrWrapper}>
                                    {qrDataUrl ? (
                                        <img src={qrDataUrl} alt="Dirección Stellar" className={styles.qrImage} />
                                    ) : (
                                        <div className={styles.qrPlaceholder}>
                                            <Loader2 className={styles.spin} size={24} />
                                        </div>
                                    )}
                                </div>
                                <p className={styles.qrHint}>
                                    Escanea este código desde tu exchange para depositar
                                </p>
                            </div>

                            {/* XLM Activation Notice — solo si no está activa */}
                            {walletNotFunded && (
                                <div className={styles.activationNotice}>
                                    <span style={{ fontSize: 14, flexShrink: 0 }}>ⓘ</span>
                                    <span>
                                        Para activar tu cuenta, envía primero <strong>~2 XLM</strong> desde Bitso a tu dirección.
                                        Una vez activada, puedes depositar USDC sin límite.
                                    </span>
                                </div>
                            )}

                            {/* Address */}
                            <div className={styles.addressSection}>
                                <label className={styles.addressLabel}>Tu dirección Stellar</label>
                                <div className={styles.addressBox}>
                                    <code className={styles.addressText}>{address}</code>
                                    <button
                                        className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
                                        onClick={handleCopy}
                                        title="Copiar dirección"
                                    >
                                        {copied ? <Check size={16} /> : <Copy size={16} />}
                                    </button>
                                </div>
                                {copied && <span className={styles.copiedText}>¡Dirección copiada!</span>}
                            </div>

                            {/* Instructions */}
                            <div className={styles.instructions}>
                                <h4>Cómo depositar desde Bitso / Binance:</h4>
                                <ol className={styles.steps}>
                                    <li>
                                        <strong>Compra XLM</strong> en tu exchange con tus pesos mexicanos
                                    </li>
                                    <li>
                                        Ve a <strong>Retirar / Enviar</strong> y selecciona XLM (Stellar)
                                    </li>
                                    <li>
                                        Pega la dirección de arriba o escanea el código QR
                                    </li>
                                    <li>
                                        Confirma el retiro. Los fondos llegan en <strong>~3 segundos</strong>
                                    </li>
                                    <li>
                                        Envía USDC a esta dirección. Se convertirá automáticamente a MXN en tu wallet
                                    </li>
                                </ol>
                            </div>

                            {/* Network info */}
                            <div className={styles.networkInfo}>
                                <span className={styles.networkBadge}>Red: TESTNET</span>
                                <button className={styles.explorerBtn} onClick={handleOpenExplorer}>
                                    <ExternalLink size={14} />
                                    Ver en explorer
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        </div>,
        document.body
    );
}
