import { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';

const MusicContext = createContext(null);

export function MusicProvider({ children }) {
  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const historyRef = useRef([]);
  const playlistRef = useRef([]);

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

  const fillQueueFromPlaylist = useCallback(() => {
    const pl = playlistRef.current;
    if (!pl.length) return;

    // Songs already in queue (by id)
    const queuedIds = new Set(queueRef.current.map(s => s.id));
    const currentId = currentSong?.id;

    // Add songs from playlist that aren't queued and aren't currently playing
    const toAdd = pl.filter(s => s.id !== currentId && !queuedIds.has(s.id));
    if (toAdd.length) {
      queueRef.current = [...queueRef.current, ...toAdd.map(s => ({ ...s }))];
      setQueue([...queueRef.current]);
    }
  }, [currentSong]);

  const autoNext = useCallback(() => {
    // If queue is empty, refill from playlist
    if (!queueRef.current.length && playlistRef.current.length) {
      fillQueueFromPlaylist();
    }

    if (!queueRef.current.length) {
      setPlaying(false);
      return false;
    }

    let next;
    const q = queueRef.current;
    if (shuffle) {
      const idx = Math.floor(Math.random() * q.length);
      next = q[idx];
      q.splice(idx, 1);
    } else {
      next = q.shift();
    }
    queueRef.current = [...q];
    setQueue([...q]);
    return next;
  }, [shuffle, fillQueueFromPlaylist]);

  // Exponer la playlist para auto‑queue
  const setPlaylist = useCallback((songs) => {
    playlistRef.current = Array.isArray(songs) ? [...songs] : [];
  }, []);

  const playSong = useCallback(async (song, addToQueue = false) => {
    if (!audioRef.current) return;
    if (addToQueue) {
      queueRef.current = [...queueRef.current, { ...song }];
      setQueue([...queueRef.current]);
      return;
    }
    if (currentSong?.id === song.id && playing) {
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
      historyRef.current = [...historyRef.current, song];

      // Auto‑fill queue con el resto de la playlist
      fillQueueFromPlaylist();
    } catch (err) {
      console.error('[Music] Error playing:', err.message);
      setCurrentSong(null);
      setPlaying(false);
    } finally {
      setLoadingStream(false);
    }
  }, [currentSong, playing, fillQueueFromPlaylist]);

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
    const next = autoNext();
    if (!next) return;
    historyRef.current = [...historyRef.current, currentSong].filter(Boolean);
    playSong(next);
  }, [autoNext, currentSong, playSong]);

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
    playlistRef.current = [];
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
    setVolume,
    setMuted,
    setShuffle,
    playSong,
    togglePlay,
    playNext,
    playPrev,
    addToQueue,
    removeFromQueue,
    seek,
    stop,
    setPlaylist,
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
          playNext();
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
