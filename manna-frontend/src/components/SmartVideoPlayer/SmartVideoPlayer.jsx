import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Hls from 'hls.js';
import { useQuests } from '../../hooks/useQuests';
import useStore from '../../store';
import CustomVideoControls from '../CustomVideoControls/CustomVideoControls';
import styles from './SmartVideoPlayer.module.css';
import { getActiveAd, confirmAdView, claimCoupon } from '../../api/ads.api';

/**
 * SmartVideoPlayer
 * 
 * Soporta todos los estados del pipeline R2-Native HLS:
 * 
 *  'raw'          → <video src={r2Url}> MP4 directo desde R2 — egress $0
 *  'processing'   → <video src={r2Url}> MP4 + banner "Mejorando calidad..."
 *  'repatriating' → <video src={r2Url}> MP4 + banner "Mejorando calidad..."
 *  'r2-hls'       → hls.js con hlsR2Url (master.m3u8 en R2) — egress $0 ♾
 *  'hls'          → hls.js con playbackId de Livepeer (posts legados)
 * 
 * Props:
 *   videoData: { status, r2Url, playbackId, hlsR2Url }
 *   onPlay?: () => void
 *   isDetail?: boolean
 */
export function SmartVideoPlayer({ videoData = {}, onPlay, onViewValid, isDetail = true, postId, creatorId = null, context = 'video-midroll' }) {
    const { videoMode } = useStore();
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [hlsSrc, setHlsSrc] = useState(null);
    const [hlsError, setHlsError] = useState(false);
    const [isVertical, setIsVertical] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const { pingHeartbeat } = useQuests();
    const lastTimeRef = useRef(0);
    const accumulatedSecondsRef = useRef(0);
    const [viewSent, setViewSent] = useState(false);

    // Mid-roll AD State
    const [adData, setAdData] = useState(null);
    const [adSessionToken, setAdSessionToken] = useState(null);
    const [isAdPlaying, setIsAdPlaying] = useState(false);
    const [adAlreadyShown, setAdAlreadyShown] = useState(false);
    const [adCountdown, setAdCountdown] = useState(0);
    const [adTriggerTime, setAdTriggerTime] = useState(null);
    const adTimerRef = useRef(null);
    const preAdTimeRef = useRef(0);
    const [adEarnedCoupon, setAdEarnedCoupon] = useState(false);
    const [couponClaimed, setCouponClaimed] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const [showSkipConfirm, setShowSkipConfirm] = useState(false);


    const { status = 'raw', r2Url, playbackId, hlsR2Url } = videoData;

    const isProcessing = status === 'processing' || status === 'repatriating';
    const isR2HLS = status === 'r2-hls';
    const isLegacyHLS = status === 'hls';
    const isRaw = !isR2HLS && !isLegacyHLS; // raw, processing, repatriating
    const useHlsFallback = isR2HLS && hlsError && r2Url; // Si HLS falló, usar MP4

    // ── Declarative Ad Countdown ────────────────────────────────────
    useEffect(() => {
        if (isAdPlaying && adCountdown > 0) {
            const timer = setTimeout(() => setAdCountdown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [isAdPlaying, adCountdown]);


    // ── Resolver fuente HLS ──────────────────────────────────────────
    useEffect(() => {
        // Ruta 1: R2 nativo — el master.m3u8 ya es una URL absoluta de R2
        if (isR2HLS && hlsR2Url) {
            setHlsSrc(hlsR2Url);
            return;
        }

        // Ruta 2: Legacy Livepeer CDN — resolver URL desde la API de Livepeer
        if (isLegacyHLS && playbackId) {
            const fetchPlaybackInfo = async () => {
                try {
                    const res = await fetch(`https://livepeer.studio/api/playback/${playbackId}`);
                    if (!res.ok) throw new Error('Network response was not ok');
                    const data = await res.json();
                    if (data?.meta?.source) {
                        const hlsSource = data.meta.source.find(
                            s => s.hrn === 'HLS (TS)' || s.type === 'application/vnd.apple.mpegurl'
                        );
                        if (hlsSource) setHlsSrc(hlsSource.url);
                        else if (data.meta.source.length > 0) setHlsSrc(data.meta.source[0].url);
                    }
                } catch (error) {
                    console.error('[SmartVideoPlayer] Error resolviendo Livepeer legacy:', error);
                }
            };
            fetchPlaybackInfo();
        }
    }, [status, hlsR2Url, playbackId, isR2HLS, isLegacyHLS]);

    // ── Fetch Mid-roll Ad ──────────────────────────────────────────
    useEffect(() => {
        if (isDetail) {
            console.log(`[SmartVideoPlayer] Fetching ad for postId: ${postId}`);
            getActiveAd()
                .then(res => {
                    console.log(`[SmartVideoPlayer] Ad received:`, res.data?.ad ? res.data.ad.title : 'No ad');
                    if (res.data?.ad) {
                        setAdData(res.data.ad);
                        setAdSessionToken(res.data.sessionToken);
                    }
                })
                .catch(err => console.error('[SmartVideoPlayer] Error fetching mid-roll ad:', err));
        }
    }, [isDetail, postId]); // Se ejecuta cada vez que cambia el video

    // ── Instancia hls.js (solo para modos HLS) ──────────────────────
    useEffect(() => {
        if (!hlsSrc || isRaw) return;
        let hls;
        const video = videoRef.current;

        if (video) {
            if (Hls.isSupported()) {
                hls = new Hls({ maxMaxBufferLength: 30 });
                hls.loadSource(hlsSrc);
                hls.attachMedia(video);

                hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error('[SmartVideoPlayer] HLS Error:', data.type, data.details, data.fatal);

                    // Si es un error fatal o de parsing, activar fallback al MP4
                    if (data.fatal || data.type === Hls.ErrorTypes.MANIFEST_PARSING_ERROR || data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        console.error('[SmartVideoPlayer] HLS Error fatal/manifestParsingError, activando MP4 fallback');
                        setHlsError(true);
                        hls.destroy();
                    } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hls.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        hls.destroy();
                    }
                });

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setHlsError(false);
                    attemptPlay(video);
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari / iOS — soporte nativo
                video.src = hlsSrc;
                video.onerror = () => {
                    console.error('[SmartVideoPlayer] Error nativo HLS, usando MP4 fallback');
                    setHlsError(true);
                };
            }
        }

        return () => { if (hls) hls.destroy(); };
    }, [hlsSrc, isRaw]);

    // ── Anti-scrubbing + Quest heartbeat ────────────────────────────
    useEffect(() => {
        let interval;
        if (isPlaying) {
            interval = setInterval(() => {
                const video = videoRef.current;
                if (!video || video.playbackRate !== 1) return;

                const currentTime = video.currentTime;
                const timeDiff = Math.abs(currentTime - lastTimeRef.current);

                if (timeDiff > 2) {
                    // Salto de tiempo detectado (scrubbing)
                    lastTimeRef.current = currentTime;
                    return;
                }

                accumulatedSecondsRef.current += 1;
                lastTimeRef.current = currentTime;

                // ── Registro de Vista Válida (Mínimo 10s o 50%) ──
                if (!viewSent && onViewValid) {
                    const minRequired = duration > 0 ? Math.min(30, Math.max(10, duration * 0.5)) : 10;
                    if (accumulatedSecondsRef.current >= minRequired) {
                        onViewValid(accumulatedSecondsRef.current, duration);
                        setViewSent(true);
                    }
                }

                // ── Vistas y Heartbeat ──
                if (accumulatedSecondsRef.current % 10 === 0 && accumulatedSecondsRef.current > 0) {
                    pingHeartbeat(10, postId);
                }

                // ── Gatillo de Mid-roll AD (Tiempo aleatorio calculado en metadata) ──
                if (!adAlreadyShown && adData && adTriggerTime && currentTime >= adTriggerTime && !isAdPlaying) {
                    pauseMainVideoAndShowAd();
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, pingHeartbeat, adData, adAlreadyShown, isAdPlaying]);

    const pauseMainVideoAndShowAd = () => {
        const video = videoRef.current;
        if (video) {
            video.pause();
        }
        setIsAdPlaying(true);
        setAdAlreadyShown(true);
        const skipTimer = adData?.already_viewed_today ? 0 : 5;
        setAdCountdown(skipTimer);

        // Limpiar cualquier timer existente antes de crear uno nuevo
        if (adTimerRef.current) {
            clearInterval(adTimerRef.current);
        }

        adTimerRef.current = setInterval(() => {
            setAdCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(adTimerRef.current);
                    adTimerRef.current = null;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleSkipAd = () => {
        if (adCountdown > 0) return;

        // Si ya recibió recompensa hoy, puede saltar sin confirmar
        if (adData?.already_viewed_today) {
            resumeMainVideo('skipped');
            return;
        }

        // Si es la primera vez hoy, advertirle que perderá la recompensa
        setShowSkipConfirm(true);
    };

    const handleConfirmSkip = () => {
        setShowSkipConfirm(false);
        resumeMainVideo('skipped');
    };

    const handleCancelSkip = () => {
        setShowSkipConfirm(false);
    };

    const handleAdEnded = () => {
        // El anuncio de video terminó completo — mostrar modal de éxito (que se cerrará solo por el useEffect)
        setAdEarnedCoupon(true);
    };

    const handleClaimCoupon = async () => {
        if (!adData || isClaiming) return;
        setIsClaiming(true);
        try {
            await claimCoupon(adData.id);
            setCouponClaimed(true);
        } catch (e) {
            console.error('[SmartVideoPlayer] Error reclamando cupón:', e);
            // Mostrar error pero permitir continuar de todos modos
        } finally {
            setIsClaiming(false);
        }
    };

    const resumeMainVideo = async (statusOverride = 'completed') => {
        setIsAdPlaying(false);
        setAdEarnedCoupon(false);
        setCouponClaimed(false);
        setAdCountdown(0);

        // Limpiar el timer del anuncio
        if (adTimerRef.current) {
            clearInterval(adTimerRef.current);
            adTimerRef.current = null;
        }

        if (videoRef.current) {
            videoRef.current.play().catch(err => {
                console.warn('[SmartVideoPlayer] Error al reanudar video:', err);
            });
        }

        // Confirmar vista del anuncio
        try {
            await confirmAdView({
                adId: adData.id,
                postId: postId,
                viewSeconds: statusOverride === 'skipped' ? 5 : (adData.media_type === 'video' ? 30 : 5),
                proofToken: adSessionToken,
                status: statusOverride,
                context,
                creatorId
            });
        } catch (e) {
            console.error('[SmartVideoPlayer] Error confirming ad view:', e);
        }
    };

    // Caso de éxito: El anuncio termina solo (si fuera video-ad de larga duración) o se ve completo
    // Pero aquí el skip es la única salida por ahora o que termine el asset.

    // ── Autoplay Logic ───────────────────────────────────────────────
    const attemptPlay = async (video) => {
        if (!video) return;
        try {
            await video.play();
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                console.warn('[SmartVideoPlayer] Autoplay bloqueado con sonido, reintentando muted');
                video.muted = true;
                setIsMuted(true);
                video.play().catch(e => console.error('[SmartVideoPlayer] Error crítico en autoplay:', e));
            }
        }
    };

    useEffect(() => {
        // Para modo RAW MP4, intentamos play cuando el ref esté listo
        if (isRaw && videoRef.current && r2Url) {
            attemptPlay(videoRef.current);
        }
    }, [isRaw, r2Url]);

    // ── Cleanup on unmount or video change ───────────────────────────────
    useEffect(() => {
        return () => {
            // Limpiar timer del anuncio si el componente se desmonta
            if (adTimerRef.current) {
                clearInterval(adTimerRef.current);
                adTimerRef.current = null;
            }
        };
    }, []);

    // ── Reset ad state when video data changes ─────────────────────────
    useEffect(() => {
        console.log(`[SmartVideoPlayer] Resetting ad state for new video: ${postId}`);
        // Resetear estados del anuncio cuando cambia el video
        setIsAdPlaying(false);
        setAdAlreadyShown(false);
        setAdCountdown(0);
        setAdTriggerTime(null);
        setAdEarnedCoupon(false);
        setCouponClaimed(false);
        setViewSent(false);
        setAdData(null); // Resetear datos del anuncio
        setAdSessionToken(null); // Resetear token del anuncio
        accumulatedSecondsRef.current = 0;
        lastTimeRef.current = 0;

        // Limpiar timer existente
        if (adTimerRef.current) {
            clearInterval(adTimerRef.current);
            adTimerRef.current = null;
        }
    }, [videoData.r2Url, videoData.playbackId, videoData.hlsR2Url, postId]);

    // ── Fullscreen detector ──────────────────────────────────────────
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

    const handlePlay = () => { setIsPlaying(true); if (onPlay) onPlay(); };
    const handlePause = () => setIsPlaying(false);
    const handleSeeked = () => {
        if (videoRef.current) lastTimeRef.current = videoRef.current.currentTime;
    };

    const handleLoadedMetadata = () => {
        const video = videoRef.current;
        if (video) {
            const dur = video.duration;
            setDuration(dur);
            const aspectRatio = video.videoHeight / video.videoWidth;
            setIsVertical(aspectRatio > 1);

            // Calcular tiempo aleatorio para el anuncio (entre el 20% y 70% del video)
            if (dur > 10) {
                const randomTime = (Math.random() * (0.7 - 0.2) + 0.2) * dur;
                setAdTriggerTime(randomTime);
            } else {
                setAdTriggerTime(dur * 0.5); // Fallback al medio
            }
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    };

    const handleSeek = (time) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const handleVolumeChange = (vol) => {
        if (videoRef.current) {
            videoRef.current.volume = vol;
            setVolume(vol);
            setIsMuted(vol === 0);
        }
    };

    const handleMuteToggle = () => {
        if (videoRef.current) {
            const newMuted = !isMuted;
            videoRef.current.muted = newMuted;
            setIsMuted(newMuted);
        }
    };

    const handlePlaybackRateChange = (rate) => {
        if (videoRef.current) {
            videoRef.current.playbackRate = rate;
            setPlaybackRate(rate);
        }
    };

    const handleFullscreen = () => {
        const container = videoRef.current?.parentElement;

        if (isFullscreen) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        } else {
            if (container?.requestFullscreen) {
                container.requestFullscreen();
            } else if (container?.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            } else if (container?.mozRequestFullScreen) {
                container.mozRequestFullScreen();
            } else if (container?.msRequestFullscreen) {
                container.msRequestFullscreen();
            }
        }
    };

    const handlePlayPause = () => {
        const video = videoRef.current;
        if (!video) return;

        if (isPlaying) {
            video.pause();
        } else {
            video.play();
        }
    };

    const handleVideoClick = (e) => {
        if (e.target.closest('[class*="controlButton"]')) return;
        if (e.target.closest('[class*="progressBar"]')) return;
        if (e.target.closest('[class*="volumeSlider"]')) return;
        if (e.target.closest('[class*="speedMenu"]')) return;
        if (e.target.closest('[class*="controlsContainer"]')) return;
        handlePlayPause();
    };

    return (
        <div
            className={`${styles.videoContainer} ${isVertical ? styles.verticalVideo : ''} ${videoMode === 'theater' ? styles.theater : ''}`}
            style={{ pointerEvents: isDetail ? 'auto' : 'none' }}
            onClick={isDetail ? handleVideoClick : undefined}
        >
            {/* Indicador de Fallback (si HLS falló) */}
            {useHlsFallback && (
                <div className={styles.statusBadge} style={{ background: 'rgba(224, 36, 94, 0.2)', border: '1px solid #e0245e' }}>
                    <span style={{ color: '#e0245e' }}>⚠️ Fallback MP4</span>
                </div>
            )}

            {/* Banner de estado (solo en desarrollo y si no hay fallback) */}
            {process.env.NODE_ENV === 'development' && !useHlsFallback && (
                <div className={styles.statusBadge}>
                    Estado: <strong>{status}</strong>
                </div>
            )}

            {/* Modo RAW/processing/repatriating: MP4 directo desde R2 */}
            {(isRaw || useHlsFallback) && r2Url && (
                <video
                    ref={videoRef}
                    className={styles.videoElement}
                    src={r2Url}
                    controls={false}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onSeeked={handleSeeked}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onVolumeChange={() => setVolume(videoRef.current.volume)}
                    controlsList="nodownload noplaybackrate"
                />
            )}

            {/* Modo HLS (R2-native o legacy Livepeer): usa hls.js */}
            {!isRaw && !useHlsFallback && (
                <video
                    ref={videoRef}
                    className={styles.videoElement}
                    controls={false}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onSeeked={handleSeeked}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onVolumeChange={() => setVolume(videoRef.current.volume)}
                    controlsList="nodownload noplaybackrate"
                    crossOrigin="anonymous"
                />
            )}

            {/* Controles personalizados */}
            {isDetail && (
                <CustomVideoControls
                    videoRef={videoRef}
                    isPlaying={isPlaying}
                    isMuted={isMuted}
                    volume={volume}
                    currentTime={currentTime}
                    duration={duration}
                    playbackRate={playbackRate}
                    onPlayPause={handlePlayPause}
                    onSeek={handleSeek}
                    onVolumeChange={handleVolumeChange}
                    onMuteToggle={handleMuteToggle}
                    onPlaybackRateChange={handlePlaybackRateChange}
                    onFullscreen={handleFullscreen}
                    isFullscreen={isFullscreen}
                    videoMode={videoMode}
                />
            )}

            {/* Overlay de Anuncio Mid-roll (Rediseño YouTube) */}
            {isAdPlaying && adData && (
                <div className={styles.adOverlay}>
                    {adEarnedCoupon ? (
                        <div className={styles.couponModalBox}>
                            <h2 className={styles.rewardTitle}>RECOMPENSA RECIBIDA</h2>
                            <p className={styles.rewardSubtitle}>Has ganado MXNe por tu atención.</p>

                            {adData.promo_text && (
                                <div className={styles.promoContainer}>
                                    <p className={styles.promoLabel}>Beneficio Exclusivo:</p>
                                    <p className={styles.promoText}>{adData.promo_text}</p>
                                    {(couponClaimed || adData.has_claimed_coupon) && adData.promo_code && (
                                        <div className={styles.codeWrapper}>
                                            <p className={styles.codeLabel}>Código Promocional:</p>
                                            <div className={styles.codeBox}>{adData.promo_code}</div>
                                            <p className={styles.codeSuccess}>✓ Guardado en tu Billetera de Cupones</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!(couponClaimed || adData.has_claimed_coupon) ? (
                                <button className={styles.claimBtn} onClick={handleClaimCoupon} disabled={isClaiming}>
                                    {isClaiming ? 'Guardando...' : 'Reclamar y Continuar Video'}
                                </button>
                            ) : (
                                <button className={styles.resumeBtn} onClick={() => resumeMainVideo('completed')}>
                                    Reanudar Video
                                </button>
                            )}

                            {!(couponClaimed || adData.has_claimed_coupon) && (
                                <button className={styles.simpleContinueBtn} onClick={() => resumeMainVideo('completed')}>
                                    Continuar sin guardar cupón
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className={styles.adFullscreenContent}>
                            {/* Header Status */}
                            <div className={styles.adTopBar}>
                                <div className={styles.adIndicator}>
                                    Publicidad {adData.promo_text ? '| CUPÓN' : ''}
                                </div>
                                {adData.already_viewed_today && (
                                    <div className={styles.alreadyRewardedBadge}>
                                        <span>✓</span> RECOMPENSA RECIBIDA HOY
                                    </div>
                                )}
                            </div>

                            {/* Main Media */}
                            <div className={styles.adMediaWrapper}>
                                {(adData.media_type?.includes('video') || adData.media_url?.match(/\.(mp4|webm|mov|ogg)$/i)) ? (
                                    <video src={adData.media_url} autoPlay muted className={styles.adVideoFull} onEnded={handleAdEnded} />
                                ) : (
                                    <img src={adData.media_url} alt="Ad" className={styles.adImageFull} />
                                )}
                            </div>

                            {/* Bottom Info & Skip button */}
                            <div className={styles.adBottomBar}>
                                <div className={styles.adBrandInfo}>
                                    <h3 className={styles.adBrandTitle}>{adData.title}</h3>
                                    <p className={styles.adBrandDesc}>{adData.description}</p>
                                    {adData.promo_text && (
                                        <div className={styles.adPromoCallout}>
                                            <span className={styles.promoTextSmall}>Beneficio: Recompensa + Cupón</span>
                                        </div>
                                    )}
                                </div>

                                <div className={styles.adActions}>
                                    {(!adData.media_type || adData.media_type === 'banner') && adCountdown === 0 && adData.promo_text ? (
                                        <button className={styles.ytSkipBtn} onClick={handleAdEnded} style={{ background: 'var(--color-primary)', color: '#000' }}>
                                            Reclamar Cupón
                                        </button>
                                    ) : (
                                        <button
                                            className={styles.ytSkipBtn}
                                            onClick={handleSkipAd}
                                        >
                                            {adCountdown > 0 ? (
                                                <span className={styles.skipWait}>Saltar en {adCountdown}s</span>
                                            ) : (
                                                <span className={styles.skipReady}>Saltar Anuncio</span>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Confirmation Modal */}
                            {showSkipConfirm && (
                                <div className={styles.confirmOverlay}>
                                    <div className={styles.confirmBox}>
                                        <h3>¿Quieres saltar el anuncio?</h3>
                                        <p>Si lo haces ahora, <strong>perderás tu recompensa en MXNe</strong> por ver este contenido.</p>
                                        <div className={styles.confirmButtons}>
                                            <button className={styles.cancelSkipBtn} onClick={handleCancelSkip}>Seguir viendo</button>
                                            <button className={styles.confirmSkipBtn} onClick={handleConfirmSkip}>Saltar de todos modos</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default SmartVideoPlayer;
