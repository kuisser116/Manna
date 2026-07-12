import { useEffect, useRef, useState, useCallback } from 'react';
import useStore from '../store';

/**
 * useSessionLock — Bloqueo automático por inactividad.
 * 
 * La app se bloquea después de inactivityTimeoutMs sin interacción.
 * Al desbloquear, se reinicia el timer.
 */
export function useSessionLock({ inactivityTimeoutMs = 5 * 60 * 1000 } = {}) {
  const token = useStore(s => s.token);
  const [locked, setLocked] = useState(false);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!mountedRef.current) return;

    timerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setLocked(true);
      }
    }, inactivityTimeoutMs);
  }, [inactivityTimeoutMs]);

  const unlock = useCallback(() => {
    setLocked(false);
    // Una vez desbloqueado, iniciar timer de inactividad
    resetTimer();
  }, [resetTimer]);

  // Activar solo cuando hay token
  useEffect(() => {
    mountedRef.current = true;
    if (!token) {
      setLocked(false);
      return;
    }

    // SIEMPRE bloquear al iniciar cuando hay token
    // Si no hay PIN configurado, LockScreen entra en modo 'setup'
    setLocked(true);

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
    const handler = () => resetTimer();

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetTimer();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, handler));
    };
  }, [token, resetTimer]);

  // Bloquear manualmente y limpiar llave descifrada
  const lock = useCallback(async () => {
    setLocked(true);

    // Notificar a todos los hooks que la app se bloqueó
    window.dispatchEvent(new CustomEvent('Shekael:lock'));

    // Limpiar la llave descifrada temporal de IndexedDB
    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('ShekaelKeys', 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('keys'))
            req.result.createObjectStore('keys', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('keys', 'readwrite');
      tx.objectStore('keys').delete('main_unlocked');
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      db.close();
    } catch {}
  }, []);

  return { locked, unlock, lock, resetTimer };
}

export default useSessionLock;
