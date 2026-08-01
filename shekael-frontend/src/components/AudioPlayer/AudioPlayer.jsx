import { useState, useRef, useEffect } from 'react';
import styles from './AudioPlayer.module.css';

const CYCLE_SPEEDS = [1, 2, 4];
const TICK_MS = 200;

export default function AudioPlayer({ src, mimeType, initialDuration, onComplete, isActive, onActivate }) {
  const audioRef = useRef(null);
  const playerRef = useRef(null);
  const timerRef = useRef(null);
  const posRef = useRef(0);       // posición actual en la escala DISPLAY (float segundos)
  const totalRef = useRef(initialDuration || 0); // duración DISPLAY
  const speedRef = useRef(1);
  const lastTickRef = useRef(0);   // timestamp del último tick para calcular delta real

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [ready, setReady] = useState(false);
  const progressRef = useRef(null);

  // Al montar: cargar audio, obtener duración del metadata
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onMeta = () => {
      const metaDur = audio.duration && isFinite(audio.duration) ? Math.floor(audio.duration) : 0;
      // Usar initialDuration si existe y es > metaDur (metadata mal)
      if (initialDuration && initialDuration > 0 && (metaDur === 0 || initialDuration > metaDur)) {
        totalRef.current = initialDuration;
        setDuration(initialDuration);
      } else if (metaDur > 0) {
        totalRef.current = metaDur;
        setDuration(metaDur);
      } else {
        totalRef.current = initialDuration || 0;
        setDuration(initialDuration || 0);
      }
      setReady(true);
    };

    const onEnd = () => {
      // El audio llegó al final de su metadata.
      // NO hacemos nada: el timer sigue corriendo hasta totalRef.current
    };

    if (audio.readyState >= 1) onMeta();
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);

    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
      stopTimer();
      audio.pause();
    };
  }, [initialDuration]);

  // Pausar si ya no está activo
  useEffect(() => {
    if (!isActive && playing) {
      audioRef.current?.pause();
      stopTimer();
      setPlaying(false);
    }
  }, [isActive]);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    lastTickRef.current = performance.now();
    timerRef.current = setInterval(() => {
      const now = performance.now();
      const deltaMs = now - lastTickRef.current;
      lastTickRef.current = now;
      // Avanzar posición según tiempo real transcurrido × velocidad
      posRef.current += (deltaMs / 1000) * speedRef.current;

      if (posRef.current >= totalRef.current) {
        // Llegó al final de la duración DISPLAY
        posRef.current = totalRef.current;
        setCurrent(totalRef.current);
        stopTimer();
        setPlaying(false);
        onComplete?.();
        return;
      }

      setCurrent(Math.floor(posRef.current));
    }, TICK_MS);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      stopTimer();
      setPlaying(false);
    } else {
      onActivate?.();
      // Si llegó al final, reiniciar
      if (posRef.current >= totalRef.current - 0.3) {
        posRef.current = 0;
        setCurrent(0);
        audio.currentTime = 0;
      }
      audio.playbackRate = speedRef.current;
      audio.play().then(() => {
        setPlaying(true);
        startTimer();
      }).catch(() => {});
    }
  };

  const cycleSpeed = () => {
    const idx = CYCLE_SPEEDS.indexOf(speedRef.current);
    const next = CYCLE_SPEEDS[(idx + 1) % CYCLE_SPEEDS.length];
    speedRef.current = next;
    setSpeed(next);
    if (audioRef.current && playing) audioRef.current.playbackRate = next;
  };

  // En lugar de usar setSpeed común, sincronizamos speedRef
  const [speed, setSpeed] = useState(1);

  const seek = (e) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetDisplay = pct * totalRef.current;
    posRef.current = targetDisplay;
    setCurrent(Math.floor(targetDisplay));

    // Mapear a tiempo real del archivo de audio
    const audio = audioRef.current;
    if (audio) {
      const audioDur = audio.duration && isFinite(audio.duration) ? audio.duration : 0;
      const total = totalRef.current;
      let realTarget;
      if (audioDur > 0 && total > 0 && audioDur < total) {
        // Metadata mal: escalar
        realTarget = (targetDisplay / total) * audioDur;
      } else {
        realTarget = targetDisplay;
      }
      // Dejar margen de seguridad para no disparar ended
      const maxSafe = Math.max(0, (audioDur || total) - 0.3);
      audio.currentTime = Math.min(realTarget, maxSafe);
    }

    // Si estaba en pausa y había llegado al final, no hace falta más
    // Si está sonando, el timer sigue desde la nueva posición
    if (playing) {
      lastTickRef.current = performance.now();
    }
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className={styles.player} ref={playerRef}>
      <audio ref={audioRef} preload="auto">
        <source src={src} type={mimeType || 'audio/webm;codecs=opus'} />
      </audio>

      <div className={styles.controls}>
        <button className={`${styles.playBtn} ${playing ? styles.playing : ''}`} onClick={togglePlay} title={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          )}
        </button>

        <button className={styles.speedBtn} onClick={cycleSpeed} title="Velocidad">
          <span className={styles.speedLabel}>{speed}x</span>
        </button>

        <div className={styles.progressWrap} ref={progressRef} onClick={seek}>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.handle} style={{ left: `${progress}%` }} />
        </div>

        <span className={styles.time}>{ready ? fmt(current) : '0:00'} / {fmt(duration)}</span>
      </div>
    </div>
  );
}
