import { useEffect, useRef, useState } from 'react';
import styles from './LockScreen.module.css';
import logoImg from '../../assets/personaje_1.12.png';

/**
 * LockScreen — PIN de seguridad para la app.
 * 
 * Cifra la llave privada con el PIN usando PBKDF2 + AES-GCM.
 * Sin PIN correcto, la llave privada no se puede leer.
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
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  // ── Crypto helpers ──

  // Derivar AES-256 key del PIN usando PBKDF2
  async function deriveAesKey(pin, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(pin),
      'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Verificar PIN (hash simple local)
  function checkPinHash(enteredPin) {
    const stored = localStorage.getItem('shekael_pin_hash');
    if (!stored) return false;
    let hash = 0;
    for (let i = 0; i < enteredPin.length; i++) {
      hash = ((hash << 5) - hash) + enteredPin.charCodeAt(i);
      hash |= 0;
    }
    return 'pin_' + hash === stored;
  }

  function savePinHash(p) {
    let hash = 0;
    for (let i = 0; i < p.length; i++) {
      hash = ((hash << 5) - hash) + p.charCodeAt(i);
      hash |= 0;
    }
    localStorage.setItem('shekael_pin_hash', 'pin_' + hash);
  }

  // Abrir IndexedDB
  function openKeysDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('ShekaelKeys', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('keys'))
          req.result.createObjectStore('keys', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Cifrar la llave privada con el PIN y guardarla en IDB (borrando la plana)
  async function encryptKeyWithPin(thePin) {
    const db = await openKeysDB();
    const tx = db.transaction('keys', 'readwrite');
    const store = tx.objectStore('keys');

    // Obtener llave plana actual
    const stored = await new Promise((resolve) => {
      const req = store.get('main');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (!stored || !stored.privateKey) throw new Error('No hay llave privada para cifrar');

    // Derivar key AES-256 del PIN
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await deriveAesKey(thePin, salt);

    // Cifrar privateKey
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      enc.encode(stored.privateKey)
    );

    // Guardar versión cifrada, borrar plana
    store.put({
      id: 'main_encrypted',
      encryptedData: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      salt: btoa(String.fromCharCode(...salt)),
      iv: btoa(String.fromCharCode(...iv))
    });
    store.delete('main');

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  }

  // Descifrar la llave con el PIN y ponerla a disposición como 'main' (temporal)
  async function decryptKeyWithPin(thePin) {
    const db = await openKeysDB();
    const tx = db.transaction('keys', 'readwrite');
    const store = tx.objectStore('keys');

    const encryptedEntry = await new Promise((resolve) => {
      const req = store.get('main_encrypted');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (!encryptedEntry) throw new Error('No hay llave cifrada');

    // Reconstruir bytes
    const salt = Uint8Array.from(atob(encryptedEntry.salt), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(encryptedEntry.iv), c => c.charCodeAt(0));
    const encryptedData = Uint8Array.from(atob(encryptedEntry.encryptedData), c => c.charCodeAt(0));

    // Derivar key AES-256 del PIN
    const aesKey = await deriveAesKey(thePin, salt);

    // Descifrar
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encryptedData
    );

    const decryptedKey = new TextDecoder().decode(decrypted);

    // Guardar temporalmente como 'main_unlocked' (se borra al bloquear)
    store.put({
      id: 'main_unlocked',
      publicKey: encryptedEntry.publicKey,
      privateKey: decryptedKey
    });

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  }

  // ── Handlers ──

  const handleDigit = (d) => {
    if (processing) return;
    setError('');
    if (step === 'enter') {
      const newPin = pin + d;
      if (newPin.length <= 6) {
        setPin(newPin);
        if (newPin.length >= 4) {
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

  const verifyPin = async (enteredPin) => {
    if (!checkPinHash(enteredPin)) {
      setError('PIN incorrecto');
      setPin('');
      inputRef.current?.focus();
      return;
    }

    setProcessing(true);
    try {
      await decryptKeyWithPin(enteredPin);
      setPin('');
      onUnlock();
    } catch (e) {
      setError('Error al descifrar la llave: ' + e.message);
      setPin('');
      setProcessing(false);
      inputRef.current?.focus();
    }
  };

  const checkConfirm = async (confirm) => {
    if (pin !== confirm) {
      setError('Los PIN no coinciden');
      setConfirmPin('');
      setPin('');
      setStep('create');
      return;
    }

    setProcessing(true);
    try {
      // Cifrar la llave privada con el PIN
      await encryptKeyWithPin(pin);
      savePinHash(pin);
      setPin('');
      setConfirmPin('');
      onUnlock();
    } catch (e) {
      setError('Error al cifrar la llave: ' + e.message);
      setPin('');
      setConfirmPin('');
      setStep('create');
      setProcessing(false);
    }
  };

  const hasPinHash = !!localStorage.getItem('shekael_pin_hash');

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <img src={logoImg} alt="Shekael" className={styles.logo} />

        {step === 'enter' && (
          <>
            <h2 className={styles.title}>
              {hasPinHash ? 'Desbloquear Shekael' : 'Crear PIN de seguridad'}
            </h2>
            <p className={styles.subtitle}>
              {hasPinHash
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
          {Array.from({ length: 6 - (step === 'enter' ? pin : step === 'confirm' ? confirmPin : pin).length }).map((_, i) => (
            <div key={`e${i}`} className={i >= 4 ? styles.pinDotExtra : styles.pinDotEmpty} />
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
      </div>
    </div>
  );
}
