import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Lock, X } from 'lucide-react';
import styles from './PinModal.module.css';

// Mismo hash que LockScreen
function computePinHash(p) {
    let hash = 0;
    for (let i = 0; i < p.length; i++) {
        hash = ((hash << 5) - hash) + p.charCodeAt(i);
        hash |= 0;
    }
    return 'pin_' + hash;
}

export default function PinModal({ isOpen, onClose, onVerified, title = 'Confirmar PIN', description = 'Ingresa tu PIN de seguridad para continuar.' }) {
    const [pin, setPin] = useState(['', '', '', '', '', '']);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const inputRefs = useRef([]);

    const pinLen = 6;

    useEffect(() => {
        if (isOpen) {
            setPin(Array(pinLen).fill(''));
            setError('');
            document.body.style.overflow = 'hidden';
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !pin[index] && index > 0) {
            const newPin = [...pin];
            newPin[index - 1] = '';
            setPin(newPin);
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

        const newPin = [...pin];
        newPin[index] = digit;
        setPin(newPin);
        setError('');

        // Auto-advance al siguiente slot
        const nextIdx = pin.findIndex((d, i) => i > index && !d);
        if (nextIdx !== -1) {
            inputRefs.current[nextIdx]?.focus();
        } else if (index === pinLen - 1) {
            // Último dígito — verificar automáticamente
            setTimeout(() => verifyPin([...newPin.slice(0, index), digit]), 100);
        } else {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const verifyPin = (fullPin) => {
        const pinStr = fullPin.join('');
        if (pinStr.length !== pinLen) return;

        const stored = localStorage.getItem('shekael_pin_hash');
        if (!stored) {
            setError('No has configurado un PIN. Configúralo en la pantalla de bloqueo.');
            return;
        }

        const enteredHash = computePinHash(pinStr);
        if (enteredHash !== stored) {
            setError('PIN incorrecto');
            setPin(Array(pinLen).fill(''));
            inputRefs.current[0]?.focus();
            return;
        }

        // PIN correcto
        onVerified?.();
        onClose();
    };

    const handleSubmit = () => {
        verifyPin(pin);
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

                        <h3 className={styles.title}>{title}</h3>
                        <p className={styles.desc}>{description}</p>

                        <div className={styles.dots}>
                            {pin.map((digit, i) => (
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
                            disabled={loading || pin.join('').length !== pinLen}
                        >
                            Confirmar
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
