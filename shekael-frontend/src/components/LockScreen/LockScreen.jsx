import { useEffect, useRef, useState } from 'react';
import { getPinStatus, verifyPin as apiVerifyPin, clearPin } from '../../api/auth.api';
import useChatCrypto from '../../hooks/useChatCrypto';
import useStore from '../../store';
import styles from './LockScreen.module.css';
import logoImg from '../../assets/personaje_1.12.png';

/**
 * LockScreen — PIN de seguridad para Shekael.
 *
 * ARQUITECTURA SERVER-FIRST:
 * - Nada en IndexedDB. Llave privada cifrada viaja desde/hacia Supabase.
 * - Setup: crypto.generateAndSetupKeypair(pin, pinHash) →
 *     genera keypair, cifra private_key con PIN, sube todo.
 * - Unlock: apiVerifyPin(pinHash) → server devuelve encryptedPrivateKey →
 *     crypto.unlockWithPin(encryptedPrivateKey, pin) → descifra en RAM.
 */
export default function LockScreen({ onUnlock }) {
  const crypto = useChatCrypto();
  const user = useStore(s => s.user);
  const logout = useStore(s => s.logout);
  const userId = user?.id;
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState('loading'); // loading | enter | create | confirm
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  // Al montar, verificar si el usuario ya tiene PIN en BD
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await getPinStatus();
        if (!cancelled) {
          setStep(res.data.hasPin ? 'enter' : 'create');
        }
      } catch {
        if (!cancelled) setStep('enter');
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (processing || step === 'loading') return;
      const digit = e.code.startsWith('Digit') ? e.code.slice(-1)
        : e.code.startsWith('Numpad') ? e.code.slice(-1)
        : null;
      if (digit !== null && digit >= '0' && digit <= '9') {
        e.preventDefault();
        handleDigit(digit);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Enter' || e.key === 'NumpadEnter') {
        e.preventDefault();
        if (step === 'enter' && pin.length > 0) {
          handleUnlock(pin);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processing, pin, confirmPin, step]);

  // Hash simple del PIN (solo para verificación contra server)
  // Se mantiene compatible con PINs existentes en la BD
  function computePinHash(p) {
    let hash = 0;
    for (let i = 0; i < p.length; i++) {
      hash = ((hash << 5) - hash) + p.charCodeAt(i);
      hash |= 0;
    }
    return 'pin_' + hash;
  }

  // ── Handlers ──

  const handleDigit = (d) => {
    if (processing || step === 'loading') return;
    setError('');
    if (step === 'enter') {
      const newPin = pin + d;
      if (newPin.length <= 6) {
        setPin(newPin);
        if (newPin.length === 6) {
          setTimeout(() => handleUnlock(newPin), 100);
        }
      }
    } else if (step === 'create') {
      const newPin = pin + d;
      if (newPin.length <= 6) {
        setPin(newPin);
        if (newPin.length === 6) {
          setTimeout(() => setStep('confirm'), 200);
        }
      }
    } else if (step === 'confirm') {
      const newPin = confirmPin + d;
      if (newPin.length <= 6) {
        setConfirmPin(newPin);
        if (newPin.length === 6) {
          setTimeout(() => handleSetup(newPin), 100);
        }
      }
    }
  };

  const handleDelete = () => {
    if (step === 'enter') setPin(p => p.slice(0, -1));
    else if (step === 'create') setPin(p => p.slice(0, -1));
    else if (step === 'confirm') setConfirmPin(p => p.slice(0, -1));
  };

  /** UNLOCK: Verificar PIN → server devuelve chat keypair (cifrado con Stellar key inmutable) */
  const handleUnlock = async (enteredPin) => {
    const pinHash = await computePinHash(enteredPin);

    setProcessing(true);
    try {
      // 1. Verificar PIN contra server
      const res = await apiVerifyPin(pinHash);
      const encryptedPrivateKey = res.data?.encryptedPrivateKey;
      const stellarSecretKeyEncrypted = res.data?.stellarSecretKeyEncrypted;

      if (!encryptedPrivateKey) {
        // No hay chat keypair → setup nuevo
        setPin('');
        setConfirmPin('');
        setStep('create');
        setProcessing(false);
        return;
      }

      // 2. Usar stellarSecretKey (inmutable) para descifrar chat keypair
      // El backend ya descifró stellarSecretKey con userId y lo envía
      // Ahora lo usamos para descifrar la chat keypair
      const stellarSecretKey = res.data?.stellarSecretKey; // Backend lo envía si lo tenemos
      if (stellarSecretKey) {
        await crypto.unlockWithStellarKey(encryptedPrivateKey, stellarSecretKey);
      } else {
        // Fallback: migración desde cifrado con PIN viejo
        // Esto fallará intencionalmente si no se ha migrado
        await crypto.unlockWithStellarKey(encryptedPrivateKey, enteredPin);
      }

      setPin('');
      onUnlock();
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'PIN incorrecto';
      setError(msg);
      setPin('');
      setProcessing(false);
      inputRef.current?.focus();
    }
  };

  /** SETUP: Crear PIN → generar keypair → cifrar con Stellar key (inmutable) → subir */
  const handleSetup = async (confirmedPin) => {
    if (pin !== confirmedPin) {
      setError('Los PIN no coinciden');
      setConfirmPin('');
      setPin('');
      setStep('create');
      return;
    }

    const pinHash = await computePinHash(pin);

    setProcessing(true);
    try {
      // Obtener stellarSecretKey del backend (ya descifrado con userId)
      // Necesitamos descifrar stellarSecretKeyEncrypted con userId en el frontend
      // Para eso necesitamos la función decrypt del crypto.service
      const user = useStore.getState().user;
      const { decryptForUser } = await import('../../services/crypto.service.js');
      const stellarSecretKey = decryptForUser(user.id, user.stellar_secret_key_encrypted);
      
      // Generar keypair, cifrar con Stellar key (inmutable), subir
      await crypto.generateAndSetupWithStellarKey(stellarSecretKey, pinHash);

      setPin('');
      setConfirmPin('');
      onUnlock();
    } catch (e) {
      setError('Error al configurar PIN: ' + (e.message || 'desconocido'));
      setPin('');
      setConfirmPin('');
      setStep('create');
      setProcessing(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <img src={logoImg} alt="Shekael" className={styles.logo} />

        {step === 'loading' && (
          <>
            <h2 className={styles.title}>Cargando...</h2>
            <p className={styles.subtitle}>Verificando configuración de seguridad</p>
          </>
        )}

        {step === 'enter' && (
          <>
            <h2 className={styles.title}>Desbloquear Shekael</h2>
            <p className={styles.subtitle}>Ingresa tu PIN de 6 dígitos</p>
          </>
        )}

        {step === 'create' && (
          <>
            <h2 className={styles.title}>Crear PIN de seguridad</h2>
            <p className={styles.subtitle}>Elige un PIN de 6 dígitos</p>
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
          {Array.from({ length: 6 - (step === 'enter' ? pin : step === 'confirm' ? confirmPin : pin).length }).map((_, i) => (
            <div key={`e${i}`} className={styles.pinDotEmpty} />
          ))}
        </div>

        {processing && <p className={styles.processing}>Procesando...</p>}
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

        {step === 'enter' && (
          <>
            <span
              className={styles.switchAccount}
              onClick={() => {
                logout();
                window.location.reload();
              }}
            >
              Cambiar de cuenta
            </span>
            <span
              className={styles.forgotPin}
              onClick={() => {
                window.location.href = '/recovery';
              }}
            >
              Olvidé mi PIN
            </span>
          </>
        )}
      </div>
    </div>
  );
}
