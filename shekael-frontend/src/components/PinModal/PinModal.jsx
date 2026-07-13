import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Lock, X, ArrowLeft } from 'lucide-react';
import styles from './PinModal.module.css';

export default function PinModal({ isOpen, onClose, onVerified, title = 'Confirmar PIN', description = 'Ingresa tu PIN de seguridad para continuar.' }) {
    const [mode, setMode] = useState('verify'); // 'verify' | 'setup' | 'confirm'
    const [pin, setPin] = useState(['', '', '', '']);
    const [pinConfirm, setPinConfirm] = useState(['', '', '', '']);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const inputRefs = useRef([]);
    const activePin = mode === 'confirm' ? pinConfirm : pin;
    const setActivePin = mode === 'confirm' ? setPinConfirm : setPin;

    useEffect(() => {
        if (isOpen) {
            setMode('verify');
            setPin(['', '', '', '']);
            setPinConfirm(['', '', '', '']);
            setError('');
            document.body.style.overflow = 'hidden';
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !activePin[index] && index > 0) {
            const newPin = [...activePin];
            newPin[index - 1] = '';
            setActivePin(newPin);
            inputRefs.current[index - 1]?.focus();
            return;
        }

        if (e.key === 'e' || e.key === 'E' || e.key === '.') {
            e.preventDefault();
            return;
        }
    };

    const handleChange = (index, value) => {
        const digit = value.replace(/\D/g, '').slice(-1);
        if (!digit) return;

        const newPin = [...activePin];
        newPin[index] = digit;
        setActivePin(newPin);
        setError('');

        if (index < 3) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleSubmit = async () => {
        const pinStr = activePin.join('');
        if (pinStr.length !== 4) {
            setError('Ingresa los 4 dígitos');
            return;
        }

        if (mode === 'confirm') {
            // Confirmar que ambos PIN coinciden
            if (pinStr !== pin.join('')) {
                setError('Los PIN no coinciden');
                setPinConfirm(['', '', '', '']);
                inputRefs.current[0]?.focus();
                return;
            }
            // Setup: guardar PIN
            setLoading(true);
            setError('');
            try {
                const API_URL = import.meta.env.VITE_API_URL || location.origin;
                const token = localStorage.getItem('Shekael_token');
                const res = await fetch(`${API_URL}/auth/set-pin`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ pin: pinStr })
                });
                const data = await res.json();
                if (!res.ok) {
                    setError(data.message || 'Error al guardar PIN');
                    return;
                }
                // PIN guardado, ahora verificar para proceder
                setMode('verify');
                setPin(['', '', '', '']);
                setPinConfirm(['', '', '', '']);
                setLoading(false);
                // Vuelve a verificar (que será el PIN recién creado)
                handleSubmit();
            } catch (err) {
                setError('Error de conexión');
                setLoading(false);
            }
            return;
        }

        setLoading(true);
        setError('');

        try {
            const API_URL = import.meta.env.VITE_API_URL || location.origin;
            const token = localStorage.getItem('Shekael_token');

            const res = await fetch(`${API_URL}/auth/verify-pin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ pin: pinStr })
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.message === 'No has configurado un PIN. Configúralo primero en tu perfil.') {
                    // Cambiar a modo setup
                    setMode('setup');
                    setPin(['', '', '', '']);
                    setError('');
                    setLoading(false);
                    setTimeout(() => inputRefs.current[0]?.focus(), 100);
                    return;
                }
                setError(data.message || 'PIN incorrecto');
                setPin(['', '', '', '']);
                setPinConfirm(['', '', '', '']);
                inputRefs.current[0]?.focus();
                return;
            }

            onVerified?.();
            onClose();
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 4);
        if (text.length !== 4) return;
        const newPin = text.split('');
        setActivePin(newPin);
    };

    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={styles.overlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className={styles.modal}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button className={styles.closeBtn} onClick={onClose}>
                            <X size={18} />
                        </button>

                        <div className={styles.iconWrap}>
                            <Lock size={24} />
                        </div>

                        <h3 className={styles.title}>
                            {mode === 'setup' ? 'Configurar PIN' : mode === 'confirm' ? 'Confirmar PIN' : title}
                        </h3>
                        <p className={styles.desc}>
                            {mode === 'setup' ? 'Crea un PIN de 4 dígitos para proteger tus transacciones.' : mode === 'confirm' ? 'Repite el PIN para confirmar.' : description}
                        </p>

                        <div className={styles.dots} onPaste={handlePaste}>
                            {activePin.map((digit, i) => (
                                <div key={i} className={styles.dotWrap}>
                                    <input
                                        ref={(el) => { inputRefs.current[i] = el; }}
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleChange(i, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(i, e)}
                                        className={styles.dotInput}
                                        autoComplete="one-time-code"
                                    />
                                    <div className={`${styles.dot} ${digit ? styles.dotFilled : ''}`}>
                                        {digit ? '●' : '○'}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {error && (
                            <motion.p
                                className={styles.error}
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                            >
                                {error}
                            </motion.p>
                        )}

                        <button
                            className={styles.submitBtn}
                            onClick={handleSubmit}
                            disabled={loading || activePin.join('').length !== 4}
                        >
                            {loading ? (
                                <span className={styles.spinner} />
                            ) : (
                                'Confirmar'
                            )}
                        </button>

                        <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>
                            Cancelar
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
