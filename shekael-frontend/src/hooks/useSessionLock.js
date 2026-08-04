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
  const setSessionLocked = useStore(s => s.setSessionLocked);
  const [locked, setLocked] = useState(false);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  // Mientras haya un video reproduciéndose NO se agenda el bloqueo
  const videoPlayingRef = useRef(false);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!mountedRef.current) return;
    // Video reproduciendo → la pantalla no se bloquea
    if (videoPlayingRef.current) return;

    timerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        // Recargar la app para limpiar estado al bloquear por inactividad
        window.location.reload();
      }
    }, inactivityTimeoutMs);
  }, [inactivityTimeoutMs]);

  const setLockedState = useCallback((v) => {
    setLocked(v);
    setSessionLocked(v);
  }, [setSessionLocked]);

  const unlock = useCallback(() => {
    setLockedState(false);
    resetTimer();
  }, [setLockedState, resetTimer]);

  useEffect(() => {
    mountedRef.current = true;
    if (!token) {
      setLockedState(false);
      return;
    }

    setLockedState(true);

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
    const handler = () => resetTimer();

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetTimer();

    // Eventos de reproducción de video: mientras un video se reproduce,
    // se cancela el timer de inactividad (no bloquear la pantalla)
    const onVideoPlay = () => {
      videoPlayingRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const onVideoPause = () => {
      videoPlayingRef.current = false;
      resetTimer();
    };
    window.addEventListener('shekael:video-play', onVideoPlay);
    window.addEventListener('shekael:video-pause', onVideoPause);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, handler));
      window.removeEventListener('shekael:video-play', onVideoPlay);
      window.removeEventListener('shekael:video-pause', onVideoPause);
    };
  }, [token, resetTimer]);

  const lock = useCallback(() => {
    setLockedState(true);
    window.dispatchEvent(new CustomEvent('Shekael:lock'));
    // La llave en RAM se limpia automáticamente por el listener en useChatCrypto
  }, [setLockedState]);

  return { locked, unlock, lock, resetTimer };
}

export default useSessionLock;
