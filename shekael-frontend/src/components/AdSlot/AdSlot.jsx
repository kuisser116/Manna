import { useState, useEffect, useRef, useCallback } from 'react';
import { recordAdImpression } from '../../api/ads.api';
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
    const [status, setStatus] = useState('pending'); // pending | inProgress | completed | error
    const [focusTime, setFocusTime] = useState(0);
    const [recorded, setRecorded] = useState(false);
    const focusTimerRef = useRef(null);
    const wasInViewRef = useRef(false);
    const rewardAmount = 0.15; // ~$0.15 MXN por ad en feed

    // Intersection Observer para detectar visibilidad
    useEffect(() => {
        const el = adRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    wasInViewRef.current = true;
                    setStatus('inProgress');
                    // Iniciar timer de foco si no está corriendo
                    if (!focusTimerRef.current) {
                        focusTimerRef.current = setInterval(() => {
                            if (document.visibilityState === 'visible') {
                                setFocusTime(prev => prev + 1);
                            }
                        }, 1000);
                    }
                } else {
                    if (wasInViewRef.current && status === 'inProgress') {
                        // Ya no está visible, detener timer
                        if (focusTimerRef.current) {
                            clearInterval(focusTimerRef.current);
                            focusTimerRef.current = null;
                        }
                    }
                }
            },
            { threshold: 0.7 } // 70% visible
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [status]);

    // Cuando se alcanza el tiempo mínimo, registrar la impresión
    useEffect(() => {
        if (focusTime >= 5 && !recorded && wasInViewRef.current) {
            setRecorded(true);
            setStatus('completed');

            recordAdImpression({
                ad_type: 'feed',
                source,
                creator_id: null,
                focus_duration: focusTime
            }).catch(() => {
                setStatus('error');
            });

            if (focusTimerRef.current) {
                clearInterval(focusTimerRef.current);
                focusTimerRef.current = null;
            }
        }
    }, [focusTime, recorded, source]);

    // Limpiar al desmontar
    useEffect(() => {
        return () => {
            if (focusTimerRef.current) {
                clearInterval(focusTimerRef.current);
            }
        };
    }, []);

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
                        Acumula y retira cada mes.
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
                        {focusTime >= 5 ? ' ✅ ¡Ganaste $0.15 MXN!' : ''}
                    </span>
                )}
                {status === 'completed' && (
                    <span className={styles.adStatusDone}>
                        ✅ +${rewardAmount.toFixed(2)} MXN
                    </span>
                )}
                {status === 'error' && (
                    <span className={styles.adStatusError}>
                        No se pudo registrar el anuncio
                    </span>
                )}
            </div>

            {/* Barra de progreso cuando está en progreso */}
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
