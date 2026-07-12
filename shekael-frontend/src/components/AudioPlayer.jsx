import { useState, useRef, useEffect } from 'react';
import styles from './AudioPlayer.module.css';

const SPEEDS = [1, 1.5, 2, 3, 4];

export default function AudioPlayer({ src, mimeType, initialDuration }) {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [loaded, setLoaded] = useState(false);
  const [speed, setSpeed] = useState(1);
  const progressRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      setDuration(Math.floor(audio.duration));
      setLoaded(true);
    };
    const onTime = () => setCurrent(Math.floor(audio.currentTime));
    const onEnd = () => { setPlaying(false); setCurrent(0); };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      audio.pause();
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Setup AnalyserNode when playing
  const setupAnalyser = () => {
    const audio = audioRef.current;
    if (!audio || audioCtxRef.current) return;

    try {
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = actx;
      const source = actx.createMediaElementSource(audio);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyser.connect(actx.destination);
      analyserRef.current = analyser;
      drawMiniWave();
    } catch (e) {
      // Fallback: no analyser
    }
  };

  const drawMiniWave = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, w, h);

    // Dark bg
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, w, h);

    const barCount = dataArray.length;
    const barW = (w - 4) / barCount;
    const halfH = h / 2;

    for (let i = 0; i < barCount; i++) {
      const val = dataArray[i] / 256; // 0..1
      const barH = Math.max(1, val * halfH * 0.8);
      const x = 2 + i * barW;

      // Gradient bar
      const grd = ctx.createLinearGradient(0, halfH - barH, 0, halfH + barH);
      grd.addColorStop(0, '#e11d48');
      grd.addColorStop(0.5, '#be123c');
      grd.addColorStop(1, '#b91c1c');
      ctx.fillStyle = grd;

      // Rounded rect
      const r = Math.min(barW / 2, 2);
      ctx.beginPath();
      ctx.roundRect(x, halfH - barH, barW, barH * 2, r);
      // fallback for roundRect
      ctx.fill();
    }

    animRef.current = requestAnimationFrame(drawMiniWave);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    } else {
      if (!audioCtxRef.current) setupAnalyser();
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
      audio.playbackRate = speed;
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const changeSpeed = (s) => {
    setSpeed(s);
    if (audioRef.current && playing) {
      audioRef.current.playbackRate = s;
    }
  };

  const seek = (e) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
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

      <div className={styles.controls}>
        <button className={`${styles.playBtn} ${playing ? styles.playing : ''}`} onClick={togglePlay} title={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          )}
        </button>

        <canvas ref={canvasRef} className={styles.miniWave} width="80" height="32" />

        <div className={styles.progressWrap} ref={progressRef} onClick={seek}>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <span className={styles.time}>{loaded ? fmt(current) : '0:00'} / {fmt(duration)}</span>

        <div className={styles.speedWrap}>
          {SPEEDS.map(s => (
            <button
              key={s}
              className={`${styles.speedBtn} ${speed === s ? styles.speedActive : ''}`}
              onClick={() => changeSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
