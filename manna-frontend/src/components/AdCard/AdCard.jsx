import React, { useState, useCallback, useRef, useEffect } from 'react';
import styles from './AdCard.module.css';
import { useAdAttention } from '../../hooks/useAdAttention.js';
import { ExternalLink, Volume2, VolumeX } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;
const MIN_VIEW_SECONDS = 10;

/**
 * AdCard — Diseño Instagram-style
 * - Avatar + nombre del anunciante + etiqueta "Publicidad"
 * - Media a ancho completo
 * - Descripción + botón CTA
 * - Sin montos visibles. Recompensa = sorpresa.
 * - ✦ indicador sutil cuando el usuario está activo
 */
const AdCard = ({ ad, proofToken, postId, context = 'feed', creatorId = null, onViewComplete }) => {
    const [isCompleted, setIsCompleted] = useState(false);
    const [isEnabled, setIsEnabled] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const videoRef = useRef(null);
    const token = localStorage.getItem('manna_token');

    // Auto-hide payout overlay after a few seconds
    useEffect(() => {
        if (isCompleted) {
            const timer = setTimeout(() => {
                setIsCompleted(false);
            }, 3500);
            return () => clearTimeout(timer);
        }
    }, [isCompleted]);

    const handleComplete = useCallback(async (activeSeconds) => {
        if (isCompleted || !ad || !proofToken) return;

        try {
            await axios.post(
                `${API_URL}/ads/view-confirmed`,
                { adId: ad.id, postId, viewSeconds: activeSeconds, proofToken, context, creatorId },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            // Solo marcar como completado si la API respondió OK
            setIsCompleted(true);
            window.dispatchEvent(new CustomEvent('manna:ad-reward'));
            if (onViewComplete) onViewComplete();
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            console.warn('Ad view confirm error:', msg);
            // Opcional: podrías emitir un evento de error para mostrar un toast
        }
    }, [ad, postId, proofToken, context, creatorId, isCompleted, onViewComplete, token]);

    const cardRef = useRef(null);
    
    const { progress, isActive } = useAdAttention({
        targetSeconds: MIN_VIEW_SECONDS,
        enabled: isEnabled && !isCompleted && !ad.already_viewed_today,
        onComplete: handleComplete,
        elementRef: cardRef,
        mode: context === 'feed' ? 'strict' : 'passive'
    });

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) {
                    setIsMuted(true);
                }
            },
            { threshold: 0.1 }
        );

        if (cardRef.current) {
            observer.observe(cardRef.current);
        }

        return () => observer.disconnect();
    }, []);

    if (!ad) return null;

    const handleFirstInteraction = () => {
        if (!isEnabled && !isCompleted && !ad.already_viewed_today) setIsEnabled(true);
    };

    const advertiserInitial = ad.advertiser_name?.[0]?.toUpperCase() || 'A';
    const ctaLabel = ad.cta_label || 'Conoce más';
    const ctaUrl = ad.cta_url || '#';

    return (
        <article
            ref={cardRef}
            className={styles.adCard}
            onMouseEnter={handleFirstInteraction}
            onTouchStart={handleFirstInteraction}
        >
            {/* Header — igual a la cabecera de un post de Instagram */}
            <div className={styles.adHeader}>
                <div className={styles.advertiserAvatar}>
                    {advertiserInitial}
                </div>
                <div className={styles.advertiserInfo}>
                    <span className={styles.advertiserName}>
                        {ad.advertiser_name || ad.title}
                    </span>
                    <span className={styles.publicidadTag}>Publicidad</span>
                </div>
                {ad.already_viewed_today && (
                    <div style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--color-primary)', fontWeight: 600, background: 'rgba(201, 168, 76, 0.1)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(201, 168, 76, 0.3)' }}>
                        ✓ RECOMPENSA RECIBIDA HOY
                    </div>
                )}
            </div>

            {/* Media — a ancho completo */}
            <div className={styles.adMedia}>
                {(ad.media_type?.includes('video') || ad.media_url?.match(/\.(mp4|webm|mov|ogg)$/i)) ? (
                    <div className={styles.videoContainer}>
                        <video
                            ref={videoRef}
                            className={styles.mediaEl}
                            src={ad.media_url}
                            autoPlay
                            muted={isMuted}
                            loop
                            playsInline
                        />
                        <button 
                            className={styles.muteBtn}
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsMuted(!isMuted);
                            }}
                            title={isMuted ? "Activar sonido" : "Silenciar"}
                        >
                            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>
                    </div>
                ) : (
                    <img
                        className={styles.mediaEl}
                        src={ad.media_url}
                        alt={ad.alt_text || ad.title}
                        loading="lazy"
                    />
                )}

                {/* REWARD INDICATOR — Bottom Right (Requested) */}
                {isEnabled && !isCompleted && !ad.already_viewed_today && (
                    <div className={`${styles.rewardIndicator} ${!isActive ? styles.paused : ''}`}>
                        <div className={styles.spinnerWrap}>
                            <svg className={styles.spinnerSvg} viewBox="0 0 50 50">
                                <circle 
                                    className={styles.spinnerBg} 
                                    cx="25" cy="25" r="20" fill="none" strokeWidth="4" 
                                />
                                <circle 
                                    className={styles.spinnerPath} 
                                    cx="25" cy="25" r="20" fill="none" strokeWidth="4" 
                                    strokeDasharray="125.6"
                                    strokeDashoffset={125.6 - (progress / 100) * 125.6}
                                />
                            </svg>
                        </div>
                        <span className={styles.rewardText}>
                            {!isActive ? '¡No te detengas!' : 'Espera por tu recompensa...'}
                        </span>
                    </div>
                )}
                
                {isCompleted && (
                    <div className={styles.rewardCompleted}>
                        <div className={styles.checkIcon}>✓</div>
                        <span>¡Recompensa enviada!</span>
                    </div>
                )}
            </div>

            {/* Footer — título, descripción, CTA */}
            <div className={styles.adFooter}>
                {ad.title && (
                    <p className={styles.adTitle}>{ad.title}</p>
                )}
                {ad.description && (
                    <p className={styles.adDescription}>{ad.description}</p>
                )}
                <a
                    className={styles.ctaButton}
                    href={ctaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { if (ctaUrl === '#') e.preventDefault(); }}
                >
                    {ctaLabel}
                    <ExternalLink size={13} />
                </a>
            </div>
        </article>
    );
};

export default AdCard;