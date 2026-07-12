import { useCallback, useRef } from 'react';

/**
 * useRatchetSession — Forward Secrecy + Recovery
 * 
 * Por cada conversación, mantiene una cadena unidireccional de llaves.
 * Cada mensaje se cifra con una llave única derivada de la anterior.
 * 
 * Forward secrecy: el estado actual permite derivar llaves FUTURAS pero no PASADAS.
 * Recuperación: el shared secret ECDH es fijo, permite re-derivar toda la cadena.
 * 
 * Almacenamiento: IndexedDB → store 'ratchet_sessions' → { id: conv_{id}, counter, rootKey }
 */
export function useRatchetSession() {
  const cacheRef = useRef({}); // memoria: { [convId]: { counter, rootKey } }

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
  const openDB = useCallback(() => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('ShekaelRatchet', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('sessions'))
          req.result.createObjectStore('sessions', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }, []);

  const loadState = useCallback(async (convId) => {
    if (cacheRef.current[convId]) return cacheRef.current[convId];
    try {
      const db = await openDB();
      const tx = db.transaction('sessions', 'readonly');
      const stored = await new Promise((resolve) => {
        const req = tx.objectStore('sessions').get(`conv_${convId}`);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      db.close();
      if (stored) {
        stored.rootKey = new Uint8Array(stored.rootKey); // restaurar typed array
        cacheRef.current[convId] = stored;
      }
      return stored || null;
    } catch { return null; }
  }, [openDB]);

  const saveState = useCallback(async (convId) => {
    const s = cacheRef.current[convId];
    if (!s) return;
    try {
      const db = await openDB();
      const tx = db.transaction('sessions', 'readwrite');
      await new Promise((resolve, reject) => {
        const req = tx.objectStore('sessions').put({
          id: `conv_${convId}`,
          counter: s.counter,
          rootKey: Array.from(s.rootKey) // serializar como array de bytes
        });
        req.onsuccess = resolve;
        req.onerror = reject;
      });
      db.close();
    } catch (e) { console.warn('ratchet save:', e); }
  }, [openDB]);

  // ── Inicializar sesión desde shared secret (ECDH) ──
  // rootKey_0 = HKDF-HMAC(sharedSecret, "shekael-ratchet-v1")
  const initSession = useCallback(async (convId, sharedSecret) => {
    const rootKey = await hmac256(sharedSecret, 'shekael-ratchet-v1');
    cacheRef.current[convId] = { counter: 0, rootKey };
    await saveState(convId);
    return true;
  }, [hmac256, saveState]);

  // ── Recuperar sesión desde shared secret caminando toda la cadena ──
  // Para cargar una conversación existente: deriva todas las llaves desde rootKey_0
  // Devuelve Map<msgIndex, key> para descifrar
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
      // Guardar llave si hay un mensaje con este msgIndex
      const hasMsg = messages.some(m => m.msg_index === i);
      if (hasMsg) keys.set(i, msgKey);
      rootKey = nextRootKey;
    }

    // Estado final
    cacheRef.current[convId] = { counter: maxIndex, rootKey };
    await saveState(convId);
    return keys;
  }, [hmac256, initSession, saveState]);

  // ── Obtener llave para el SIGUIENTE mensaje a enviar ──
  // Avanza contador + derive key + ratchetea rootKey
  // Devuelve { msgKey, msgIndex }
  const nextKey = useCallback(async (convId) => {
    let s = cacheRef.current[convId];
    if (!s) s = await loadState(convId);
    if (!s) throw new Error(`No ratchet session for ${convId}. Call initSession or recoverSession first.`);

    const newCounter = s.counter + 1;
    const msgKey = await hmac256(s.rootKey, `key:${newCounter}`);
    const nextRootKey = await hmac256(s.rootKey, `ratchet:${newCounter}`);

    s.counter = newCounter;
    s.rootKey = nextRootKey;
    await saveState(convId);

    return { msgKey, msgIndex: newCounter };
  }, [hmac256, loadState, saveState]);

  // ── Derivar llave para un msgIndex específico (para mensajes entrantes) ──
  // Usa shared secret + camina cadena. Luego actualiza estado.
  // Devuelve el msgKey
  const deriveKeyForIndex = useCallback(async (convId, sharedSecret, targetIndex) => {
    let rootKey;
    if (cacheRef.current[convId]) {
      rootKey = cacheRef.current[convId].rootKey;
    } else {
      rootKey = await hmac256(sharedSecret, 'shekael-ratchet-v1');
    }

    // Caminar desde el counter actual hasta targetIndex
    const session = cacheRef.current[convId];
    const start = session?.counter || 0;

    if (targetIndex <= start) {
      // Ya pasamos este índice — re-derivar desde el shared secret
      let rk = await hmac256(sharedSecret, 'shekael-ratchet-v1');
      for (let i = 1; i < targetIndex; i++) {
        rk = await hmac256(rk, `ratchet:${i}`);
      }
      const msgKey = await hmac256(rk, `key:${targetIndex}`);
      // No avanzamos el estado porque ya estábamos más allá
      return msgKey;
    }

    // Avanzar desde start+1 hasta targetIndex
    for (let i = start + 1; i < targetIndex; i++) {
      rootKey = await hmac256(rootKey, `ratchet:${i}`);
    }
    const msgKey = await hmac256(rootKey, `key:${targetIndex}`);
    const nextRootKey = await hmac256(rootKey, `ratchet:${targetIndex}`);

    // Guardar nuevo estado
    cacheRef.current[convId] = { counter: targetIndex, rootKey: nextRootKey };
    await saveState(convId);

    return msgKey;
  }, [hmac256, saveState]);

  // ── Limpiar sesión (logout) ──
  const clearSession = useCallback(async (convId) => {
    delete cacheRef.current[convId];
    try {
      const db = await openDB();
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').delete(`conv_${convId}`);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      db.close();
    } catch {}
  }, [openDB]);

  return {
    loadState,
    saveState,
    initSession,
    recoverSession,
    nextKey,
    deriveKeyForIndex,
    clearSession
  };
}

export default useRatchetSession;
