import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Hls from 'hls.js';
import { useQuests } from '../../hooks/useQuests';
import useStore from '../../store';
import CustomVideoControls from '../CustomVideoControls/CustomVideoControls';
import styles from './SmartVideoPlayer.module.css';

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
export function SmartVideoPlayer({ videoData = {}, onPlay, onViewValid, isDetail = true, postId, creatorId = null }) {
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
    const [controlsSignal, setControlsSignal] = useState(0);
    const { pingHeartbeat } = useQuests();
    const lastTimeRef = useRef(0);
    const accumulatedSecondsRef = useRef(0);
    const [viewSent, setViewSent] = useState(false);

    const { status = 'raw', r2Url, playbackId, hlsR2Url } = videoData;

    const isProcessing = status === 'processing' || status === 'repatriating';
    const isR2HLS = status === 'r2-hls';
    const isLegacyHLS = status === 'hls';
    const isRaw = !isR2HLS && !isLegacyHLS;
    const useHlsFallback = isR2HLS && hlsError && r2Url;

    // ── Resolver fuente HLS ──────────────────────────────────────────
    useEffect(() => {
        if (isR2HLS && hlsR2Url) {
            setHlsSrc(hlsR2Url);
            return;
        }

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
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    attemptPlay(video);
                });
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        console.error('[SmartVideoPlayer] HLS fatal error:', data);
                        setHlsError(true);
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = hlsSrc;
                video.addEventListener('loadedmetadata', () => {
                    attemptPlay(video);
                });
            }
        }

        return () => {
            if (hls) {
                hls.destroy();
            }
        };
    }, [hlsSrc, isRaw]);

    // ── Segundos acumulados + Heartbeat ──────────────────────────────
    useEffect(() => {
        if (!isPlaying || isProcessing) return;

        const interval = setInterval(() => {
            const video = videoRef.current;
            if (!video) return;
            const currentTimeNow = video.currentTime;
            const diff = currentTimeNow - lastTimeRef.current;

            if (diff < 0 || diff > 3) {
                lastTimeRef.current = currentTimeNow;
                return;
            }

            accumulatedSecondsRef.current += 1;
            lastTimeRef.current = currentTimeNow;

            if (!viewSent && onViewValid) {
                const minRequired = duration > 0 ? Math.min(30, Math.max(10, duration * 0.5)) : 10;
                if (accumulatedSecondsRef.current >= minRequired) {
                    onViewValid(accumulatedSecondsRef.current, duration);
                    setViewSent(true);
                }
            }

            if (accumulatedSecondsRef.current % 10 === 0 && accumulatedSecondsRef.current > 0) {
                pingHeartbeat(10, postId);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isPlaying, pingHeartbeat]);

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
        if (isRaw && videoRef.current && r2Url) {
            attemptPlay(videoRef.current);
        }
    }, [isRaw, r2Url]);

    // ── Reset when video data changes ────────────────────────────────
    useEffect(() => {
        setViewSent(false);
        accumulatedSecondsRef.current = 0;
        lastTimeRef.current = 0;
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
        // Mostrar la barra de controles al tocar/hacer clic (importante en móvil,
        // donde no hay mousemove para reactivarla tras los 3s de auto-ocultar)
        setControlsSignal(s => s + 1);
        handlePlayPause();
    };

    return (
        <div
            className={`${styles.videoContainer} ${isVertical ? styles.verticalVideo : ''} ${videoMode === 'theater' ? styles.theater : ''}`}
            style={{ pointerEvents: isDetail ? 'auto' : 'none' }}
            onClick={isDetail ? handleVideoClick : undefined}
            onTouchEnd={isDetail ? (e) => {
                // Mostrar controles en cualquier toque (móvil: no hay mousemove)
                if (e.target.closest('[class*="controlButton"]')) return;
                if (e.target.closest('[class*="progressBar"]')) return;
                setControlsSignal(s => s + 1);
            } : undefined}
        >
            {useHlsFallback && (
                <div className={styles.statusBadge} style={{ background: 'rgba(224, 36, 94, 0.2)', border: '1px solid #e0245e' }}>
                    <span style={{ color: '#e0245e' }}>Fallback MP4</span>
                </div>
            )}

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
                    showSignal={controlsSignal}
                />
            )}
        </div>
    );
}

export default SmartVideoPlayer;
