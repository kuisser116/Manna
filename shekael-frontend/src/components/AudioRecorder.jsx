import { useState, useRef, useEffect } from 'react';
import { uploadChatFile } from '../api/chats.api';
import styles from './AudioRecorder.module.css';

export default function AudioRecorder({ onSend, onClose }) {
  const [state, setState] = useState('starting');
  const [duration, setDuration] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const waveHistoryRef = useRef([]);
  const runningRef = useRef(false);
  const lastSampleRef = useRef(0);
  const pausedRef = useRef(false);
  const maxSamples = 200;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;
    const size = () => {
      const w = canvas.parentElement.clientWidth;
      const h = canvas.parentElement.clientHeight;
      if (w > 0 && h > 0) { canvas.width = w; canvas.height = h; }
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    startRecording();
    return () => {
      runningRef.current = false;
      stopTracks();
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  // 5-point moving average
  const smoothData = (arr) => {
    const n = arr.length;
    if (n < 5) return arr;
    const out = new Array(n);
    out[0] = arr[0];
    out[1] = (arr[0] + arr[1] + arr[2]) / 3;
    for (let i = 2; i < n - 2; i++) {
      out[i] = (arr[i-2] + arr[i-1] + arr[i] + arr[i+1] + arr[i+2]) / 5;
    }
    out[n-2] = (arr[n-3] + arr[n-2] + arr[n-1]) / 3;
    out[n-1] = arr[n-1];
    return out;
  };

  // Catmull-Rom to Bezier
  const catmullRomToBezier = (p0, p1, p2, p3) => ({
    cp1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    cp2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
  });

  const drawLineSmooth = (ctx, pts, color, lineW) => {
    if (pts.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length; i++) {
      const p0 = i > 1 ? pts[i-2] : pts[i-1];
      const p1 = pts[i-1];
      const p2 = pts[i];
      const p3 = i < pts.length - 1 ? pts[i+1] : pts[i];
      const { cp1, cp2 } = catmullRomToBezier(p0, p1, p2, p3);
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
    }
    ctx.stroke();
  };

  const drawWaveform = () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas || !analyserRef.current || !canvas.width || !canvas.height) {
        if (runningRef.current) animFrameRef.current = requestAnimationFrame(drawWaveform);
        return;
      }

      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;

      // Read audio time-domain data
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteTimeDomainData(dataArray);

      // Average deviation from silence (128)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += Math.abs(dataArray[i] - 128);
      }
      let avg = sum / dataArray.length / 128; // 0..1

      // Amplify! Quiet speech is ~0.05, we want it at ~0.3-0.5
      avg = Math.min(avg * 4.0, 1.0);
      // Apply a gentle power curve for natural feel
      avg = Math.pow(avg, 0.7);

      // Throttled history — 120ms between samples
      const now = Date.now();
      if (now - lastSampleRef.current > 120) {
        lastSampleRef.current = now;
        waveHistoryRef.current.push(avg);
        if (waveHistoryRef.current.length > maxSamples) waveHistoryRef.current.shift();
      }

      const raw = waveHistoryRef.current;
      const history = smoothData(raw);
      const hLen = history.length;
      const centerY = height / 2;
      const maxH = height * 0.88;

      // Dark background
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, width, height);

      // Ultra-faint center guide
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      if (hLen >= 2) {
        // Build points — NEWEST on RIGHT
        const ptsTop = [];
        const ptsBot = [];
        for (let i = 0; i < hLen; i++) {
          const age = hLen - 1 - i;
          const x = width - (age * width) / maxSamples;
          const dev = Math.min(history[i] * maxH, maxH / 2);
          ptsTop.push({ x, y: centerY - dev });
          ptsBot.push({ x, y: centerY + dev });
        }

        // Main red line (top envelope)
        drawLineSmooth(ctx, ptsTop, '#e11d48', 3);

        // Subtle mirror (bottom envelope)
        drawLineSmooth(ctx, ptsBot, 'rgba(190, 18, 60, 0.3)', 1.5);

      } else {
        ctx.strokeStyle = 'rgba(225,29,72,0.15)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
      }

      if (runningRef.current) {
        animFrameRef.current = requestAnimationFrame(drawWaveform);
      }
    } catch (e) {
      if (runningRef.current) animFrameRef.current = requestAnimationFrame(drawWaveform);
    }
  };

  const startRecording = async () => {
    try {
      // Disable audio processing for raw input
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      streamRef.current = s;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(s, { mimeType: mime });
      recorderRef.current = mr;
      chunksRef.current = [];
      waveHistoryRef.current = [];

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(s);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start();

      setState('recording');
      setDuration(0);
      runningRef.current = true;
      drawWaveform();
      timerRef.current = setInterval(() => {
        if (!pausedRef.current) setDuration(d => d + 1);
      }, 1000);
    } catch (e) {
      console.warn('Audio error:', e);
      alert('No se pudo acceder al microfono.');
      onClose?.();
    }
  };

  const togglePause = () => {
    if (!recorderRef.current) return;
    if (state === 'recording') {
      recorderRef.current.stop();
      if (audioCtxRef.current) audioCtxRef.current.suspend();
      if (timerRef.current) clearInterval(timerRef.current);
      pausedRef.current = true;
      runningRef.current = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setState('paused');
    } else if (state === 'paused') {
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(streamRef.current, { mimeType: mime });
      recorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start();
      if (audioCtxRef.current) audioCtxRef.current.resume();
      pausedRef.current = false;
      setState('recording');
      runningRef.current = true;
      drawWaveform();
      timerRef.current = setInterval(() => {
        if (!pausedRef.current) setDuration(d => d + 1);
      }, 1000);
    }
  };

  const handleSend = async () => {
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      runningRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      stopTracks();
      if (audioCtxRef.current) audioCtxRef.current.close();
      await new Promise(r => setTimeout(r, 50));
      if (chunksRef.current.length === 0) { alert('No se grabo audio.'); onClose?.(); return; }
      setState('sending');
      const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
      const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm;codecs=opus' });
      const { data } = await uploadChatFile(file);
      onSend?.({ url: data.url, fileName: data.name, fileSize: data.size, mimeType: data.mime, duration: Math.round(duration) });
      onClose?.();
    } catch (e) { console.warn('Audio send err:', e); alert('Error: ' + (e.message || e)); setState('recording'); }
  };

  const handleCancel = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    runningRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    stopTracks();
    if (audioCtxRef.current) audioCtxRef.current.close();
    onClose?.();
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (state === 'sending') {
    return (
      <div className={styles.inlineBar}>
        <div className={styles.statusRow}><span className={styles.spinner}></span> Enviando audio...</div>
      </div>
    );
  }

  return (
    <div className={styles.inlineBar}>
      <div className={styles.audioRow}>
        <button className={styles.cancelBtn} onClick={handleCancel} title="Cancelar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div className={styles.waveWrap}>
          <canvas ref={canvasRef} className={styles.waveform} />
        </div>

        <span className={styles.timer}>{fmt(duration)}</span>

        {state === 'recording' && (
          <button className={styles.pauseBtn} onClick={togglePause} title="Pausar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          </button>
        )}
        {state === 'paused' && (
          <button className={styles.pauseBtn} onClick={togglePause} title="Reanudar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
        )}

        <button className={styles.sendBtn} onClick={handleSend} title="Enviar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );
}
