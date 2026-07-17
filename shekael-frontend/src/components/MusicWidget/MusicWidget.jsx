import { useRef, useState, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import { motion } from 'framer-motion';
import {
  Music, Play, Pause, SkipForward, SkipBack,
  Shuffle,
  X
} from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import styles from './MusicWidget.module.css';

export default function MusicWidget({ leftOffset = 24 }) {
  const {
    currentSong, playing, duration, currentTime, volume, muted,
    queue, shuffle, loadingStream,
    togglePlay, playNext, playPrev, setShuffle, seek,
    setVolume, setMuted, stop,
  } = useMusic();

  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  const panelRef = useRef(null);
  const contentRef = useRef(null);
  const buttonRef = useRef(null);

  // ── Animación entrada ──
  const animateIn = useCallback(() => {
    setShouldRender(true);
    requestAnimationFrame(() => {
      if (!panelRef.current) return;
      gsap.set(panelRef.current, {
        y: 36,
        scale: 0.85,
        rotate: -3,
        filter: 'blur(8px)',
        transformOrigin: 'bottom left',
      });
      gsap.to(panelRef.current, {
        y: 0,
        opacity: 1,
        scale: 1,
        rotate: 0,
        filter: 'blur(0px)',
        duration: 0.6,
        ease: 'back.out(1.7)',
        onStart: () => {
          if (contentRef.current) {
            gsap.fromTo(contentRef.current.children,
              { opacity: 0, y: 12 },
              { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, delay: 0.12, ease: 'power3.out' }
            );
          }
        }
      });
    });
  }, []);

  // ── Animación salida ──
  const animateOut = useCallback(() => {
    if (!panelRef.current) return;
    gsap.to(panelRef.current, {
      y: 24,
      opacity: 0,
      scale: 0.92,
      rotate: 2,
      filter: 'blur(6px)',
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => setShouldRender(false),
    });
  }, []);

  useEffect(() => {
    if (isExpanded) {
      animateIn();
    } else if (shouldRender) {
      animateOut();
    }
  }, [isExpanded, animateIn, animateOut, shouldRender]);

  // ── Click outside ──
  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded]);

  // ── Auto-minimizar si no hay canción ──
  useEffect(() => {
    if (!currentSong && isExpanded) {
      setIsExpanded(false);
    }
  }, [currentSong, isExpanded]);

  const toggleExpand = () => setIsExpanded(v => !v);

  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ── No mostrar nada si no hay canción reproduciéndose ──
  if (!currentSong) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={styles.floatingWrapper} style={{ left: leftOffset }}>
      {shouldRender && (
        <div ref={panelRef} className={styles.floatingPanel}>
          <div ref={contentRef} className={styles.panelContent}>
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <div className={styles.iconWrap}>
                  <Music size={14} />
                </div>
                <span className={styles.label}>Reproduciendo</span>
              </div>
              <button
                className={styles.closeBtn}
                onClick={(e) => { e.stopPropagation(); stop(); }}
                title="Cerrar"
              >
                <X size={13} />
              </button>
            </div>

            {/* Song info */}
            <div className={styles.songInfo}>
              <img
                src={currentSong.thumbnail || ''}
                alt=""
                className={styles.thumb}
              />
              <div className={styles.songText}>
                <div className={styles.songTitle}>{currentSong.title}</div>
                <div className={styles.songArtist}>{currentSong.channel}</div>
              </div>
            </div>

            {/* Mini seek */}
            <div
              className={styles.miniSeek}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                seek(pct);
              }}
            >
              <div className={styles.miniSeekTrack}>
                <div className={styles.miniSeekFill} style={{ width: `${progress}%` }} />
              </div>
            </div>

            {/* Controls */}
            <div className={styles.ctrls}>
              <button
                className={`${styles.ctrlBtn} ${shuffle ? styles.active : ''}`}
                onClick={() => setShuffle(v => !v)}
                title={shuffle ? 'Aleatorio ON' : 'Aleatorio OFF'}
              >
                <Shuffle size={14} />
              </button>
              <button className={styles.ctrlBtn} onClick={playPrev}>
                <SkipBack size={15} />
              </button>
              <button className={styles.playBtn} onClick={togglePlay} disabled={loadingStream}>
                {loadingStream
                  ? <span className={styles.spinner} />
                  : (playing ? <Pause size={18} /> : <Play size={18} />)
                }
              </button>
              <button className={styles.ctrlBtn} onClick={playNext} disabled={!queue.length}>
                <SkipForward size={15} />
              </button>
              <button className={styles.ctrlBtn} disabled style={{ visibility: 'hidden' }}>
                <Shuffle size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <motion.button
        ref={buttonRef}
        className={`${styles.floatingBtn} ${isExpanded ? styles.active : ''}`}
        onClick={toggleExpand}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Music size={14} />
        {playing ? (
          <span className={styles.floatText}>
            {currentSong.title.length > 18
              ? currentSong.title.slice(0, 18) + '…'
              : currentSong.title
            }
          </span>
        ) : (
          <span className={styles.floatText}>Pausado</span>
        )}
      </motion.button>
    </div>
  );
}
