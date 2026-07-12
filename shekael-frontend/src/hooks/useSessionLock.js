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

  // Bloquear manualmente
  const lock = useCallback(() => {
    setLocked(true);
  }, []);

  return { locked, unlock, lock, resetTimer };
}

export default useSessionLock;
