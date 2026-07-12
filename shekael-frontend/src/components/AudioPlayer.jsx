import { useState, useRef, useEffect } from 'react';
import styles from './AudioPlayer.module.css';

export default function AudioPlayer({ src, mimeType, initialDuration }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [loaded, setLoaded] = useState(false);
  const progressRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      setDuration(Math.floor(audio.duration));
      setLoaded(true);
    };
    const onTime = () => setCurrent(Math.floor(audio.currentTime));
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      audio.pause();
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const seek = (e) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = (e.clientX - rect.left) / rect.width;
    const time = pct * duration;
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrent(Math.floor(time));
    }
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className={styles.player}>
      <audio ref={audioRef} preload="auto">
        <source src={src} type={mimeType || 'audio/webm;codecs=opus'} />
      </audio>

      <button className={styles.playBtn} onClick={togglePlay} title={playing ? 'Pausar' : 'Reproducir'}>
        {playing ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1"/>
            <rect x="14" y="4" width="4" height="16" rx="1"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        )}
      </button>

      <div className={styles.progressWrap} ref={progressRef} onClick={seek}>
        <div className={styles.track}>
          <div className={styles.fill} style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.handle} style={{ left: `${progress}%` }} />
      </div>

      <span className={styles.time}>{loaded ? fmt(current) : '0:00'} / {fmt(duration)}</span>
    </div>
  );
}
