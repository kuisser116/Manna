import { useState, useRef, useEffect } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import styles from './AudioPlayer.module.css';

gsap.registerPlugin(useGSAP);

const SPEEDS = [1, 1.5, 2, 3, 4];

export default function AudioPlayer({ src, mimeType, initialDuration }) {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const speedWrapRef = useRef(null);
  const playerRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [loaded, setLoaded] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showSpeed, setShowSpeed] = useState(false);
  const progressRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Animate speed controls in/out
  useGSAP(() => {
    if (showSpeed && speedWrapRef.current) {
      gsap.fromTo(speedWrapRef.current,
        { opacity: 0, y: 6, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: 'power2.out' }
      );
    }
  }, { dependencies: [showSpeed], scope: playerRef });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      setDuration(Math.floor(audio.duration));
      setLoaded(true);
    };
    const onTime = () => setCurrent(Math.floor(audio.currentTime));
    const onEnd = () => { setPlaying(false); setCurrent(0); setShowSpeed(false); };

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
    } catch (e) { /* fallback */ }
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

    // Dark bg with rounded corners
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 3);
    ctx.fill();

    const barCount = dataArray.length;
    const barW = Math.max(1, (w - 2) / barCount - 0.5);
    const halfH = h / 2;

    for (let i = 0; i < barCount; i++) {
      const val = dataArray[i] / 256;
      const barH = Math.max(1, val * halfH * 0.8);
      const x = 1 + i * (barW + 0.5);

      ctx.fillStyle = i % 3 === 0 ? '#e11d48' : i % 3 === 1 ? '#be123c' : '#9f1239';
      ctx.fillRect(x, halfH - barH, barW, barH * 2);
    }

    animRef.current = requestAnimationFrame(drawMiniWave);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      setShowSpeed(false);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    } else {
      if (!audioCtxRef.current) setupAnalyser();
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
      audio.playbackRate = speed;
      audio.play().then(() => {
        setPlaying(true);
        setShowSpeed(true);
      }).catch(() => {});
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

        <canvas ref={canvasRef} className={styles.miniWave} width="60" height="26" />

        <div className={styles.progressWrap} ref={progressRef} onClick={seek}>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className={styles.rightCol}>
          <span className={styles.time}>{loaded ? fmt(current) : '0:00'} / {fmt(duration)}</span>

          <div ref={speedWrapRef} className={`${styles.speedWrap} ${showSpeed ? styles.speedVisible : styles.speedHidden}`}>
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
    </div>
  );
}
