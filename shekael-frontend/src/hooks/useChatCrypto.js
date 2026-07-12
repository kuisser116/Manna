import { useEffect, useRef, useCallback } from 'react';
import useStore from '../store';

/**
 * Hook para cifrado E2EE con libsodium.
 * 
 * Los mensajes se cifran/descifran en el navegador usando un secreto compartido
 * derivado de la llave privada del usuario + llave pública del destinatario.
 */
export function useChatCrypto() {
  const { user } = useStore();
  const sodiumRef = useRef(null);
  const keyPairRef = useRef(null);

  // Inicializar libsodium
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const sodium = await import('libsodium-wrappers');
        await sodium.ready;
        if (mounted) {
          sodiumRef.current = sodium;
        }
      } catch (err) {
        console.warn('libsodium not available, falling back to IndexedDB key loading');
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  // Escuchar evento de bloqueo — limpiar cache en memoria
  useEffect(() => {
    const handler = () => { keyPairRef.current = null; };
    window.addEventListener('Shekael:lock', handler);
    return () => window.removeEventListener('Shekael:lock', handler);
  }, []);

  // Cargar llave privada desde IndexedDB
  const loadKeyPair = useCallback(async () => {
    if (keyPairRef.current) return keyPairRef.current;

    try {
      const db = await openKeyDB();
      const tx = db.transaction('keys', 'readonly');
      const store = tx.objectStore('keys');

      // Buscar primero la versión descifrada (main_unlocked, puesta por LockScreen)
      const unlocked = await new Promise((resolve) => {
        const req = store.get('main_unlocked');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });

      if (unlocked && unlocked.privateKey) {
        keyPairRef.current = {
          privateKey: unlocked.privateKey,
          publicKey: unlocked.publicKey
        };
        db.close();
        return keyPairRef.current;
      }

      // Fallback: versión plana original (para usuarios sin PIN)
      const stored = await new Promise((resolve) => {
        const req = store.get('main');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      db.close();

      if (stored) {
        keyPairRef.current = {
          privateKey: stored.privateKey,
          publicKey: stored.publicKey
        };
        return keyPairRef.current;
      }
    } catch (err) {
      console.warn('Could not load keys from IndexedDB:', err);
    }
    return null;
  }, []);

  // Generar nuevo par de llaves (Curve25519)
  const generateKeyPair = useCallback(async () => {
    if (!sodiumRef.current) {
      const sodium = await import('libsodium-wrappers');
      await sodium.ready;
      sodiumRef.current = sodium;
    }
    const sodium = sodiumRef.current;

    const kp = sodium.crypto_box_keypair();
    const keyPair = {
      publicKey: sodium.to_base64(kp.publicKey),
      privateKey: sodium.to_base64(kp.privateKey)
    };

    // Guardar en IndexedDB
    try {
      const db = await openKeyDB();
      const tx = db.transaction('keys', 'readwrite');
      const store = tx.objectStore('keys');
      await new Promise((resolve, reject) => {
        const req = store.put({ id: 'main', ...keyPair });
        req.onsuccess = resolve;
        req.onerror = reject;
      });
      db.close();
    } catch (err) {
      console.warn('Could not save keys to IndexedDB:', err);
    }

    keyPairRef.current = keyPair;
    return keyPair;
  }, []);

  // Derivar secreto compartido (para cifrar mensajes con otro usuario)
  const deriveSharedSecret = useCallback(async (theirPublicKeyBase64) => {
    if (!sodiumRef.current) {
      const sodium = await import('libsodium-wrappers');
      await sodium.ready;
      sodiumRef.current = sodium;
    }
    const sodium = sodiumRef.current;

    const kp = await loadKeyPair();
    if (!kp) throw new Error('No key pair available');

    const theirPublicKey = sodium.from_base64(theirPublicKeyBase64);
    const myPrivateKey = sodium.from_base64(kp.privateKey);

    // Diffie-Hellman: shared secret = scalar multiplication
    const sharedSecret = sodium.crypto_box_beforenm(theirPublicKey, myPrivateKey);
    return sharedSecret;
  }, [loadKeyPair]);

  // Cifrar mensaje
  const encrypt = useCallback(async (plaintext, theirPublicKeyBase64) => {
    if (!sodiumRef.current) {
      const sodium = await import('libsodium-wrappers');
      await sodium.ready;
      sodiumRef.current = sodium;
    }
    const sodium = sodiumRef.current;

    const sharedSecret = await deriveSharedSecret(theirPublicKeyBase64);
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(
      sodium.from_string(plaintext),
      nonce,
      sharedSecret
    );

    return {
      encryptedContent: sodium.to_base64(ciphertext),
      nonce: sodium.to_base64(nonce)
    };
  }, [deriveSharedSecret]);

  // Descifrar mensaje
  const decrypt = useCallback(async (encryptedContentBase64, nonceBase64, theirPublicKeyBase64) => {
    if (!sodiumRef.current) {
      const sodium = await import('libsodium-wrappers');
      await sodium.ready;
      sodiumRef.current = sodium;
    }
    const sodium = sodiumRef.current;

    const sharedSecret = await deriveSharedSecret(theirPublicKeyBase64);
    const ciphertext = sodium.from_base64(encryptedContentBase64);
    const nonce = sodium.from_base64(nonceBase64);

    const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, sharedSecret);
    return sodium.to_string(plaintext);
  }, [deriveSharedSecret]);

  // Limpiar cache en memoria (al bloquear la app con PIN)
  const clearKeyCache = useCallback(() => {
    keyPairRef.current = null;
  }, []);

  // Verificar si el usuario ya tiene llaves
  const hasKeys = useCallback(async () => {
    const kp = await loadKeyPair();
    return !!kp;
  }, [loadKeyPair]);

  return {
    generateKeyPair,
    loadKeyPair,
    encrypt,
    decrypt,
    hasKeys,
    clearKeyCache,
    ready: !!sodiumRef.current
  };
}

// ── IndexedDB helper ──
function openKeyDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ShekaelKeys', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export default useChatCrypto;
