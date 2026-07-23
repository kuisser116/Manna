import { useState, useEffect, useRef, useCallback } from 'react';
import { recordAdImpression, getPoolStatus } from '../../api/ads.api';
import { Sparkles, TrendingUp } from 'lucide-react';
import styles from './AdSlot.module.css';

const AD_INTERVAL = 7; // cada 7 posts

/**
 * Determina si en esta posición del feed debe mostrarse un anuncio
 */
export function shouldShowAd(postIndex) {
    return postIndex > 0 && (postIndex + 1) % AD_INTERVAL === 0;
}

/**
 * Slot de anuncio que aparece como un post nativo en el feed
 */
export default function AdSlot({ postIndex, source = 'feed' }) {
    const adRef = useRef(null);
    const [status, setStatus] = useState('pending');
    const [focusTime, setFocusTime] = useState(0);
    const [recorded, setRecorded] = useState(false);
    const [perViewRate, setPerViewRate] = useState(0.05);
    const [poolSettled, setPoolSettled] = useState(false);
    const focusTimerRef = useRef(null);
    const wasInViewRef = useRef(false);

    // Cargar la tasa del pool al montar
    useEffect(() => {
        getPoolStatus().then(data => {
            if (data?.pool?.perViewMxn) setPerViewRate(data.pool.perViewMxn);
            if (data?.pool?.isSettled) setPoolSettled(data.pool.isSettled);
        }).catch(() => {});
    }, []);

    // Intersection Observer
    useEffect(() => {
        const el = adRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    wasInViewRef.current = true;
                    setStatus('inProgress');
                    if (!focusTimerRef.current) {
                        focusTimerRef.current = setInterval(() => {
                            if (document.visibilityState === 'visible') {
                                setFocusTime(prev => prev + 1);
                            }
                        }, 1000);
                    }
                } else {
                    if (wasInViewRef.current && status === 'inProgress') {
                        if (focusTimerRef.current) {
                            clearInterval(focusTimerRef.current);
                            focusTimerRef.current = null;
                        }
                    }
                }
            },
            { threshold: 0.7 }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [status]);

    useEffect(() => {
        if (focusTime >= 5 && !recorded && wasInViewRef.current) {
            setRecorded(true);
            setStatus('completed');

            recordAdImpression({
                ad_type: 'feed',
                source,
                creator_id: null,
                focus_duration: focusTime
            }).then(res => {
                if (res.rewarded) setPerViewRate(res.rewarded);
                if (res.isEstimated) setPoolSettled(false);
            }).catch(() => {
                setStatus('error');
            });

            if (focusTimerRef.current) {
                clearInterval(focusTimerRef.current);
                focusTimerRef.current = null;
            }
        }
    }, [focusTime, recorded, source]);

    useEffect(() => {
        return () => {
            if (focusTimerRef.current) clearInterval(focusTimerRef.current);
        };
    }, []);

    const rewardStr = poolSettled
        ? `$${perViewRate.toFixed(4)} MXN`
        : `~$${perViewRate.toFixed(4)} MXN`;

    return (
        <div className={styles.adSlot} ref={adRef}>
            <div className={styles.adBadge}>
                <Sparkles size={12} />
                <span>Patrocinado</span>
            </div>

            <div className={styles.adContent}>
                <div className={styles.adIcon}>
                    <TrendingUp size={32} />
                </div>
                <div className={styles.adText}>
                    <h4 className={styles.adTitle}>¿Cansado de redes que no te pagan?</h4>
                    <p className={styles.adDesc}>
                        Shekael valora tu atención. Sigue viendo contenido y gana MXN por cada anuncio que veas.
                        Tu ganancia se calcula del pool mensual — entre más veas, más ganas.
                    </p>
                </div>
            </div>

            <div className={styles.adFooter}>
                {status === 'pending' && (
                    <span className={styles.adStatus}>Desplázate para ver →</span>
                )}
                {status === 'inProgress' && (
                    <span className={styles.adStatusActive}>
                        Viendo... {focusTime}s / 5s
                    </span>
                )}
                {status === 'completed' && (
                    <span className={styles.adStatusDone}>
                        ✅ {poolSettled ? '+' : '~+'}
                        {rewardStr} estimado
                        {poolSettled ? ' (pool cerrado)' : ''}
                    </span>
                )}
                {status === 'error' && (
                    <span className={styles.adStatusError}>
                        No se pudo registrar el anuncio
                    </span>
                )}
            </div>

            {status === 'inProgress' && (
                <div className={styles.progressBar}>
                    <div
                        className={styles.progressFill}
                        style={{ width: `${Math.min(100, (focusTime / 5) * 100)}%` }}
                    />
                </div>
            )}
        </div>
    );
}
