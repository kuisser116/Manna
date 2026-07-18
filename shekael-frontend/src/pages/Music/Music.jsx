import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import gsap from 'gsap';
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [showQueue, setShowQueue] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const sentinelRef = useRef(null);

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

  // ── Búsqueda inicial (cuando cambia el query) ──
  useEffect(() => {
    if (q) {
      setLoading(true);
      setError('');
      setPage(1);
      setResults([]);
      // Cargar más resultados de golpe para evitar huecos
      searchMusic(q, 40, 1).then(data => {
        const list = data.results || [];
        setResults(list);
        setHasMore(data.hasMore || false);
        if (!list.length) setError('Sin resultados');
        // Precargar página 2 inmediatamente
        if (data.hasMore) {
          searchMusic(q, 40, 2).then(d2 => {
            const more = d2.results || [];
            if (more.length) {
              requestAnimationFrame(() => {
                setResults(prev => [...prev, ...more]);
                setPage(2);
              });
            }
            setHasMore(d2.hasMore || false);
          }).catch(() => {});
        }
      }).catch(() => setError('Error al buscar'))
      .finally(() => setLoading(false));
    } else {
      setResults([]);
      setHasMore(false);
    }
  }, [q]);

  // ── Cargar más resultados (sin bloquear) ──
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const data = await searchMusic(q, 40, nextPage);
      const list = data.results || [];
      if (list.length) {
        // Usar rAF para no bloquear el frame actual
        requestAnimationFrame(() => {
          setResults(prev => [...prev, ...list]);
          setPage(nextPage);
        });
      }
      setHasMore(data.hasMore || false);
    } catch {}
    // Delay para evitar múltiples cargas simultáneas
    setTimeout(() => setLoadingMore(false), 200);
  }, [q, page, hasMore, loadingMore]);

  // ── IntersectionObserver para scroll infinito ──
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { rootMargin: '3000px' });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  // ── Stagger de entrada (solo items nuevos) ──
  const prevLenRef = useRef(0);
  useEffect(() => {
    const len = results.length;
    if (len === 0) { prevLenRef.current = 0; return; }

    const items = listRef.current?.children;
    if (!items || items.length === 0) return;

    const prevLen = prevLenRef.current;
    const newItems = Array.from(items).slice(prevLen);
    prevLenRef.current = len;

    if (newItems.length === 0) return;

    if (prevLen === 0) {
      // Primera carga: animación de entrada con stagger
      gsap.set(newItems, { opacity: 0, y: 12 });
      gsap.to(newItems, {
        opacity: 1, y: 0, duration: 0.35,
        stagger: { amount: 0.4, from: 'start' },
        ease: 'power3.out'
      });
    } else {
      // Cargas posteriores: aparecen sin animación (ya están bajo el fold)
      gsap.set(newItems, { opacity: 1, y: 0 });
    }
  }, [results]);

  // ── Smooth scroll + Parallax por columnas (todo en un loop) ──
  const colsRef = useRef([]);
  const movesRef = useRef([-2000, -1000, -500, -2000, -1000]);

  useEffect(() => {
    if (!q) return;
    let target = window.scrollY;
    let current = window.scrollY;
    let raf = null;
    const lerp = 0.009;

    // Recolectar columnas en cada tick
    const updateCols = () => {
      const items = listRef.current?.children;
      if (!items) return;
      const cols = [[], [], [], [], []];
      Array.from(items).forEach((el, i) => cols[i % 5].push(el));
      colsRef.current = cols;
    };
    updateCols();

    // Posición inicial del parallax acorde al scroll actual
    const pageH = () => document.documentElement.scrollHeight - window.innerHeight;
    const pct = pageH() > 0 ? current / pageH() : 0;
    const cols = colsRef.current;
    cols.forEach((group, idx) => {
      gsap.set(group, { y: movesRef.current[idx] * pct, overwrite: 'auto' });
    });

    const onWheel = (e) => {
      const panel = e.target.closest('[class*="panel"]');
      if (panel) return;
      e.preventDefault();
      target += e.deltaY;
      target = Math.max(0, Math.min(target, pageH()));

      if (!raf) {
        const tick = () => {
          current += (target - current) * lerp;
          if (Math.abs(current - target) < 0.5) {
            current = target;
            raf = null;
            window.scroll(0, Math.round(current));
            return;
          }
          window.scroll(0, Math.round(current));

          // Parallax: actualizar posición en cada frame
          const ph = pageH();
          if (ph > 0) {
            const p = current / ph;
            const c = colsRef.current;
            c.forEach((group, idx) => {
              gsap.set(group, { y: movesRef.current[idx] * p, overwrite: 'auto' });
            });
          }

          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.removeEventListener('wheel', onWheel);
      if (raf) cancelAnimationFrame(raf);
      window.scroll(0, Math.round(current));
    };
  }, [q]);

  // ── Recalcular columnas cuando cambian los resultados ──
  useEffect(() => {
    const items = listRef.current?.children;
    if (!items || items.length === 0) return;
    const cols = [[], [], [], [], []];
    Array.from(items).forEach((el, i) => cols[i % 5].push(el));
    colsRef.current = cols;

    // Posición actual del parallax
    const currentY = window.scrollY;
    const ph = document.documentElement.scrollHeight - window.innerHeight;
    const pct = ph > 0 ? currentY / ph : 0;
    cols.forEach((group, idx) => {
      gsap.set(group, { y: movesRef.current[idx] * pct, overwrite: 'auto' });
    });
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
        {hasMore && <div ref={sentinelRef} className={styles.sentinel} />}
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
