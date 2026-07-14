import { useEffect, useRef, useState, useCallback } from 'react';
import useStore from '../store';

/**
 * useSessionLock — Bloqueo automático por inactividad.
 * 
 * Al bloquearse: dispara evento 'Shekael:lock' que limpia la llave de RAM.
 * Al desbloquear: LockScreen vuelve a cargar la llave desde Supabase.
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
      if (mountedRef.current) setLocked(true);
    }, inactivityTimeoutMs);
  }, [inactivityTimeoutMs]);

  const unlock = useCallback(() => {
    setLocked(false);
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    mountedRef.current = true;
    if (!token) {
      setLocked(false);
      return;
    }

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

  const lock = useCallback(() => {
    setLocked(true);
    window.dispatchEvent(new CustomEvent('Shekael:lock'));
    // La llave en RAM se limpia automáticamente por el listener en useChatCrypto
  }, []);

  return { locked, unlock, lock, resetTimer };
}

export default useSessionLock;
