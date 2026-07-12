import { useEffect, useRef, useState } from 'react';
import styles from './LockScreen.module.css';
import logoImg from '../../assets/personaje_1.12.png';

/**
 * LockScreen — PIN de seguridad para la app.
 * 
 * Props:
 * - onUnlock: () => void (se llama cuando el PIN es correcto)
 * - mode: 'lock' | 'setup' | 'change'
 */
export default function LockScreen({ onUnlock, mode = 'lock' }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState(mode === 'setup' ? 'create' : 'enter');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  const getStoredPin = () => {
    try {
      return localStorage.getItem('shekael_pin_hash');
    } catch { return null; }
  };

  // Hash simple del PIN (no es criptográfico — es para verificación local, no para servidor)
  const hashPin = (p) => {
    let hash = 0;
    for (let i = 0; i < p.length; i++) {
      const char = p.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return 'pin_' + hash;
  };

  const handleDigit = (d) => {
    setError('');
    if (step === 'enter') {
      const newPin = pin + d;
      if (newPin.length <= 6) {
        setPin(newPin);
        if (newPin.length >= 4) {
          // Verificar automáticamente
          setTimeout(() => verifyPin(newPin), 100);
        }
      }
    } else if (step === 'create') {
      const newPin = pin + d;
      if (newPin.length <= 6) {
        setPin(newPin);
        if (newPin.length >= 4) {
          setTimeout(() => setStep('confirm'), 200);
        }
      }
    } else if (step === 'confirm') {
      const newPin = confirmPin + d;
      if (newPin.length <= 6) {
        setConfirmPin(newPin);
        if (newPin.length >= 4) {
          setTimeout(() => checkConfirm(newPin), 100);
        }
      }
    }
  };

  const handleDelete = () => {
    if (step === 'enter') setPin(p => p.slice(0, -1));
    else if (step === 'create') setPin(p => p.slice(0, -1));
    else if (step === 'confirm') setConfirmPin(p => p.slice(0, -1));
  };

  const verifyPin = (enteredPin) => {
    const stored = getStoredPin();
    if (hashPin(enteredPin) === stored) {
      setPin('');
      onUnlock();
    } else {
      setError('PIN incorrecto');
      setPin('');
      inputRef.current?.focus();
    }
  };

  const checkConfirm = async (confirm) => {
    if (pin === confirm) {
      localStorage.setItem('shekael_pin_hash', hashPin(pin));
      setPin('');
      setConfirmPin('');
      onUnlock();
    } else {
      setError('Los PIN no coinciden');
      setConfirmPin('');
      setPin('');
      setStep('create');
    }
  };

  const hasPin = !!getStoredPin();

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <img src={logoImg} alt="Shekael" className={styles.logo} />

        {step === 'enter' && (
          <>
            <h2 className={styles.title}>
              {hasPin ? 'Desbloquear Shekael' : 'Crear PIN de seguridad'}
            </h2>
            <p className={styles.subtitle}>
              {hasPin
                ? 'Ingresa tu PIN para continuar'
                : 'Elige un PIN de 4-6 dígitos para proteger tu cuenta'}
            </p>
          </>
        )}

        {step === 'create' && (
          <>
            <h2 className={styles.title}>Crear PIN de seguridad</h2>
            <p className={styles.subtitle}>Elige un PIN de 4-6 dígitos</p>
          </>
        )}

        {step === 'confirm' && (
          <>
            <h2 className={styles.title}>Confirmar PIN</h2>
            <p className={styles.subtitle}>Ingresa el mismo PIN nuevamente</p>
          </>
        )}

        <div className={styles.pinDisplay}>
          {(step === 'enter' ? pin : step === 'confirm' ? confirmPin : pin)
            .split('')
            .map((_, i) => (
              <div key={i} className={styles.pinDot} />
            ))}
          {Array.from({ length: 4 - (step === 'enter' ? pin : step === 'confirm' ? confirmPin : pin).length }).map((_, i) => (
            <div key={`e${i}`} className={styles.pinDotEmpty} />
          ))}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.keypad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button key={n} className={styles.key} onClick={() => handleDigit(String(n))}>
              {n}
            </button>
          ))}
          <div className={styles.key} />
          <button className={styles.key} onClick={() => handleDigit('0')}>0</button>
          <button className={styles.keyDelete} onClick={handleDelete}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
              <line x1="18" y1="9" x2="12" y2="15"/>
              <line x1="12" y1="9" x2="18" y2="15"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
