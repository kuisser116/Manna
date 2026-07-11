import { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import PostCard from '../components/PostCard/PostCard';
import useStore from '../store';
import useFeed from '../hooks/useFeed';
import { markPostAsSeen } from '../api/posts.api';
import styles from '../styles/pages/Feed.module.css';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';
import logoImg from '../assets/personaje_1.12.png';

const TYPE_MAP = {
  image: 'image',
  video: 'video',
  text: 'micro-text',
};

const FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'image', label: 'Imágenes' },
  { id: 'video', label: 'Videos' },
  { id: 'text', label: 'Texto' },
  { id: 'supported', label: 'Más apoyados' },
  { id: 'recent', label: 'Recientes' },
  { id: 'following', label: 'Siguiendo' },
];

export default function Feed() {
  const { t } = useTranslation();
  const { posts, feedLoading, feedError, token, activeFilter, setActiveFilter } = useStore();
  const { fetchFeed, loadMore, hasMore, loadingMore } = useFeed();

  useEffect(() => {
    if (token) fetchFeed();
  }, [token]);

  // ── Scroll infinito ──
  const scrollLockRef = useRef(false);
  const handleScroll = useCallback(() => {
    if (scrollLockRef.current) return;
    scrollLockRef.current = true;

    requestAnimationFrame(() => {
      const threshold = 1000;
      const scrollBottom = window.innerHeight + window.scrollY;
      const docHeight = document.documentElement.offsetHeight;

      if (scrollBottom >= docHeight - threshold) {
        loadMore();
      }
      scrollLockRef.current = false;
    });
  }, [loadMore]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // ── IntersectionObserver: marcar posts como vistos ──
  const seenQueueRef = useRef(new Set());
  const seenTimerRef = useRef(null);

  const handlePostVisible = useCallback((postId) => {
    if (!postId || seenQueueRef.current.has(postId)) return;
    seenQueueRef.current.add(postId);

    // Batch: enviar después de 2s sin nuevas visibilidades
    if (seenTimerRef.current) clearTimeout(seenTimerRef.current);
    seenTimerRef.current = setTimeout(() => {
      const batch = Array.from(seenQueueRef.current);
      seenQueueRef.current.clear();
      batch.forEach((id) => {
        markPostAsSeen(id).catch(() => {});
      });
    }, 2000);
  }, []);

  // Observer por post
  const observerRef = useRef(null);
  const postRefCallback = useCallback((node, postId) => {
    if (!node) return;
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const id = entry.target.dataset.postId;
              if (id) handlePostVisible(id);
            }
          });
        },
        { threshold: 0.3, rootMargin: '0px 0px -100px 0px' }
      );
    }
    node.dataset.postId = postId;
    observerRef.current.observe(node);
  }, [handlePostVisible]);

  // ── Filtrar posts ──
  const filteredPosts = posts.filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'supported') return true;
    if (activeFilter === 'recent') {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return new Date(item.created_at) > yesterday;
    }
    if (activeFilter === 'following') return item.isFollowing === true;
    const mapped = TYPE_MAP[activeFilter];
    return mapped ? item.type === mapped : true;
  });

  const displayPosts = activeFilter === 'supported'
    ? [...filteredPosts].sort((a, b) => {
      const scoreA = (a.likes_count || 0) + (a.video_view_count || 0);
      const scoreB = (b.likes_count || 0) + (b.video_view_count || 0);
      return scoreB - scoreA;
    })
    : filteredPosts;

  // Separar en Nuevos (unseen) y Anteriores (seen)
  const unseenPosts = displayPosts.filter(p => !p.seen_at);
  const seenPosts = displayPosts.filter(p => p.seen_at);

  // ── Render ──
  const renderPostList = (postList, showLabel = false, label = '') => (
    <>
      {showLabel && postList.length > 0 && (
        <div className={styles.sectionLabel}>{label}</div>
      )}
      {postList.map((item) => (
        <div key={item.id} ref={(node) => { if (!item.seen_at) postRefCallback(node, item.id); }}>
          <PostCard post={item} />
        </div>
      ))}
    </>
  );

  return (
    <div className={styles.layout} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
      <div className={styles.main}>
        {feedError && (
          <div className={styles.errorBanner}>
            ⚠️ {feedError}
          </div>
        )}

        {/* Filter Bar */}
        <div className={styles.filterBar}>
          <div className={styles.filterTrack}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`${styles.filterChip} ${activeFilter === f.id ? styles.filterChipActive : ''}`}
                onClick={() => setActiveFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {feedLoading ? (
          <div className={styles.loadingList}>
            {[1, 2, 3].map((i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        ) : displayPosts.length === 0 ? (
          <div className={styles.emptyState}>
            <img src={logoImg} alt="Empty Feed" className={styles.emptyLogo} />
            <p>{t('feed.noPostsYet', 'Todavía no hay publicaciones.')}</p>
            <a href="/create" className={styles.createLink}>{t('feed.createPost', 'Crear publicación')}</a>
          </div>
        ) : (
          <div className={styles.postList}>
            {renderPostList(unseenPosts, true, '· Nuevo')}
            {renderPostList(seenPosts, unseenPosts.length > 0, '· Anterior')}

            {loadingMore && (
              <div className={styles.loadingMore}>
                <div className={styles.skeleton} />
              </div>
            )}
            {!hasMore && displayPosts.length > 0 && (
              <div className={styles.endMessage}>
                {seenPosts.length > 0 && unseenPosts.length === 0 ? (
                  <p>{t('feed.allSeen', 'Ya viste todo lo nuevo. Vuelve más tarde o cambia de filtro.')}</p>
                ) : (
                  <p>{t('feed.endOfFeed', 'Has llegado al final.')}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
