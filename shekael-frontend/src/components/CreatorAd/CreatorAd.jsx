import { useState, useEffect, useRef, useCallback } from 'react';
import { recordAdImpression, getNextAd, getPoolStatus } from '../../api/ads.api';
import styles from './CreatorAd.module.css';

const SEEN_KEY = 'shekael_seen_ads';
const ACTIVITY_WINDOW_MS = 15000; // si no hay actividad en 15s, el tiempo no cuenta

function getSeenSet() {
    try {
        return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
    } catch {
        return new Set();
    }
}

/**
 * Anuncio en contenido del creador (modelo oficial por TIEMPO DE VISTA).
 * - Sin botones de interacción (nada incentivado, seguro con Google).
 * - Cuenta SOLO si el anuncio estuvo en pantalla + pestaña visible +
 *   hubo actividad real del usuario (mouse/teclado/scroll/touch) — o,
 *   en videos, si el video está reproduciéndose.
 * - Feed/texto/imagen: 10s · Video: 30s (solo mientras se reproduce).
 * - Un anuncio cuenta UNA vez por usuario al mes (rotación automática).
 * - Si no cumple el tiempo: la impresión se registra pero el valor
 *   se lo queda Shekael.
 */
export default function CreatorAd({ postId, creatorId, source = 'post_detail', adType = 'feed', isPlaying = null }) {
    const adRef = useRef(null);
    const [ad, setAd] = useState(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('pending'); // pending | watching | completed | error
    const [watchTime, setWatchTime] = useState(0);
    const [recorded, setRecorded] = useState(false);
    const [perViewRate, setPerViewRate] = useState(0.05);
    const [poolSettled, setPoolSettled] = useState(false);
    const timerRef = useRef(null);
    const lastActivityRef = useRef(Date.now());
    const seenRef = useRef(getSeenSet());

    const requiredSeconds = adType === 'preroll' ? 30 : 10;
    const isVideoAd = adType === 'preroll';

    // Cargar siguiente anuncio no visto
    useEffect(() => {
        let mounted = true;
        const seen = Array.from(seenRef.current).join(',');
        getNextAd(seen).then(data => {
            if (!mounted) return;
            setAd(data?.ad || null);
            setLoading(false);
        }).catch(() => {
            if (mounted) setLoading(false);
        });
        return () => { mounted = false; };
    }, [postId]);

    // Tasa del pool
    useEffect(() => {
        getPoolStatus().then(data => {
            if (data?.pool?.perViewMxn) {
                // La parte del usuario en contenido de creador es el 15%
                setPerViewRate(data.pool.perViewMxn * (data.pool.splits?.creatorContent?.user ?? 0.15));
            }
            if (data?.pool?.isSettled) setPoolSettled(true);
        }).catch(() => {});
    }, []);

    // Actividad real del usuario
    useEffect(() => {
        const bump = () => { lastActivityRef.current = Date.now(); };
        const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
        events.forEach(e => window.addEventListener(e, bump, { passive: true }));
        return () => events.forEach(e => window.removeEventListener(e, bump));
    }, []);

    const isInView = useRef(false);

    // Observador de visibilidad del anuncio
    useEffect(() => {
        const el = adRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => {
            isInView.current = entry.isIntersecting;
            if (entry.isIntersecting) setStatus(s => (s === 'pending' ? 'watching' : s));
        }, { threshold: 0.6 });
        observer.observe(el);
        return () => observer.disconnect();
    }, [ad]);

    // Contador de tiempo de vista
    useEffect(() => {
        if (recorded) return;
        timerRef.current = setInterval(() => {
            const tabVisible = document.visibilityState === 'visible';
            const videoPlaying = isVideoAd && isPlaying === true;
            const recentActivity = Date.now() - lastActivityRef.current < ACTIVITY_WINDOW_MS;

            // Para video: basta con que se esté reproduciendo.
            // Para estático: pestaña visible + en pantalla + actividad reciente.
            const counting = isInView.current && tabVisible && (videoPlaying || recentActivity);

            if (counting) {
                setWatchTime(prev => prev + 1);
            }
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recorded, isVideoAd, isPlaying]);

    // Al llegar al tiempo mínimo → registrar (una sola vez)
    useEffect(() => {
        if (watchTime >= requiredSeconds && !recorded) {
            recordImpression(watchTime);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watchTime, recorded]);

    const recordImpression = useCallback((seconds) => {
        setRecorded(true);
        setStatus('completed');
        if (ad?.id) seenRef.current.add(ad.id);

        recordAdImpression({
            ad_type: adType,
            source,
            creator_id: creatorId,
            watch_seconds: seconds,
            ad_id: ad?.id || null
        }).then(res => {
            if (res.rewarded) setPerViewRate(res.rewarded);
            if (res.isEstimated) setPoolSettled(false);
        }).catch(() => {
            setStatus('error');
        });
        if (timerRef.current) clearInterval(timerRef.current);
    }, [ad, adType, source, creatorId]);

    // Persistir vistos
    useEffect(() => {
        try {
            localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seenRef.current)));
        } catch (_) {}
    }, [ad]);

    if (loading) return null;
    if (!ad) return null; // sin anuncios aprobados disponibles

    const progress = Math.min(100, (watchTime / requiredSeconds) * 100);

    return (
        <div className={styles.creatorAd} ref={adRef}>
            <div className={styles.adBadge}>
                <span>Patrocinado · {isVideoAd ? '70% para este creador' : '70% para este creador'}</span>
            </div>

            <div className={styles.adContent}>
                <h4 className={styles.adTitle}>{ad.title || 'Anuncio'}</h4>
                {ad.description && <p className={styles.adDesc}>{ad.description}</p>}
                {ad.media_url && (
                    <img
                        className={styles.adMedia}
                        src={ad.media_url}
                        alt={ad.alt_text || ad.title || 'Anuncio'}
                        loading="lazy"
                    />
                )}
                {ad.cta_label && (
                    <a
                        className={styles.adCta}
                        href={ad.cta_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => { /* el CTA es libre, no cuenta como interacción pagada */ }}
                    >
                        {ad.cta_label}
                    </a>
                )}
                {ad.promo_text && <p className={styles.adPromo}>{ad.promo_text} {ad.promo_code}</p>}
            </div>

            <div className={styles.adFooter}>
                {status === 'pending' && <span className={styles.adStatus}>Desplázate ↓</span>}
                {status === 'watching' && watchTime < requiredSeconds && (
                    <span className={styles.adStatusActive}>
                        {watchTime}s / {requiredSeconds}s
                        {!isVideoAd && ' · sigue viendo'}
                    </span>
                )}
                {status === 'watching' && isVideoAd && isPlaying !== true && (
                    <span className={styles.adStatusActive}>Reproduce el video para ganar</span>
                )}
                {status === 'completed' && (
                    <span className={styles.adStatusDone}>
                        {poolSettled ? '+' : '~+'} ${perViewRate.toFixed(4)} MXN para ti · {poolSettled ? '' : 'se ajusta al cerrar el mes'}
                    </span>
                )}
                {status === 'error' && <span className={styles.adStatusError}>Error al registrar</span>}
            </div>

            {status === 'watching' && watchTime < requiredSeconds && (
                <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                </div>
            )}
        </div>
    );
}
