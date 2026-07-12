import { useState, useRef, useEffect } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import styles from './AudioPlayer.module.css';

gsap.registerPlugin(useGSAP);

const SPEEDS = [1, 1.5, 2, 3, 4];

export default function AudioPlayer({ src, mimeType, initialDuration, onComplete, isActive, onActivate }) {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const dropdownRef = useRef(null);
  const playerRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [loaded, setLoaded] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showDropdown, setShowDropdown] = useState(false);
  const progressRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  // If we become inactive, pause
  useEffect(() => {
    if (!isActive && playing) {
      audioRef.current?.pause();
      setPlaying(false);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
  }, [isActive]);

  // Dropdown animation
  useGSAP(() => {
    if (showDropdown && dropdownRef.current) {
      gsap.fromTo(dropdownRef.current,
        { opacity: 0, y: -4, scaleY: 0.92 },
        { opacity: 1, y: 0, scaleY: 1, duration: 0.15, ease: 'power2.out', transformOrigin: 'top center' }
      );
    }
  }, { dependencies: [showDropdown], scope: playerRef });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => { setDuration(Math.floor(audio.duration)); setLoaded(true); };
    const onTime = () => setCurrent(Math.floor(audio.currentTime));
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
      onComplete?.();
    };
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
    } catch (e) {}
  };

  const drawMiniWave = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const arr = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(arr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 3);
    ctx.fill();
    const bc = arr.length;
    const bw = Math.max(1, (w - 2) / bc - 0.5);
    const hh = h / 2;
    for (let i = 0; i < bc; i++) {
      const v = arr[i] / 256;
      const bh = Math.max(1, v * hh * 0.8);
      ctx.fillStyle = i % 3 === 0 ? '#e11d48' : i % 3 === 1 ? '#be123c' : '#9f1239';
      ctx.fillRect(1 + i * (bw + 0.5), hh - bh, bw, bh * 2);
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
      onActivate?.();
      if (!audioCtxRef.current) setupAnalyser();
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
      audio.playbackRate = speed;
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const changeSpeed = (s) => {
    setSpeed(s);
    setShowDropdown(false);
    if (audioRef.current && playing) audioRef.current.playbackRate = s;
  };

  const seek = (e) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (audioRef.current) {
      audioRef.current.currentTime = pct * duration;
      setCurrent(Math.floor(pct * duration));
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

        <div className={styles.speedCol}>
          <div className={styles.speedSelect} onClick={() => setShowDropdown(!showDropdown)}>
            <span className={styles.speedLabel}>{speed}x</span>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" className={styles.speedArrow}>
              <polygon points="12 16 6 8 18 8"/>
            </svg>
          </div>

          {showDropdown && (
            <div ref={dropdownRef} className={styles.dropdown}>
              {SPEEDS.map(s => (
                <button
                  key={s}
                  className={`${styles.dropdownItem} ${speed === s ? styles.dropdownActive : ''}`}
                  onClick={() => changeSpeed(s)}
                >
                  <span>{s}x</span>
                  {speed === s && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className={styles.miniWave} width="44" height="22" />

        <div className={styles.progressWrap} ref={progressRef} onClick={seek}>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <span className={styles.time}>{loaded ? fmt(current) : '0:00'} / {fmt(duration)}</span>
      </div>
    </div>
  );
}
