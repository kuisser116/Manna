import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import gsap from 'gsap';
import { searchMusic } from '../../api/music.api';
import { useMusic } from '../../context/MusicContext';
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, X, ChevronDown, Shuffle,
  ListMusic
} from 'lucide-react';
import styles from './Music.module.css';

export default function Music() {
  const [searchParams] = useSearchParams();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const {
    currentSong, playing, duration, currentTime, volume, muted,
    queue, shuffle, loadingStream,
    playSong, togglePlay, playNext, playPrev, setShuffle,
    addToQueue, removeFromQueue, seek, setPlaylist,
    setVolume, setMuted,
  } = useMusic();

  const panelRef = useRef(null);
  const listRef = useRef(null);
  const songRefs = useRef({});
  const queueBtnRef = useRef(null);

  const [showQueue, setShowQueue] = useState(false);

  const q = searchParams.get('q') || '';

  // ── Búsqueda ──
  useEffect(() => {
    if (q) {
      setLoading(true);
      setError('');
      searchMusic(q).then(data => {
        const list = data.results || [];
        setResults(list);
        setPlaylist(list);
        if (!list.length) setError('Sin resultados');
      }).catch(() => setError('Error al buscar'))
      .finally(() => setLoading(false));
    } else {
      setResults([]);
      setPlaylist([]);
    }
  }, [q, setPlaylist]);

  // ── Animación del panel ──
  useEffect(() => {
    if (currentSong && panelRef.current) {
      gsap.fromTo(panelRef.current,
        { x: '100%', opacity: 0 },
        { x: '0%', opacity: 1, duration: 0.35, ease: 'power3.out' }
      );
      const art = panelRef.current.querySelector('[data-panel-art]');
      if (art) {
        gsap.fromTo(art,
          { scale: 0.9, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.4, ease: 'power2.out', delay: 0.1 }
        );
      }
      const body = panelRef.current.querySelector('[data-panel-body]');
      if (body) {
        gsap.fromTo(body.children,
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.3, stagger: 0.05, ease: 'power2.out', delay: 0.2 }
        );
      }
    }
  }, [currentSong]);

  // ── Animación en card click ──
  const animateCard = useCallback((songId) => {
    const el = songRefs.current[songId];
    if (!el) return;
    gsap.fromTo(el,
      { scale: 1 },
      { scale: 1.02, duration: 0.2, ease: 'power1.out', yoyo: true, repeat: 1 }
    );
  }, []);

  // ── Click en canción ──
  const handlePlaySong = async (song, addToQueueOnly = false) => {
    if (addToQueueOnly) {
      const len = addToQueue(song);
      gsap.fromTo(queueBtnRef.current,
        { scale: 1 },
        { scale: 1.2, duration: 0.15, ease: 'power1.out', yoyo: true, repeat: 1 }
      );
      return;
    }
    animateCard(song.id);
    playSong(song);
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
        className={`${styles.list} ${currentSong ? styles.listShift : ''}`}
      >
        {results.map(song => (
          <div
            key={song.id}
            ref={el => songRefs.current[song.id] = el}
            className={`${styles.song} ${currentSong?.id === song.id ? styles.songActive : ''}`}
            onClick={() => handlePlaySong(song)}
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
                onClick={e => { e.stopPropagation(); handlePlaySong(song, true); }}
                title="Agregar a cola"
              >
                <span style={{fontSize:'1.1rem',lineHeight:1}}>+</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Panel lateral ═══ */}
      {currentSong && (
        <div ref={panelRef} className={styles.panel}>
          <button className={styles.panelClose} onClick={() => {}}>
            {/* Close que no detiene — el panel se oculta al ir a otra página */}
          </button>

          <div className={styles.panelArtWrap}>
            <img data-panel-art src={currentSong.thumbnail || ''} alt="" className={styles.panelArt} />
          </div>

          <div data-panel-body className={styles.panelBody}>
            <h2 className={styles.panelTitle}>{currentSong.title}</h2>
            <p className={styles.panelArtist}>{currentSong.channel}</p>

            {/* Seek */}
            <div className={styles.seekWrap} onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
            }}>
              <div className={styles.seekTrack}>
                <div className={styles.seekFill} style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : 0 }} />
                <div className={styles.seekThumb} style={{ left: duration > 0 ? `${(currentTime / duration) * 100}%` : 0 }} />
              </div>
              <div className={styles.seekTime}>
                <span>{fmt(currentTime)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className={styles.ctrls}>
              <button className={`${styles.ctrlBtn} ${shuffle ? styles.active : ''}`} onClick={() => setShuffle(v => !v)} title="Aleatorio">
                <Shuffle size={16} />
              </button>
              <button className={styles.ctrlBtn} onClick={playPrev}>
                <SkipBack size={18} />
              </button>
              <button className={styles.playBtn} onClick={togglePlay} disabled={loadingStream}>
                {loadingStream ? <span className={styles.spinner} /> : (playing ? <Pause size={24} /> : <Play size={24} />)}
              </button>
              <button className={styles.ctrlBtn} onClick={playNext} disabled={!queue.length}>
                <SkipForward size={18} />
              </button>
              <button className={`${styles.ctrlBtn} ${shuffle ? styles.active : ''}`} style={{visibility: 'hidden'}}>
                <Shuffle size={16} />
              </button>
            </div>

            {/* Volume */}
            <div className={styles.volRow}>
              <button className={styles.volIcon} onClick={() => { setMuted(!muted); }}>
                {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <div className={styles.volTrack} onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                setVolume(v); setMuted(false);
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
