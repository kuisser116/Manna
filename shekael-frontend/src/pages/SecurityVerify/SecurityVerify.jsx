import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../store';
import logoImg from '../../assets/personaje_1.12.png';
import styles from './SecurityVerify.module.css';

export default function SecurityVerify() {
  const navigate = useNavigate();
  const { token, user } = useStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef(null);

  const API_URL = import.meta.env.VITE_API_URL || location.origin;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (processing) return;
      const digit = e.code?.startsWith('Digit') ? e.code.slice(-1)
        : e.code?.startsWith('Numpad') ? e.code.slice(-1)
        : null;
      if (digit !== null && digit >= '0' && digit <= '9') {
        e.preventDefault();
        handleDigit(digit);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleDelete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processing, pin]);

  function computePinHash(p) {
    let hash = 0;
    for (let i = 0; i < p.length; i++) {
      hash = ((hash << 5) - hash) + p.charCodeAt(i);
      hash |= 0;
    }
    return 'pin_' + hash;
  }

  const handleDigit = (d) => {
    if (processing) return;
    setError('');
    const newPin = pin + d;
    if (newPin.length <= 6) {
      setPin(newPin);
      if (newPin.length === 6) {
        setTimeout(() => verifyPin(newPin), 100);
      }
    }
  };

  const handleDelete = () => {
    setPin(p => p.slice(0, -1));
    setError('');
  };

  const verifyPin = async (enteredPin) => {
    const pinHash = computePinHash(enteredPin);
    setProcessing(true);
    try {
      const res = await fetch(`${API_URL}/users/backup-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ pin: enteredPin })
      });
      const data = await res.json();
      if (res.ok) {
        // Navegar a mostrar la clave con los datos
        navigate('/settings/security', { state: { secretKey: data.secretKey, publicKey: data.publicKey } });
      } else {
        setError(data.message || 'PIN incorrecto');
        setPin('');
      }
    } catch (err) {
      setError('Error de conexión');
      setPin('');
    } finally {
      setProcessing(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <img src={logoImg} alt="Shekael" className={styles.logo} />
        <h2 className={styles.title}>Verificar identidad</h2>
        <p className={styles.subtitle}>Ingresa tu PIN para mostrar tu clave de recuperación</p>

        <div className={styles.pinDisplay}>
          {pin.split('').map((_, i) => (
            <div key={i} className={styles.pinDot} />
          ))}
          {Array.from({ length: 6 - pin.length }).map((_, i) => (
            <div key={`e${i}`} className={styles.pinDotEmpty} />
          ))}
        </div>

        {processing && <p className={styles.processing}>Verificando...</p>}
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

        <span className={styles.cancelLink} onClick={() => navigate(-1)}>
          Cancelar
        </span>
      </div>
    </div>
  );
}
