import { useState, useEffect, useRef } from 'react';
import { useQuests } from '../../hooks/useQuests';
import styles from '../SmartVideoPlayer/SmartVideoPlayer.module.css';

// Componente para reproducir videos raw (mp4, webm) subidos directamente, con lógica de heartbeats antiscrubbing
export function StandardVideoPlayer({ src, onPlay, isDetail = true, className }) {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const { pingHeartbeat } = useQuests();
    const lastTimeRef = useRef(0);
    const accumulatedSecondsRef = useRef(0);

    // Bucle de validación cada segundo
    useEffect(() => {
        let interval;

        if (isPlaying) {
            interval = setInterval(() => {
                const video = videoRef.current;
                if (!video) return;

                if (video.playbackRate !== 1) {
                    return; // No cuenta si lo aceleran
                }

                // Antiscrubbing:
                const currentTime = video.currentTime;
                const timeDiff = Math.abs(currentTime - lastTimeRef.current);

                if (timeDiff > 2) {
                    lastTimeRef.current = currentTime;
                    return;
                }

                accumulatedSecondsRef.current += 1;
                lastTimeRef.current = currentTime;

                // Cuando acumulamos 10s, mandamos ping
                if (accumulatedSecondsRef.current >= 10) {
                    pingHeartbeat(10);
                    accumulatedSecondsRef.current = 0;
                }
            }, 1000);
        }

        return () => clearInterval(interval);
    }, [isPlaying, pingHeartbeat]);

    const handlePlay = () => {
        setIsPlaying(true);
        if (onPlay) onPlay();
    };

    const handlePause = () => setIsPlaying(false);

    const handleSeeked = () => {
        if (videoRef.current) {
            lastTimeRef.current = videoRef.current.currentTime;
        }
    };

    return (
        <video
            ref={videoRef}
            src={src}
            className={className || styles.videoElement}
            controls={isDetail}
            preload={isDetail ? 'auto' : 'metadata'}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeeked={handleSeeked}
            controlsList="nodownload noplaybackrate"
        />
    );
}

export default StandardVideoPlayer;
