import { useState, useRef, useEffect } from 'react';
import { uploadChatFile } from '../api/chats.api';
import styles from './AudioRecorder.module.css';

export default function AudioRecorder({ onSend, onClose }) {
  const [state, setState] = useState('idle'); // idle | recording | sending
  const [duration, setDuration] = useState(0);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const stream = useRef(null);

  useEffect(() => {
    startRecording();
    return () => cleanup();
  }, []);

  const cleanup = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (stream.current) { stream.current.getTracks().forEach(t => t.stop()); stream.current = null; }
  };

  const startRecording = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const mr = new MediaRecorder(s, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      mediaRecorder.current = mr;
      chunks.current = [];

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      mr.onstop = () => { setState('idle'); };

      mr.start();
      setState('recording');
      setDuration(0);
      timer.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch (e) {
      console.warn('Audio access denied:', e);
      onClose?.();
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop();
    }
    cleanup();
  };

  const sendAudio = async () => {
    if (chunks.current.length === 0) return;
    setState('sending');
    const blob = new Blob(chunks.current, { type: 'audio/webm;codecs=opus' });
    const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm;codecs=opus' });

    try {
      const { data } = await uploadChatFile(file);
      onSend?.({
        type: 'audio',
        url: data.url,
        fileName: data.name,
        fileSize: data.size,
        mimeType: data.mime,
        duration: Math.round(duration)
      });
      onClose?.();
    } catch (e) { console.warn('Audio upload err:', e); setState('idle'); }
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.recorder} onClick={e => e.stopPropagation()}>
        {state === 'recording' && (
          <>
            <div className={styles.visualizer}>
              <span className={styles.dot}></span>
              <span className={styles.time}>{formatTime(duration)}</span>
            </div>
            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={() => { stopRecording(); onClose?.(); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <button className={styles.sendBtn} onClick={() => { stopRecording(); sendAudio(); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </>
        )}
        {state === 'sending' && <div className={styles.sending}>Enviando...</div>}
      </div>
    </div>
  );
}
