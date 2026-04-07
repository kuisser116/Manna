import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Monitor, Minimize2 } from 'lucide-react';
import useStore from '../../store';
import styles from './CustomVideoControls.module.css';

function CustomVideoControls({
    videoRef,
    isPlaying,
    isMuted,
    volume,
    currentTime,
    duration,
    playbackRate,
    onPlayPause,
    onSeek,
    onVolumeChange,
    onMuteToggle,
    onPlaybackRateChange,
    onFullscreen,
    isFullscreen,
    videoMode,
}) {
    const { setVideoMode } = useStore();
    const [isDragging, setIsDragging] = useState(false);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const [hoverTime, setHoverTime] = useState(0);
    const [controlsVisible, setControlsVisible] = useState(true);

    const progressBarRef = useRef(null);
    const volumeControlRef = useRef(null);
    const speedMenuRef = useRef(null);
    const hideTimeoutRef = useRef(null);

    const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];

    const formatTime = (time) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleProgressClick = (e) => {
        if (!progressBarRef.current || !duration) return;
        e.stopPropagation();

        const rect = progressBarRef.current.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const newTime = Math.max(0, Math.min(percent * duration, duration));
        onSeek(newTime);
    };

    const handleProgressDrag = (e) => {
        if (!isDragging || !progressBarRef.current || !duration) return;

        const rect = progressBarRef.current.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const newTime = Math.max(0, Math.min(percent * duration, duration));
        onSeek(newTime);
    };

    const handleProgressMouseDown = (e) => {
        setIsDragging(true);
        handleProgressClick(e);
    };

    const handleProgressHover = (e) => {
        if (!progressBarRef.current || !duration) return;

        const rect = progressBarRef.current.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const hoverTime = Math.max(0, Math.min(percent * duration, duration));
        setHoverTime(hoverTime);
    };

    const handleVolumeChange = (e) => {
        const newVolume = parseFloat(e.target.value);
        onVolumeChange(newVolume);
    };

    const handleSpeedClick = (rate) => {
        onPlaybackRateChange(rate);
        setShowSpeedMenu(false);
    };

    const showControls = () => {
        setControlsVisible(true);
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
        }
    };

    const hideControls = () => {
        hideTimeoutRef.current = setTimeout(() => {
            setControlsVisible(false);
        }, 3000);
    };

    useEffect(() => {
        if (controlsVisible) {
            hideControls();
        }
    }, [controlsVisible]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (speedMenuRef.current && !speedMenuRef.current.contains(e.target)) {
                setShowSpeedMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const handleGlobalMouseMove = (e) => {
            if (isDragging) {
                handleProgressDrag(e);
            }
        };

        const handleGlobalMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
            }
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleGlobalMouseMove);
            document.addEventListener('mouseup', handleGlobalMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [isDragging]);

    const progressPercent = duration ? (currentTime / duration) * 100 : 0;
    const hoverPercent = duration ? (hoverTime / duration) * 100 : 0;

    const getVolumeIcon = () => {
        if (isMuted || volume === 0) return <VolumeX size={20} />;
        if (volume < 0.5) return <Volume2 size={20} />;
        return <Volume2 size={20} />;
    };

    return (
        <div
            className={`${styles.controlsContainer} ${controlsVisible ? styles.visible : ''}`}
            onMouseMove={() => showControls()}
            onMouseLeave={() => setControlsVisible(false)}
        >
            <div
                ref={progressBarRef}
                className={styles.progressBar}
                onClick={handleProgressClick}
                onMouseDown={handleProgressMouseDown}
                onMouseMove={(e) => {
                    handleProgressHover(e);
                }}
            >
                <div
                    className={styles.progressFill}
                    style={{ width: `${progressPercent}%` }}
                />
                <div
                    className={styles.hoverProgress}
                    style={{ left: `${hoverPercent}%` }}
                />
                <div
                    className={styles.progressThumb}
                    style={{ left: `${progressPercent}%` }}
                />
            </div>

            <div className={styles.controlsRow}>
                <div className={styles.controlsLeft}>
                    <button
                        className={styles.controlButton}
                        onClick={onPlayPause}
                        aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                    >
                        {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                    </button>

                    <div className={styles.volumeControl}>
                        <button
                            className={styles.controlButton}
                            onClick={onMuteToggle}
                            onMouseEnter={() => setShowVolumeSlider(true)}
                            aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
                        >
                            {getVolumeIcon()}
                        </button>
                        <input
                            type="range"
                            className={`${styles.volumeSlider} ${showVolumeSlider ? styles.visible : ''}`}
                            min="0"
                            max="1"
                            step="0.01"
                            value={isMuted ? 0 : volume}
                            onChange={handleVolumeChange}
                            aria-label="Volumen"
                        />
                    </div>

                    <div className={styles.timeDisplay}>
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                </div>

                <div className={styles.controlsRight}>
                    <button
                        className={`${styles.controlButton} ${styles.viewModeButton} ${videoMode === 'default' ? styles.viewModeActive : ''}`}
                        onClick={() => setVideoMode('default')}
                        title="Modo normal"
                        aria-label="Modo normal"
                    >
                        <Minimize2 size={18} />
                    </button>

                    <button
                        className={`${styles.controlButton} ${styles.viewModeButton} ${videoMode === 'theater' ? styles.viewModeActive : ''}`}
                        onClick={() => setVideoMode('theater')}
                        title="Modo teatro"
                        aria-label="Modo teatro"
                    >
                        <Monitor size={18} />
                    </button>

                    <div className={styles.speedControl} ref={speedMenuRef}>
                        <button
                            className={`${styles.controlButton} ${styles.speedButton}`}
                            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                            aria-label="Velocidad"
                        >
                            {playbackRate}x
                        </button>
                        {showSpeedMenu && (
                            <div className={styles.speedMenu}>
                                {playbackRates.map((rate) => (
                                    <button
                                        key={rate}
                                        className={`${styles.speedOption} ${playbackRate === rate ? styles.active : ''}`}
                                        onClick={() => handleSpeedClick(rate)}
                                    >
                                        {rate}x
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        className={styles.controlButton}
                        onClick={onFullscreen}
                        aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                    >
                        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CustomVideoControls;
