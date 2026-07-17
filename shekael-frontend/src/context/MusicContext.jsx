import { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';

const MusicContext = createContext(null);

export function MusicProvider({ children }) {
  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const historyRef = useRef([]);

  const [currentSong, setCurrentSong] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('shekael-music-volume');
    return saved !== null ? parseFloat(saved) : 0.7;
  });
  const [muted, setMuted] = useState(false);
  const [queue, setQueue] = useState([]);
  const [shuffle, setShuffle] = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);

  // Persistir volumen
  useEffect(() => {
    localStorage.setItem('shekael-music-volume', String(volume));
  }, [volume]);

  // Sincronizar volumen con el audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const playSong = useCallback(async (song, addToQueue = false) => {
    if (!audioRef.current) return;
    if (addToQueue) {
      queueRef.current = [...queueRef.current, { ...song }];
      setQueue([...queueRef.current]);
      return;
    }
    if (currentSong?.id === song.id && playing) {
      // toggle pause
      const a = audioRef.current;
      a.pause();
      setPlaying(false);
      return;
    }

    setLoadingStream(true);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || '/api';
      const proxyUrl = `${baseUrl}/music/proxy/${song.id}`;
      const audio = audioRef.current;

      audio.pause();
      audio.src = '';
      audio.load();
      await new Promise(r => setTimeout(r, 50));
      audio.src = proxyUrl;
      audio.load();

      // Esperar canplay con timeout largo (30s para primera descarga)
      await new Promise((resolve, reject) => {
        const ok = () => { cleanup(); resolve(); };
        const fail = () => { cleanup(); reject(new Error('No se pudo cargar')); };
        const t = setTimeout(() => { cleanup(); resolve(); }, 30000);
        const cleanup = () => {
          clearTimeout(t);
          audio.removeEventListener('canplay', ok);
          audio.removeEventListener('error', fail);
        };
        audio.addEventListener('canplay', ok);
        audio.addEventListener('error', fail);
      });

      // Reintentar play si no está listo
      let attempts = 0;
      while (attempts < 5) {
        try {
          await audio.play();
          break;
        } catch {
          attempts++;
          if (attempts < 5) await new Promise(r => setTimeout(r, 500));
          else throw new Error('No se pudo iniciar la reproducción');
        }
      }

      setPlaying(true);
      setCurrentSong(song);
    } catch (err) {
      console.error('[Music] Error playing:', err.message);
      setCurrentSong(null);
      setPlaying(false);
    } finally {
      setLoadingStream(false);
    }
  }, [currentSong, playing]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a || !currentSong) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [currentSong, playing]);

  const playNext = useCallback(() => {
    const q = queueRef.current;
    if (!q.length) {
      setPlaying(false);
      return;
    }

    let next;
    if (shuffle) {
      const idx = Math.floor(Math.random() * q.length);
      next = q[idx];
      q.splice(idx, 1);
    } else {
      next = q.shift();
    }

    queueRef.current = [...q];
    setQueue([...q]);

    if (next) {
      historyRef.current = [...historyRef.current, currentSong].filter(Boolean);
      playSong(next);
    }
  }, [shuffle, currentSong, playSong]);

  const playPrev = useCallback(() => {
    const h = historyRef.current;
    if (!h.length) return;
    const prev = h.pop();
    historyRef.current = [...h];
    if (prev) {
      queueRef.current = [currentSong, ...queueRef.current].filter(Boolean);
      setQueue([...queueRef.current]);
      playSong(prev);
    }
  }, [currentSong, playSong]);

  const addToQueue = useCallback((song) => {
    queueRef.current = [...queueRef.current, { ...song }];
    setQueue([...queueRef.current]);
    return queueRef.current.length;
  }, []);

  const removeFromQueue = useCallback((idx) => {
    queueRef.current = queueRef.current.filter((_, i) => i !== idx);
    setQueue([...queueRef.current]);
  }, []);

  const seek = useCallback((pct) => {
    const a = audioRef.current;
    if (a && duration > 0) {
      a.currentTime = pct * duration;
    }
  }, [duration]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setCurrentSong(null);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    queueRef.current = [];
    setQueue([]);
    historyRef.current = [];
  }, []);

  const value = {
    currentSong,
    playing,
    duration,
    currentTime,
    volume,
    muted,
    queue,
    shuffle,
    loadingStream,
    audioRef,
    setVolume,
    setMuted,
    setShuffle,
    setCurrentTime,
    setDuration,
    playSong,
    togglePlay,
    playNext,
    playPrev,
    addToQueue,
    removeFromQueue,
    seek,
    stop,
  };

  return (
    <MusicContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a) {
            setCurrentTime(a.currentTime);
            if (a.duration && !isNaN(a.duration)) setDuration(a.duration);
          }
        }}
        onEnded={() => {
          // Auto-next when song ends
          const q = queueRef.current;
          if (q.length) {
            playNext();
          } else {
            setPlaying(false);
          }
        }}
      />
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error('useMusic must be inside MusicProvider');
  return ctx;
}

export default MusicContext;
