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

  useEffect(() => {
    startRecording();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    };
  }, []);

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(225, 29, 72, 0.08)';
    ctx.fillRect(0, 0, width, height);

    const barCount = Math.min(40, Math.floor(width / 8));
    const barWidth = width / barCount;
    const centerY = height / 2;
    const maxHeight = height * 0.8;

    for (let i = 0; i < barCount; i++) {
      const idx = Math.floor((i / barCount) * bufferLength);
      const value = dataArray[idx] / 128.0;
      const barH = Math.min((value - 1) * maxHeight, maxHeight / 2);

      const x = i * barWidth + 2;
      const gradient = ctx.createLinearGradient(0, centerY - barH, 0, centerY + barH);
      gradient.addColorStop(0, '#e11d48');
      gradient.addColorStop(0.5, '#f43f5e');
      gradient.addColorStop(1, '#e11d48');
      ctx.fillStyle = gradient;

      ctx.beginPath();
      ctx.roundRect(x, centerY - barH, barWidth - 4, barH * 2, 3);
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

      // Setup analyser for waveform
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

      // Start waveform animation
      drawWaveform();

      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch (e) {
      console.warn('Audio access denied:', e);
      onClose?.();
    }
  };

  const handleSend = async () => {
    if (chunksRef.current.length === 0) return;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

    setState('sending');
    await new Promise(r => setTimeout(r, 100));

    const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
    const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm;codecs=opus' });

    try {
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
      console.warn('Audio upload err:', e);
      setState('recording');
    }
  };

  const handleCancel = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    onClose?.();
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

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
            Iniciando grabacion...
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
