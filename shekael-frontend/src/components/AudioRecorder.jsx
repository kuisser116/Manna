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
  const maxSamples = 500;

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
      if (audioCtxRef.current?.state !== 'closed') audioCtxRef.current?.close();
    };
  }, []);

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
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

      // Sample audio level
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += Math.abs(dataArray[i] - 128);
      let avg = sum / dataArray.length / 128 * 3.5;
      avg = Math.pow(Math.min(avg, 1), 0.75);

      // Throttle samples
      const now = Date.now();
      if (now - lastSampleRef.current > 40) {
        lastSampleRef.current = now;
        waveHistoryRef.current.push(avg);
        if (waveHistoryRef.current.length > maxSamples) waveHistoryRef.current.shift();
      }

      // Limpiar canvas — sin fondo extra
      ctx.clearRect(0, 0, width, height);

      const raw = waveHistoryRef.current;
      if (raw.length < 2) {
        // Linea central silenciosa
        ctx.strokeStyle = 'rgba(225,29,72,0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, height/2);
        ctx.lineTo(width, height/2);
        ctx.stroke();
        if (runningRef.current) animFrameRef.current = requestAnimationFrame(drawWaveform);
        return;
      }

      // Barras verticales tipo WhatsApp
      const barWidth = 3;
      const gap = 2;
      const step = barWidth + gap;
      const centerY = height / 2;
      const maxH = height * 0.8;

      // De derecha a izquierda: la muestra más nueva (última del array) va a la derecha
      for (let i = 0; i < raw.length; i++) {
        const x = width - (raw.length - i) * step;
        if (x + barWidth < 0) continue;
        if (x > width) break;
        const barH = Math.max(raw[i] * maxH, 1.5);
        const y = centerY - barH / 2;
        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 1.5);
        ctx.fill();
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
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
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
      pausedRef.current = true; runningRef.current = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setState('paused');
    } else if (state === 'paused') {
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(streamRef.current, { mimeType: mime });
      recorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start();
      if (audioCtxRef.current) audioCtxRef.current.resume();
      pausedRef.current = false; setState('recording');
      runningRef.current = true; drawWaveform();
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
      // Usar duración corregida por el servidor (ffprobe) si está disponible,
      // porque Chrome escribe metadata incorrecta en WebM
      const realDuration = data.duration || Math.round(duration);
      onSend?.({ url: data.url, fileName: data.name, fileSize: data.size, mimeType: data.mime, duration: realDuration });
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 9"/></svg>
        </button>
      </div>
    </div>
  );
}
