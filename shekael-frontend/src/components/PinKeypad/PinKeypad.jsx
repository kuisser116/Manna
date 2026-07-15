import { useState, useCallback, useEffect, useRef } from 'react';
import styles from './PinKeypad.module.css';

/**
 * Componente PIN reutilizable.
 * Props:
 *   mode        - 'create' | 'confirm' | 'enter'
 *   onComplete  - (pin: string) => Promise<void>  — se llama al llenar 6 dígitos
 *   onCancel    - () => void  — opcional, para cancelar
 *   error       - string | null  — error externo (para mostrar desde el padre)
 *   loading     - boolean  — loading externo
 *   title       - string  — título del modal
 *   subtitle    - string  — subtítulo
 */

function computePinHash(p) {
  let hash = 0;
  for (let i = 0; i < p.length; i++) {
    hash = ((hash << 5) - hash) + p.charCodeAt(i);
    hash |= 0;
  }
  return 'pin_' + hash;
}

export function pinHash(pin) {
  return computePinHash(pin);
}

export default function PinKeypad({ mode = 'enter', onComplete, onCancel, error: externalError, loading: externalLoading, title, subtitle }) {
  const [pin, setPin] = useState('');
  const [localError, setLocalError] = useState('');
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef(null);

  const error = externalError || localError;
  const loading = externalLoading || processing;

  // Auto-focus para teclado físico
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleDigit = useCallback((d) => {
    if (loading) return;
    setLocalError('');
    const newPin = pin + String(d);
    if (newPin.length <= 6) {
      setPin(newPin);
      if (newPin.length === 6) {
        setProcessing(true);
        Promise.resolve(onComplete(newPin))
          .catch(e => {
            setLocalError(e?.response?.data?.message || e?.message || 'PIN incorrecto');
            setPin('');
          })
          .finally(() => setProcessing(false));
      }
    }
  }, [pin, loading, onComplete]);

  const handleDelete = useCallback(() => {
    if (loading) return;
    setPin(p => p.slice(0, -1));
    setLocalError('');
  }, [loading]);

  // Keyboard events
  useEffect(() => {
    const handler = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (/^Numpad[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key.slice(-1));
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleDelete();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDigit, handleDelete, pin]);

  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {title && <h3 className={styles.title}>{title}</h3>}
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}

        {/* Dots */}
        <div className={styles.dots}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={pin[i] !== undefined ? styles.dotFilled : styles.dotEmpty}
            />
          ))}
        </div>

        {/* Error */}
        {error && <p className={styles.error}>{error}</p>}
        {loading && <p className={styles.processing}>Verificando...</p>}

        {/* Keypad */}
        <div className={styles.keypad}>
          {digits.map(n => (
            <button
              key={n}
              className={styles.key}
              onClick={() => handleDigit(String(n))}
              disabled={loading}
            >
              {n}
            </button>
          ))}
          <div />
          <button
            className={styles.key}
            onClick={() => handleDigit('0')}
            disabled={loading}
          >
            0
          </button>
          <button
            className={styles.keyDelete}
            onClick={handleDelete}
            disabled={loading}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
              <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
            </svg>
          </button>
        </div>

        {onCancel && (
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancelar
          </button>
        )}

        {/* Hidden input for keyboard focus */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
          value=""
          readOnly
        />
      </div>
    </div>
  );
}
