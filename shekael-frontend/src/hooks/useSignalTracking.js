import { useEffect, useRef, useCallback } from 'react';
import { trackSignal } from '../api/algorithm.api';

/**
 * Hook para trackear señales de engagement en un post.
 * @param {string} postId - ID del post
 * @param {string} source - 'shekael' o 'fediverso'
 * @param {object} options - { trackView, trackDwell, trackCompletion }
 */
export function useSignalTracking(postId, source = 'shekael', options = {}) {
    const {
        trackView = true,
        trackDwell = true,
        trackCompletion = false,
    } = options;

    const dwellTimerRef = useRef(null);
    const dwellStartRef = useRef(null);
    const hasTrackedView = useRef(false);
    const hasTrackedDwell5 = useRef(false);
    const hasTrackedDwell30 = useRef(false);

    // Trackear vista (una vez)
    useEffect(() => {
        if (!trackView || hasTrackedView.current || !postId) return;
        hasTrackedView.current = true;
        trackSignal(postId, 'view', source);
    }, [postId, source, trackView]);

    // Dwell time — medir cuánto tiempo está en viewport
    const onVisible = useCallback(() => {
        if (!trackDwell || !postId) return;
        dwellStartRef.current = Date.now();

        dwellTimerRef.current = setInterval(() => {
            if (!dwellStartRef.current) return;
            const elapsed = (Date.now() - dwellStartRef.current) / 1000;

            if (elapsed >= 5 && !hasTrackedDwell5.current) {
                hasTrackedDwell5.current = true;
                trackSignal(postId, 'dwell_5s', source);
            }
            if (elapsed >= 30 && !hasTrackedDwell30.current) {
                hasTrackedDwell30.current = true;
                trackSignal(postId, 'dwell_30s', source);
                clearInterval(dwellTimerRef.current);
            }
        }, 1000);
    }, [postId, source, trackDwell]);

    const onHidden = useCallback(() => {
        if (dwellTimerRef.current) {
            clearInterval(dwellTimerRef.current);
            dwellTimerRef.current = null;
        }
        dwellStartRef.current = null;
    }, []);

    // Cleanup
    useEffect(() => {
        return () => {
            if (dwellTimerRef.current) clearInterval(dwellTimerRef.current);
        };
    }, []);

    // Track completion (llamar manualmente cuando el usuario completa el contenido)
    const trackCompletion = useCallback(() => {
        if (!postId) return;
        trackSignal(postId, 'completion', source);
    }, [postId, source]);

    return { onVisible, onHidden, trackCompletion };
}
