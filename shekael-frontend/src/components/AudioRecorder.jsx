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
  const containerRef = useRef(null);
  const canvasWidth = 280;
  const canvasHeight = 50;

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
        animFrameRef.current = requestAnimationFrame(drawWaveform);
        return;
      }
      const ctx = canvas.getContext('2d');
      const { width, height } = canvas;

      // Get audio data
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteTimeDomainData(dataArray);

      // Average amplitude this frame
      let sum = 0;
      const len = dataArray.length;
      for (let i = 0; i < len; i++) {
        sum += Math.abs(dataArray[i] - 128);
      }
      const avg = Math.min(sum / len / 128, 1);

      // Store in rolling history
      waveHistoryRef.current.push(avg);
      if (waveHistoryRef.current.length > maxSamples) {
        waveHistoryRef.current.shift();
      }

      const history = waveHistoryRef.current;
      const hLen = history.length;

      // --- Clear canvas ---
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, width, height);

      // --- Center line ---
      const centerY = height / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(4, centerY);
      ctx.lineTo(width - 4, centerY);
      ctx.stroke();

      if (hLen < 2) {
        // Not enough data yet — just show a flat line
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
      } else {
        // --- Draw upper waveform ---
        const maxH = height * 0.72;
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < hLen; i++) {
          const x = (i / maxSamples) * width;
          const barH = Math.min(history[i] * maxH, maxH / 2);
          if (i === 0) ctx.moveTo(x, centerY - barH);
          else ctx.lineTo(x, centerY - barH);
        }
        ctx.stroke();

        // --- Draw lower waveform (mirror) ---
        ctx.strokeStyle = '#be123c';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < hLen; i++) {
          const x = (i / maxSamples) * width;
          const barH = Math.min(history[i] * maxH, maxH / 2);
          if (i === 0) ctx.moveTo(x, centerY + barH);
          else ctx.lineTo(x, centerY + barH);
        }
        ctx.stroke();

        // --- Fill between (translucent red) ---
        ctx.fillStyle = 'rgba(225, 29, 72, 0.2)';
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        for (let i = 0; i < hLen; i++) {
          const x = (i / maxSamples) * width;
          const barH = Math.min(history[i] * maxH, maxH / 2);
          ctx.lineTo(x, centerY - barH);
        }
        for (let i = hLen - 1; i >= 0; i--) {
          const x = (i / maxSamples) * width;
          const barH = Math.min(history[i] * maxH, maxH / 2);
          ctx.lineTo(x, centerY + barH);
        }
        ctx.closePath();
        ctx.fill();
      }

      // --- Recording dot (upper right) ---
      ctx.fillStyle = '#e11d48';
      ctx.beginPath();
      ctx.arc(width - 10, 10, 3, 0, Math.PI * 2);
      ctx.fill();

      if (state === 'recording') {
        animFrameRef.current = requestAnimationFrame(drawWaveform);
      }
    } catch (e) {
      console.warn('Draw error:', e);
      // Keep drawing even on error
      if (state === 'recording') {
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
      drawWaveform();

      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
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
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setState('paused');
    } else if (state === 'paused') {
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(streamRef.current, { mimeType: mime });
      recorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start();
      if (audioCtxRef.current) audioCtxRef.current.resume();
      setState('recording');
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

        <div className={styles.waveWrap} ref={containerRef}>
          <canvas ref={canvasRef} className={styles.waveform} width={canvasWidth} height={canvasHeight} />
        </div>

        <span className={styles.timer}>{formatTime(duration)}</span>

        <button className={styles.playPauseBtn} onClick={togglePause} title={state === 'paused' ? 'Reanudar' : 'Pausar'}>
          {state === 'paused' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          )}
        </button>

        <button className={styles.sendBtn} onClick={handleSend} title="Enviar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );
}
