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
  const smoothValsRef = useRef(new Float32Array(40).fill(0));

  useEffect(() => {
    startRecording();
    return () => {
      stopTracks();
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);

    // Clear with subtle gradient background
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, 'rgba(225, 29, 72, 0.03)');
    bg.addColorStop(0.5, 'rgba(225, 29, 72, 0.06)');
    bg.addColorStop(1, 'rgba(225, 29, 72, 0.03)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const barCount = 40;
    const barWidth = (width - 28) / barCount;
    const gap = 3;
    const centerY = height / 2;
    const maxH = height * 0.75;
    const smoothFactor = 0.3;
    const smooth = smoothValsRef.current;

    // Draw center line
    ctx.strokeStyle = 'rgba(225, 29, 72, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, centerY);
    ctx.lineTo(width - 8, centerY);
    ctx.stroke();

    for (let i = 0; i < barCount; i++) {
      const idx = Math.floor((i / barCount) * bufferLength);
      const value = (dataArray[idx] - 128) / 128;

      // Smooth the value
      smooth[i] += (Math.abs(value) - smooth[i]) * smoothFactor;
      const barH = Math.min(smooth[i] * maxH, maxH / 2);
      if (barH < 1.5) continue;

      const x = 14 + i * (barWidth + gap);
      const y = centerY - barH;

      // Gradient per bar
      const grd = ctx.createLinearGradient(0, y, 0, y + barH * 2);
      grd.addColorStop(0, '#e11d48');
      grd.addColorStop(0.5, '#f43f5e');
      grd.addColorStop(1, '#be123c');
      ctx.fillStyle = grd;

      // Rounded bar
      const radius = Math.min(barWidth / 2, 4);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, y + barH * 2 - radius);
      ctx.quadraticCurveTo(x + barWidth, y + barH * 2, x + barWidth - radius, y + barH * 2);
      ctx.lineTo(x + radius, y + barH * 2);
      ctx.quadraticCurveTo(x, y + barH * 2, x, y + barH * 2 - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
    }

    animFrameRef.current = requestAnimationFrame(drawWaveform);
  };

  const startRecording = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = s;

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(s, { mimeType: mime });
      recorderRef.current = mr;
      chunksRef.current = [];

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(s);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
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
      alert('No se pudo acceder al microfono. Revisa los permisos.');
      onClose?.();
    }
  };

  const handleSend = async () => {
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      stopTracks();

      await new Promise(r => setTimeout(r, 50));

      if (chunksRef.current.length === 0) {
        alert('No se grabo audio. Intenta de nuevo.');
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
      console.warn('Audio send error:', e);
      alert('Error: ' + (e.message || e));
      setState('recording');
    }
  };

  const handleCancel = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    stopTracks();
    onClose?.();
  };

  const formatTime = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  return (
    <div className={styles.overlay} onClick={handleCancel}>
      <div className={styles.recorder} onClick={e => e.stopPropagation()}>
        {state === 'recording' && (
          <>
            <div className={styles.timer}>{formatTime(duration)}</div>
            <canvas ref={canvasRef} className={styles.waveform} width="280" height="80" />
            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={handleCancel} title="Cancelar">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div className={styles.recordingIndicator}>
                <span className={styles.recDot}></span>
                Grabando
              </div>
              <button className={styles.sendBtn} onClick={handleSend} title="Enviar">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </>
        )}
        {state === 'starting' && (
          <div className={styles.starting}>
            <span className={styles.spinner}></span>
            Iniciando...
          </div>
        )}
        {state === 'sending' && (
          <div className={styles.sending}>
            <span className={styles.spinner}></span>
            Enviando audio...
          </div>
        )}
      </div>
    </div>
  );
}
