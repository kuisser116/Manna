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
  const chatCrypto = useChatCrypto();
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
      // Llamar al endpoint del backend que descifra todo con Stellar key
      const { unlockChat } = await import('../../api/chat.api.js');
      const res = await unlockChat(pinHash);

      if (!res.success) {
        // Necesita migración automática de cifrado-PIN a cifrado-StellarKey
        if (res.needsMigration) {
          try {
            // 1. Descifrar con PIN viejo (libsodium, solo frontend tiene)
            const privateKey = await chatCrypto.unlockWithPin(res.encryptedPrivateKey, enteredPin);
            
            // 2. Enviar privateKey descifrada al backend para recifrar con Stellar key
            const { migrateChat } = await import('../../api/chat.api.js');
            const migrateRes = await migrateChat(pinHash, privateKey);
            if (migrateRes.success) {
              // Migración exitosa → guardar keypair y continuar
              const { setKeyPair } = await import('../../crypto/keyStore');
              setKeyPair({ privateKey: migrateRes.privateKey, publicKey: res.publicKey || '' });
              setPin('');
              onUnlock();
              return;
            }
            throw new Error(migrateRes.message || 'Error en migración');
          } catch (migrateErr) {
            throw new Error(migrateErr.message || 'Error migrando llaves de chat');
          }
        }
        throw new Error(res.message || 'PIN incorrecto');
      }

      if (res.needsSetup) {
        // No hay chat keypair → setup nuevo
        setPin('');
        setConfirmPin('');
        setStep('create');
        setProcessing(false);
        return;
      }

      // Guardar keypair en RAM
      const { setKeyPair } = await import('../../crypto/keyStore');
      setKeyPair({ privateKey: res.privateKey, publicKey: res.publicKey });

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

  /** SETUP: Crear PIN → generar keypair → subir al backend (él cifra con Stellar key) */
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
      // Generar keypair localmente (sin cifrar)
      const sodium = await crypto.ready;
      const { default: sodiumLib } = await import('libsodium-wrappers');
      await sodiumLib.ready;
      const kp = sodiumLib.crypto_box_keypair();
      const publicKey = sodiumLib.to_base64(kp.publicKey);
      const privateKey = sodiumLib.to_base64(kp.privateKey);

      // Subir al backend — él cifra privateKey con Stellar key y guarda
      const { setupChat } = await import('../../api/chat.api.js');
      const res = await setupChat(pinHash, publicKey, privateKey);

      if (!res.success) {
        throw new Error(res.message || 'Error al guardar llaves');
      }

      // Guardar en RAM
      const { setKeyPair } = await import('../../crypto/keyStore');
      setKeyPair({ privateKey, publicKey });

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
