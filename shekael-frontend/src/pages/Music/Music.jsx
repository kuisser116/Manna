import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import gsap from 'gsap';
import { searchMusic, getProxyUrl } from '../../api/music.api';
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, X, ChevronDown,
  ListMusic
} from 'lucide-react';
import styles from './Music.module.css';

export default function Music() {
  const [searchParams] = useSearchParams();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const audioRef = useRef(null);
  const panelRef = useRef(null);
  const panelBgRef = useRef(null);
  const listRef = useRef(null);
  const songRefs = useRef({});
  const queueBtnRef = useRef(null);

  const [currentSong, setCurrentSong] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);
  const queueRef = useRef([]);
  const [queue, setQueue] = useState([]);
  const [showQueue, setShowQueue] = useState(false);
  const [selectedSong, setSelectedSong] = useState(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  const q = searchParams.get('q') || '';

  // ── Búsqueda ──
  useEffect(() => {
    if (q) {
      setLoading(true);
      setError('');
      searchMusic(q).then(data => {
        setResults(data.results || []);
        if (!data.results?.length) setError('Sin resultados');
      }).catch(() => setError('Error al buscar'))
      .finally(() => setLoading(false));
    } else {
      setResults([]);
      closePanel();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    }
  }, [q]);

  // ── Animación de entrada del panel ──
  useEffect(() => {
    if (panelVisible && panelRef.current) {
      gsap.fromTo(panelRef.current,
        { x: '100%', opacity: 0 },
        { x: '0%', opacity: 1, duration: 0.35, ease: 'power3.out' }
      );
      // Animación del artwork
      const art = panelRef.current.querySelector('[data-panel-art]');
      if (art) {
        gsap.fromTo(art,
          { scale: 0.9, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.4, ease: 'power2.out', delay: 0.1 }
        );
      }
      // Animación del body
      const body = panelRef.current.querySelector('[data-panel-body]');
      if (body) {
        gsap.fromTo(body.children,
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.3, stagger: 0.05, ease: 'power2.out', delay: 0.2 }
        );
      }
    }
  }, [panelVisible]);

  // ── Animación en la card seleccionada ──
  const animateSelectedSong = useCallback((songId) => {
    const el = songRefs.current[songId];
    if (!el) return;
    gsap.fromTo(el,
      { scale: 1 },
      { scale: 1.02, duration: 0.2, ease: 'power1.out', yoyo: true, repeat: 1 }
    );
  }, []);

  // ── Reproducir ──
  const playSong = async (song, addToQueue = false) => {
    if (!audioRef.current) return;
    if (addToQueue) {
      queueRef.current = [...queueRef.current, { ...song }];
      setQueue([...queueRef.current]);
      // Animación del botón cola
      gsap.fromTo(queueBtnRef.current,
        { scale: 1 },
        { scale: 1.15, duration: 0.15, ease: 'power1.out', yoyo: true, repeat: 1 }
      );
      return;
    }
    if (currentSong?.id === song.id && playing) { togglePlay(); return; }

    animateSelectedSong(song.id);
    setLoadingStream(true);
    setError('');
    setSelectedSong(song);
    setPanelVisible(true);
    setClosing(false);

    try {
      const proxyUrl = getProxyUrl(song.id);
      const audio = audioRef.current;

      audio.pause();
      audio.src = '';
      audio.load();
      await new Promise(r => setTimeout(r, 50));
      audio.src = proxyUrl;
      audio.load();

      // Esperar canplay con timeout largo (30s para la primera descarga)
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

      // Intentar play con reintento si no está listo
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
      setError(err.message);
      closePanel();
      setPlaying(false);
    } finally {
      setLoadingStream(false);
    }
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a || !currentSong) return;
    if (playing) { a.pause(); setPlaying(false); }
    else {
      a.play().then(() => {
        setPlaying(true);
        // Pulse en el play button
        gsap.fromTo(panelRef.current?.querySelector('[data-playbtn]'),
          { scale: 1 }, { scale: 1.06, duration: 0.15, ease: 'power1.out', yoyo: true, repeat: 1 }
        );
      }).catch(() => {});
    }
  };

  const playNext = () => {
    if (!queueRef.current.length) { setPlaying(false); return; }
    const next = queueRef.current.shift();
    setQueue([...queueRef.current]);
    if (next) playSong(next);
  };

  const closePanel = () => {
    if (closing) return;
    setClosing(true);
    if (panelRef.current) {
      gsap.to(panelRef.current, {
        x: '100%', opacity: 0, duration: 0.25, ease: 'power2.in',
        onComplete: () => {
          setSelectedSong(null);
          setPanelVisible(false);
          setClosing(false);
          setCurrentSong(null);
          setPlaying(false);
          if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
        }
      });
    } else {
      setSelectedSong(null);
      setPanelVisible(false);
      setClosing(false);
    }
  };

  const removeFromQueue = (i) => {
    queueRef.current = queueRef.current.filter((_, idx) => idx !== i);
    setQueue([...queueRef.current]);
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (audioRef.current && duration > 0) {
      audioRef.current.currentTime = pct * duration;
    }
  };

  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const nf = (n) => {
    if (!n) return '';
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className={styles.page}>
      {/* ═══ Placeholder ═══ */}
      {!q && !results.length && (
        <div className={styles.empty}>
          <ListMusic size={40} strokeWidth={1.5} />
          <p>Busca canciones en la barra de arriba</p>
        </div>
      )}

      {loading && <div className={styles.loading}>Buscando…</div>}
      {error && <div className={styles.error}>{error}</div>}

      {/* ═══ Lista ═══ */}
      <div
        ref={listRef}
        className={`${styles.list} ${panelVisible ? styles.listShift : ''}`}
      >
        {results.map(song => (
          <div
            key={song.id}
            ref={el => songRefs.current[song.id] = el}
            className={`${styles.song} ${currentSong?.id === song.id ? styles.songActive : ''}`}
            onClick={() => playSong(song)}
          >
            <img src={song.thumbnail || ''} alt="" className={styles.thumb} loading="lazy" />
            <div className={styles.songInfo}>
              <div className={styles.songTitle}>{song.title}</div>
              <div className={styles.songMeta}>
                <span>{song.channel}</span>
                <span className={styles.dot}>·</span>
                <span>{song.durationLabel}</span>
                {song.views > 0 && <><span className={styles.dot}>·</span><span>{nf(song.views)}</span></>}
              </div>
            </div>
            <div className={styles.songActions}>
              {currentSong?.id === song.id && playing ? (
                <span className={styles.songPlaying}>
                  <span /><span /><span />
                </span>
              ) : (
                <Play size={18} className={styles.songPlayIcon} />
              )}
              <button
                className={styles.addBtn}
                onClick={e => { e.stopPropagation(); playSong(song, true); }}
                title="Agregar a cola"
              >
                <span style={{fontSize:'1.1rem',lineHeight:1}}>+</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Audio ═══ */}
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a) { setCurrentTime(a.currentTime); if (a.duration && !isNaN(a.duration)) setDuration(a.duration); }
        }}
        onEnded={playNext}
      />

      {/* ═══ Panel lateral (solo animado si visible) ═══ */}
      {(panelVisible || closing) && selectedSong && (
        <div ref={panelRef} className={styles.panel} style={closing ? { pointerEvents: 'none' } : {}}>
          <button className={styles.panelClose} onClick={closePanel}>
            <X size={20} />
          </button>
          <div className={styles.panelArtWrap}>
            <img data-panel-art src={selectedSong.thumbnail || ''} alt="" className={styles.panelArt} />
          </div>
          <div data-panel-body className={styles.panelBody}>
            <h2 className={styles.panelTitle}>{selectedSong.title}</h2>
            <p className={styles.panelArtist}>{selectedSong.channel}</p>

            <div className={styles.seekWrap} onClick={handleSeek}>
              <div className={styles.seekTrack}>
                <div className={styles.seekFill} style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : 0 }} />
                <div className={styles.seekThumb} style={{ left: duration > 0 ? `${(currentTime / duration) * 100}%` : 0 }} />
              </div>
              <div className={styles.seekTime}>
                <span>{fmt(currentTime)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>

            <div className={styles.ctrls}>
              <button className={styles.ctrlBtn} onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, currentTime - 10); }}>
                <SkipBack size={18} />
              </button>
              <button data-playbtn className={styles.playBtn} onClick={togglePlay} disabled={loadingStream}>
                {loadingStream ? <span className={styles.spinner} /> : (playing ? <Pause size={24} /> : <Play size={24} />)}
              </button>
              <button className={styles.ctrlBtn} onClick={playNext} disabled={!queue.length}>
                <SkipForward size={18} />
              </button>
            </div>

            <div className={styles.volRow}>
              <button className={styles.volIcon} onClick={() => { if (audioRef.current) { audioRef.current.muted = !muted; setMuted(!muted); } }}>
                {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <div className={styles.volTrack} onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                setVolume(v); setMuted(false);
                if (audioRef.current) { audioRef.current.volume = v; audioRef.current.muted = false; }
              }}>
                <div className={styles.volFill} style={{ width: `${(muted ? 0 : volume) * 100}%` }} />
                <div className={styles.volThumb} style={{ left: `${(muted ? 0 : volume) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Cola FAB ═══ */}
      {queue.length > 0 && (
        <button ref={queueBtnRef} className={styles.queueFab} onClick={() => setShowQueue(!showQueue)}>
          <ListMusic size={16} />
          <span>{queue.length}</span>
        </button>
      )}

      {showQueue && queue.length > 0 && (
        <>
          <div className={styles.overlay} onClick={() => setShowQueue(false)} />
          <div className={styles.queuePanel}>
            <div className={styles.queueHeader}>
              <span className={styles.queueTitle}>Cola ({queue.length})</span>
              <button className={styles.queueClose} onClick={() => setShowQueue(false)}><ChevronDown size={18} /></button>
            </div>
            <div className={styles.queueList}>
              {queue.map((song, i) => (
                <div key={`q-${i}`} className={styles.queueItem}>
                  <span className={styles.queueIdx}>{i + 1}</span>
                  <img src={song.thumbnail || ''} alt="" className={styles.queueThumb} />
                  <div className={styles.queueInfo}>
                    <div className={styles.queueSong}>{song.title}</div>
                    <div className={styles.queueMeta}>{song.channel}</div>
                  </div>
                  <button className={styles.queueRemove} onClick={() => removeFromQueue(i)}><X size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
