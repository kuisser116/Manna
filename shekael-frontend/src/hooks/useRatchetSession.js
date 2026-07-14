import { useCallback, useRef } from 'react';
import useStore from '../store';

/**
 * useRatchetSession — Forward Secrecy + Recovery
 * 
 * Por cada conversación, mantiene una cadena unidireccional de llaves.
 * Cada mensaje se cifra con una llave única derivada de la anterior.
 * 
 * Las sesiones se almacenan por usuario en IndexedDB (ShekaelRatchet_{userId}).
 * Las llaves de IndexedDB Keys también se guardan por usuario (main_{userId}).
 */
export function useRatchetSession() {
  const userId = useStore(s => s.user?.id);
  const cacheRef = useRef({});

  // Helper: nombres de DB por usuario
  const ratchetDbName = userId ? `ShekaelRatchet_${userId}` : 'ShekaelRatchet';
  const keysDbName = 'ShekaelKeys'; // misma DB para todos, keys por userId
  const keyId = useCallback((base) => {
    return userId ? `${base}_${userId}` : base;
  }, [userId]);

  // ── KDF: HMAC-SHA256 vía Web Crypto ──
  const hmac256 = useCallback(async (keyBytes, info) => {
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const sig = await crypto.subtle.sign(
      'HMAC', cryptoKey, new TextEncoder().encode(info)
    );
    return new Uint8Array(sig);
  }, []);

  // ── IndexedDB helpers ──
  const openRatchetDB = useCallback(() => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(ratchetDbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('sessions'))
          req.result.createObjectStore('sessions', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }, [ratchetDbName]);

  const loadState = useCallback(async (convId) => {
    if (cacheRef.current[convId]) return cacheRef.current[convId];
    try {
      const db = await openRatchetDB();
      const tx = db.transaction('sessions', 'readonly');
      const stored = await new Promise((resolve) => {
        const req = tx.objectStore('sessions').get(`conv_${convId}`);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      db.close();
      if (stored) {
        stored.rootKey = new Uint8Array(stored.rootKey);
        cacheRef.current[convId] = stored;
      }
      return stored || null;
    } catch { return null; }
  }, [openRatchetDB]);

  const saveState = useCallback(async (convId) => {
    const s = cacheRef.current[convId];
    if (!s) return;
    try {
      const db = await openRatchetDB();
      const tx = db.transaction('sessions', 'readwrite');
      await new Promise((resolve, reject) => {
        const req = tx.objectStore('sessions').put({
          id: `conv_${convId}`,
          counter: s.counter,
          rootKey: Array.from(s.rootKey)
        });
        req.onsuccess = resolve;
        req.onerror = reject;
      });
      db.close();
    } catch (e) { console.warn('ratchet save:', e); }
  }, [openRatchetDB]);

  const initSession = useCallback(async (convId, sharedSecret) => {
    const rootKey = await hmac256(sharedSecret, 'shekael-ratchet-v1');
    cacheRef.current[convId] = { counter: 0, rootKey };
    await saveState(convId);
    return true;
  }, [hmac256, saveState]);

  const recoverSession = useCallback(async (convId, sharedSecret, messages) => {
    const maxIndex = messages.reduce((m, msg) => Math.max(m, msg.msg_index || 0), 0);
    if (maxIndex === 0) {
      await initSession(convId, sharedSecret);
      return new Map();
    }

    let rootKey = await hmac256(sharedSecret, 'shekael-ratchet-v1');
    const keys = new Map();

    for (let i = 1; i <= maxIndex; i++) {
      const msgKey = await hmac256(rootKey, `key:${i}`);
      const nextRootKey = await hmac256(rootKey, `ratchet:${i}`);
      const hasMsg = messages.some(m => m.msg_index === i);
      if (hasMsg) keys.set(i, msgKey);
      rootKey = nextRootKey;
    }

    cacheRef.current[convId] = { counter: maxIndex, rootKey };
    await saveState(convId);
    return keys;
  }, [hmac256, initSession, saveState]);

  const nextKey = useCallback(async (convId) => {
    let s = cacheRef.current[convId];
    if (!s) s = await loadState(convId);
    if (!s) throw new Error(`No ratchet session for ${convId}.`);

    const newCounter = s.counter + 1;
    const msgKey = await hmac256(s.rootKey, `key:${newCounter}`);
    const nextRootKey = await hmac256(s.rootKey, `ratchet:${newCounter}`);

    s.counter = newCounter;
    s.rootKey = nextRootKey;
    await saveState(convId);

    return { msgKey, msgIndex: newCounter };
  }, [hmac256, loadState, saveState]);

  const deriveKeyForIndex = useCallback(async (convId, sharedSecret, targetIndex) => {
    let rootKey;
    if (cacheRef.current[convId]) {
      rootKey = cacheRef.current[convId].rootKey;
    } else {
      rootKey = await hmac256(sharedSecret, 'shekael-ratchet-v1');
    }

    const session = cacheRef.current[convId];
    const start = session?.counter || 0;

    if (targetIndex <= start) {
      let rk = await hmac256(sharedSecret, 'shekael-ratchet-v1');
      for (let i = 1; i < targetIndex; i++) {
        rk = await hmac256(rk, `ratchet:${i}`);
      }
      const msgKey = await hmac256(rk, `key:${targetIndex}`);
      return msgKey;
    }

    for (let i = start + 1; i < targetIndex; i++) {
      rootKey = await hmac256(rootKey, `ratchet:${i}`);
    }
    const msgKey = await hmac256(rootKey, `key:${targetIndex}`);
    const nextRootKey = await hmac256(rootKey, `ratchet:${targetIndex}`);

    cacheRef.current[convId] = { counter: targetIndex, rootKey: nextRootKey };
    await saveState(convId);

    return msgKey;
  }, [hmac256, saveState]);

  const deriveFromPreKey = useCallback(async (myPrivateKey, theirPreKeyPublicBase64) => {
    const { default: _sodium, ready } = await import('libsodium-wrappers');
    await ready;

    const dh1 = _sodium.crypto_box_beforenm(
      _sodium.from_base64(theirPreKeyPublicBase64),
      _sodium.from_base64(myPrivateKey)
    );

    const ephKp = _sodium.crypto_box_keypair();
    const ephPriv = _sodium.to_base64(ephKp.privateKey);
    const ephPub = _sodium.to_base64(ephKp.publicKey);

    return { sharedSecret: dh1, ephemeralPublicKey: ephPub, ephemeralPrivateKey: ephPriv };
  }, []);

  const deriveFullX3DH = useCallback(async (myPrivateKey, theirIdentityPublicKey, theirPreKeyPublicBase64) => {
    const { default: _sodium, ready } = await import('libsodium-wrappers');
    await ready;

    const dh1 = _sodium.crypto_box_beforenm(
      _sodium.from_base64(theirPreKeyPublicBase64),
      _sodium.from_base64(myPrivateKey)
    );

    const ephKp = _sodium.crypto_box_keypair();
    const ephPriv = _sodium.from_base64(_sodium.to_base64(ephKp.privateKey));
    const ephPub = _sodium.to_base64(ephKp.publicKey);

    const dh2 = _sodium.crypto_box_beforenm(
      _sodium.from_base64(theirIdentityPublicKey),
      ephPriv
    );

    const dh3 = _sodium.crypto_box_beforenm(
      _sodium.from_base64(theirPreKeyPublicBase64),
      ephPriv
    );

    const combined = new Uint8Array(dh1.length + dh2.length + dh3.length);
    combined.set(dh1, 0);
    combined.set(dh2, dh1.length);
    combined.set(dh3, dh1.length + dh2.length);
    const sharedSecret = await hmac256(combined, 'shekael-x3dh-v1');

    return { sharedSecret, ephemeralPublicKey: ephPub };
  }, [hmac256]);

  const recoverFromPreKey = useCallback(async (convId, myPreKeyPrivate, ephemeralPublicKey, theirIdentityPublicKey) => {
    const { default: _sodium, ready } = await import('libsodium-wrappers');
    await ready;

    const dh1 = _sodium.crypto_box_beforenm(
      _sodium.from_base64(theirIdentityPublicKey),
      _sodium.from_base64(myPreKeyPrivate)
    );

    const kp = await getMyKeyPair();
    const dh2 = _sodium.crypto_box_beforenm(
      _sodium.from_base64(ephemeralPublicKey),
      _sodium.from_base64(kp.privateKey)
    );

    const dh3 = _sodium.crypto_box_beforenm(
      _sodium.from_base64(ephemeralPublicKey),
      _sodium.from_base64(myPreKeyPrivate)
    );

    const combined = new Uint8Array(dh1.length + dh2.length + dh3.length);
    combined.set(dh1, 0);
    combined.set(dh2, dh1.length);
    combined.set(dh3, dh1.length + dh2.length);
    const sharedSecret = await hmac256(combined, 'shekael-x3dh-v1');

    await initSession(convId, sharedSecret);
    return sharedSecret;
  }, [hmac256, initSession]);

  const getMyKeyPair = useCallback(async () => {
    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(keysDbName, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('keys'))
            req.result.createObjectStore('keys', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('keys', 'readonly');
      const stored = await new Promise((resolve) => {
        const req = tx.objectStore('keys').get(keyId('main'));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      db.close();
      return stored;
    } catch { return null; }
  }, [keysDbName, keyId]);

  const clearSession = useCallback(async (convId) => {
    delete cacheRef.current[convId];
    try {
      const db = await openRatchetDB();
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').delete(`conv_${convId}`);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      db.close();
    } catch {}
  }, [openRatchetDB]);

  return {
    loadState,
    saveState,
    initSession,
    recoverSession,
    nextKey,
    deriveKeyForIndex,
    deriveFromPreKey,
    deriveFullX3DH,
    recoverFromPreKey,
    getMyKeyPair,
    clearSession
  };
}

export default useRatchetSession;
