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
  const maxSamples = 150;

  // Size canvas to container
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

  // Simple 3-point moving average for smooth waveform
  const smoothData = (arr) => {
    if (arr.length < 3) return arr;
    const out = [arr[0]];
    for (let i = 1; i < arr.length - 1; i++) {
      out.push((arr[i-1] + arr[i] + arr[i+1]) / 3);
    }
    out.push(arr[arr.length - 1]);
    return out;
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

      // Read audio data
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteTimeDomainData(dataArray);

      // Average deviation
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += Math.abs(dataArray[i] - 128);
      const avg = Math.min(sum / dataArray.length / 128, 1);

      // Rolling history — throttle 150ms
      const now = Date.now();
      if (now - lastSampleRef.current > 150) {
        lastSampleRef.current = now;
        waveHistoryRef.current.push(avg);
        if (waveHistoryRef.current.length > maxSamples) waveHistoryRef.current.shift();
      }

      const rawHistory = waveHistoryRef.current;
      const history = smoothData(rawHistory);
      const hLen = history.length;
      const centerY = height / 2;
      const maxH = height * 0.72;

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, width, height);

      // Center line
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (hLen >= 2) {
        // Calculate x positions — NEWEST on RIGHT, oldest on LEFT
        const xs = [];
        const ysTop = [];
        const ysBot = [];

        for (let i = 0; i < hLen; i++) {
          const age = hLen - 1 - i; // 0 = newest, hLen-1 = oldest
          const x = width - (age * width) / maxSamples;
          const barH = Math.min(history[i] * maxH, maxH / 2);
          xs.push(x);
          ysTop.push(centerY - barH);
          ysBot.push(centerY + barH);
        }

        // Fill between upper/lower envelope
        ctx.fillStyle = 'rgba(225, 29, 72, 0.12)';
        ctx.beginPath();
        ctx.moveTo(xs[0], centerY);
        for (let i = 0; i < hLen; i++) ctx.lineTo(xs[i], ysTop[i]);
        ctx.lineTo(xs[hLen-1], centerY);
        for (let i = hLen - 1; i >= 0; i--) ctx.lineTo(xs[i], ysBot[i]);
        ctx.closePath();
        ctx.fill();

        // Upper line (bright red) — smooth curve
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(xs[0], ysTop[0]);
        for (let i = 1; i < hLen; i++) {
          const prevX = xs[i-1], prevY = ysTop[i-1];
          const midX = (prevX + xs[i]) / 2;
          const midY = (prevY + ysTop[i]) / 2;
          ctx.quadraticCurveTo(prevX, prevY, midX, midY);
        }
        ctx.stroke();

        // Lower line (darker)
        ctx.strokeStyle = '#be123c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xs[0], ysBot[0]);
        for (let i = 1; i < hLen; i++) {
          const prevX = xs[i-1], prevY = ysBot[i-1];
          const midX = (prevX + xs[i]) / 2;
          const midY = (prevY + ysBot[i]) / 2;
          ctx.quadraticCurveTo(prevX, prevY, midX, midY);
        }
        ctx.stroke();

      } else {
        // Flat line placeholder
        ctx.strokeStyle = 'rgba(225,29,72,0.3)';
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
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      onSend?.({
        url: data.url, fileName: data.name, fileSize: data.size,
        mimeType: data.mime, duration: Math.round(duration)
      });
      onClose?.();
    } catch (e) {
      console.warn('Audio error:', e); alert('Error: ' + (e.message || e));
      setState('recording');
    }
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
        <div className={styles.statusRow}>
          <span className={styles.spinner}></span> Enviando audio...
        </div>
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
