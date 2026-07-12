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
  const maxSamples = 200;
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    startRecording();
    return () => {
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

  const drawWaveform = () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas || !analyserRef.current) {
        if (recording) animFrameRef.current = requestAnimationFrame(drawWaveform);
        return;
      }
      const ctx = canvas.getContext('2d');
      const { width, height } = canvas;
      if (!width || !height) {
        if (recording) animFrameRef.current = requestAnimationFrame(drawWaveform);
        return;
      }

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteTimeDomainData(dataArray);

      // Average amplitude
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += Math.abs(dataArray[i] - 128);
      }
      const avg = Math.min(sum / dataArray.length / 128, 1);
      if (avg > 0.01) setRecording(true);

      // Rolling history
      waveHistoryRef.current.push(avg);
      if (waveHistoryRef.current.length > maxSamples) {
        waveHistoryRef.current.shift();
      }

      const history = waveHistoryRef.current;
      const hLen = history.length;

      // --- Draw ---
      const centerY = height / 2;
      const maxH = height * 0.72;
      const fillColor = 'rgba(225, 29, 72, 0.2)';
      const midColor = 'rgba(255,255,255,0.08)';
      const topColor = '#e11d48';
      const botColor = '#be123c';

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, width, height);

      // Center line
      ctx.strokeStyle = midColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      if (hLen < 2) {
        // Flat line when no data yet
        ctx.strokeStyle = topColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
      } else {
        // Fill between top and bottom
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        for (let i = 0; i < hLen; i++) {
          const x = (i / maxSamples) * width;
          const barH = Math.min(history[i] * maxH, maxH / 2);
          ctx.lineTo(x, centerY - barH);
        }
        ctx.lineTo(width, centerY);
        for (let i = hLen - 1; i >= 0; i--) {
          const x = (i / maxSamples) * width;
          const barH = Math.min(history[i] * maxH, maxH / 2);
          ctx.lineTo(x, centerY + barH);
        }
        ctx.closePath();
        ctx.fill();

        // Upper line
        ctx.strokeStyle = topColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < hLen; i++) {
          const x = (i / maxSamples) * width;
          const barH = Math.min(history[i] * maxH, maxH / 2);
          if (i === 0) ctx.moveTo(x, centerY - barH);
          else ctx.lineTo(x, centerY - barH);
        }
        ctx.stroke();

        // Lower line
        ctx.strokeStyle = botColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < hLen; i++) {
          const x = (i / maxSamples) * width;
          const barH = Math.min(history[i] * maxH, maxH / 2);
          if (i === 0) ctx.moveTo(x, centerY + barH);
          else ctx.lineTo(x, centerY + barH);
        }
        ctx.stroke();
      }

      if (recording) {
        animFrameRef.current = requestAnimationFrame(drawWaveform);
      }
    } catch (e) {
      // Keep drawing through errors
      if (recording) {
        animFrameRef.current = requestAnimationFrame(drawWaveform);
      }
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
      setRecording(false);

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(s);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      // Start everything
      mr.start();
      setState('recording');
      setDuration(0);
      setRecording(true);
      drawWaveform();

      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch (e) {
      console.warn('Audio error:', e);
      alert('No se pudo acceder al microfono.');
      onClose?.();
    }
  };

  // Separate effect to size canvas after layout
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sizeCanvas = () => {
      if (!canvas.parentElement) return;
      const w = canvas.parentElement.clientWidth;
      const h = canvas.parentElement.clientHeight;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    sizeCanvas();
    // Retry a few times in case layout isn't ready
    let tries = 0;
    const interval = setInterval(() => {
      tries++;
      sizeCanvas();
      if (tries > 5 || (canvas.width > 0 && canvas.height > 0)) {
        clearInterval(interval);
      }
    }, 100);

    const resizeObserver = new ResizeObserver(sizeCanvas);
    resizeObserver.observe(canvas.parentElement);

    return () => {
      clearInterval(interval);
      resizeObserver.disconnect();
    };
  }, []);

  // Pause handler
  const togglePause = () => {
    if (!recorderRef.current) return;
    if (state === 'recording') {
      recorderRef.current.stop();
      if (audioCtxRef.current) audioCtxRef.current.suspend();
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setRecording(false);
      setState('paused');
    } else if (state === 'paused') {
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(streamRef.current, { mimeType: mime });
      recorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start();
      if (audioCtxRef.current) audioCtxRef.current.resume();
      setState('recording');
      setRecording(true);
      drawWaveform();
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    }
  };

  const handleSend = async () => {
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      stopTracks();
      if (audioCtxRef.current) audioCtxRef.current.close();

      await new Promise(r => setTimeout(r, 50));

      if (chunksRef.current.length === 0) {
        alert('No se grabo audio.');
        onClose?.();
        return;
      }

      setState('sending');

      const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
      const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm;codecs=opus' });

      const { data } = await uploadChatFile(file);

      onSend?.({
        url: data.url,
        fileName: data.name,
        fileSize: data.size,
        mimeType: data.mime,
        duration: Math.round(duration)
      });
      onClose?.();
    } catch (e) {
      console.warn('Audio error:', e);
      alert('Error: ' + (e.message || e));
      setState('recording');
    }
  };

  const handleCancel = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    stopTracks();
    if (audioCtxRef.current) audioCtxRef.current.close();
    onClose?.();
  };

  const formatTime = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  if (state === 'sending') {
    return (
      <div className={styles.inlineBar}>
        <div className={styles.statusRow}>
          <span className={styles.spinner}></span>
          Enviando audio...
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

        <span className={styles.timer}>{formatTime(duration)}</span>

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
