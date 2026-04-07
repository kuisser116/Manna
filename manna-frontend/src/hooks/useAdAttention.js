import { useCallback, useEffect, useRef, useState } from 'react';

export function useAdAttention({ targetSeconds = 10, enabled = false, onComplete, elementRef, mode = 'strict' }) {
    const activeSecondsRef = useRef(0);
    const lastActivityRef = useRef(Date.now());
    const tickRef = useRef(null);
    const completedRef = useRef(false);
    const isVisibleRef = useRef(false);
    const isPageVisibleRef = useRef(!document.hidden);
    const [progress, setProgress] = useState(0);

    const IDLE_THRESHOLD_MS = mode === 'strict' ? 4000 : 15000;

    const resetTimer = useCallback(() => {
        activeSecondsRef.current = 0;
        completedRef.current = false;
        setProgress(0);
        lastActivityRef.current = Date.now();
    }, []);

    const handleActivity = useCallback(() => {
        lastActivityRef.current = Date.now();
    }, []);

    useEffect(() => {
        const handleVisibilityChange = () => {
            isPageVisibleRef.current = !document.hidden;
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    useEffect(() => {
        let observer;
        const checkVisibility = () => {
            if (!elementRef?.current) {
                // Si no hay ref después de unos intentos, asumimos visible para no bloquear
                isVisibleRef.current = true;
                return;
            }
            
            observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    isVisibleRef.current = entry.isIntersecting;
                });
            }, { threshold: 0.3 }); // Bajamos a 30% para ser más permisivos
            
            observer.observe(elementRef.current);
        };

        // Pequeño delay para asegurar que el DOM cargó
        const timer = setTimeout(checkVisibility, 500);

        return () => {
            clearTimeout(timer);
            if (observer) observer.disconnect();
        };
    }, [elementRef]);

    useEffect(() => {
        if (!enabled) return;

        const events = ['mousemove', 'touchmove', 'keydown', 'click', 'scroll'];
        events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));

        tickRef.current = setInterval(() => {
            if (completedRef.current) return;

            const now = Date.now();
            const isActive = now - lastActivityRef.current < IDLE_THRESHOLD_MS;
            
            // Si el modo es pasivo, solo nos importa que esté visible y la página activa.
            // Si es estricto (feed), además debe haber tenido actividad reciente.
            const conditionMet = mode === 'strict' 
                ? (isActive && isVisibleRef.current && isPageVisibleRef.current)
                : (isVisibleRef.current && isPageVisibleRef.current);

            if (conditionMet) {
                activeSecondsRef.current += 1;
                setProgress(Math.min((activeSecondsRef.current / targetSeconds) * 100, 100));
            }

            if (activeSecondsRef.current >= targetSeconds && !completedRef.current) {
                completedRef.current = true;
                clearInterval(tickRef.current);
                if (onComplete) onComplete(activeSecondsRef.current);
            }
        }, 1000);

        return () => {
            events.forEach(e => window.removeEventListener(e, handleActivity));
            if (tickRef.current) clearInterval(tickRef.current);
        };
    }, [enabled, targetSeconds, handleActivity, onComplete, mode, IDLE_THRESHOLD_MS]);

    return {
        progress,
        isCompleted: completedRef.current,
        reset: resetTimer,
        isActive: Date.now() - lastActivityRef.current < IDLE_THRESHOLD_MS
    };
}

export default useAdAttention;
