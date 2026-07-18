import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);
import { searchMusic } from '../../api/music.api';
import { useMusic } from '../../context/MusicContext';
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Shuffle, X,
  ListMusic, ChevronDown
} from 'lucide-react';
import styles from './Music.module.css';
import bgPatternUrl from '../../assets/patterns/profile-bg-pattern.svg';

export default function Music() {
  const [searchParams] = useSearchParams();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showQueue, setShowQueue] = useState(false);

  const {
    currentSong, playing, duration, currentTime, volume, muted,
    queue, shuffle, loadingStream,
    playSong, togglePlay, playNext, playPrev, setShuffle,
    addToQueue, removeFromQueue, seek,
    setVolume, setMuted,
  } = useMusic();

  const panelRef = useRef(null);
  const listRef = useRef(null);
  const q = searchParams.get('q') || '';

  // ── Búsqueda ──
  useEffect(() => {
    if (q) {
      setLoading(true);
      setError('');
      searchMusic(q).then(data => {
        const list = data.results || [];
        setResults(list);
        if (!list.length) setError('Sin resultados');
      }).catch(() => setError('Error al buscar'))
      .finally(() => setLoading(false));
    } else {
      setResults([]);
    }
  }, [q]);

  // ── Stagger de entrada ──
  useEffect(() => {
    if (results.length === 0) return;
    const items = listRef.current?.children;
    if (!items || items.length === 0) return;

    gsap.set(items, { opacity: 0, y: 12 });
    gsap.to(items, {
      opacity: 1,
      y: 0,
      duration: 0.35,
      stagger: { amount: 0.4, from: 'start' },
      ease: 'power3.out'
    });

    return () => gsap.killTweensOf(items);
  }, [results]);

  // ── Parallax por columnas ──
  useEffect(() => {
    if (results.length === 0) return;
    const items = listRef.current?.children;
    if (!items || items.length === 0) return;

    // Agrupar por columna (grid de 5)
    const cols = [[], [], [], [], []];
    Array.from(items).forEach((el, i) => cols[i % 5].push(el));

    // Velocidades: col1 rápida, col2 lenta, col3 más lenta, col4 rápida, col5 lenta
    const speeds = [1.4, 0.7, 0.3, 1.4, 0.7];

    cols.forEach((group, idx) => {
      gsap.to(group, {
        y: (1 - speeds[idx]) * 80,
        ease: 'none',
        scrollTrigger: {
          trigger: listRef.current,
          scrub: 1,
          start: 'top bottom',
          end: 'bottom top'
        }
      });
    });

    return () => ScrollTrigger.getAll().forEach(st => st.kill());
  }, [results]);

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

  const handlePlaySong = async (song, addToQueueOnly = false) => {
    if (addToQueueOnly) {
      addToQueue(song);
      return;
    }
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
    <div className={styles.page} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
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
            className={`${styles.song} ${currentSong?.id === song.id ? styles.songActive : ''}`}
            onClick={() => handlePlaySong(song)}
          >
            <div className={styles.thumbWrap}>
              <img src={song.thumbnail || ''} alt="" className={styles.thumb} loading="lazy" />
            </div>
            <div className={styles.songInfo}>
              <div className={styles.songTitle}>{song.title}</div>
              <div className={styles.songMeta}>
                <span>{song.channel}</span>
                <span className={styles.dot}>·</span>
                <span>{song.durationLabel}</span>
                {song.views > 0 && <><span className={styles.dot}>·</span><span>{nf(song.views)}</span></>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Panel lateral con cola integrada ═══ */}
      {currentSong && (
        <div ref={panelRef} className={styles.panel}>
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
              <button className={styles.ctrlBtn} onClick={playNext}>
                <SkipForward size={18} />
              </button>
              <button className={`${styles.ctrlBtn} ${styles.emptyBtn}`} />
            </div>

            {/* Volume */}
            <div className={styles.volRow}>
              <button className={styles.volIcon} onClick={() => setMuted(!muted)}>
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

            {/* ═══ Cola dentro del panel ═══ */}
            {queue.length > 0 && (
              <div className={styles.panelQueue}>
                <div className={styles.panelQueueHeader}>
                  <span className={styles.panelQueueTitle}>Siguientes</span>
                  <button
                    className={styles.panelQueueToggle}
                    onClick={() => setShowQueue(v => !v)}
                  >
                    <ChevronDown size={14} className={showQueue ? '' : styles.rotateCCW} />
                  </button>
                </div>
                {showQueue && (
                  <div className={styles.panelQueueList}>
                    {[...queue].slice(0, 15).map((song, i) => (
                      <div
                        key={`pq-${i}`}
                        className={styles.panelQueueItem}
                        onClick={() => {
                          removeFromQueue(i);
                          playSong(song);
                        }}
                      >
                        <span className={styles.panelQueueIdx}>{i + 1}</span>
                        <img src={song.thumbnail || ''} alt="" className={styles.panelQueueThumb} />
                        <div className={styles.panelQueueInfo}>
                          <div className={styles.panelQueueSong}>{song.title}</div>
                          <div className={styles.panelQueueMeta}>{song.channel}</div>
                        </div>
                        <button
                          className={styles.panelQueueRemove}
                          onClick={e => { e.stopPropagation(); removeFromQueue(i); }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
