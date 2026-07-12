import { useState, useRef, useEffect } from 'react';
import { uploadChatFile } from '../api/chats.api';
import styles from './AudioRecorder.module.css';

export default function AudioRecorder({ onSend, onClose }) {
  const [state, setState] = useState('starting'); // starting | recording | sending
  const [duration, setDuration] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    startRecording();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    };
  }, []);

  const startRecording = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = s;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(s, { mimeType: mime });
      recorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      mr.start();
      setState('recording');
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch (e) {
      console.warn('Audio access denied:', e);
      onClose?.();
    }
  };

  const handleSend = async () => {
    if (chunksRef.current.length === 0) return;

    // Stop recording
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

    setState('sending');

    // Small delay to ensure ondataavailable fires after stop
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
            <div className={styles.visualizer}>
              <span className={styles.dot}></span>
              <span className={styles.time}>{formatTime(duration)}</span>
            </div>
            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={handleCancel} title="Cancelar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <button className={styles.sendBtn} onClick={handleSend} title="Enviar audio">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </>
        )}
        {state === 'starting' && <div className={styles.sending}>Iniciando...</div>}
        {state === 'sending' && <div className={styles.sending}>Enviando audio...</div>}
      </div>
    </div>
  );
}
