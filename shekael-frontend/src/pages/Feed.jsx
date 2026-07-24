import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import PostCard from '../components/PostCard/PostCard';
import FediversePostCard from '../components/FediversePostCard/FediversePostCard';
import AdSlot, { shouldShowAd } from '../components/AdSlot/AdSlot';
import useStore from '../store';
import useFeed from '../hooks/useFeed';
import { FilesIcon } from 'lucide-react';
import styles from '../styles/pages/Feed.module.css';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const TYPE_MAP = {
  image: 'image',
  video: 'video',
  text: 'micro-text',
};

const USER_LANG = (() => {
  const nav = navigator.language || '';
  return nav.startsWith('es') ? 'es' : 'es';
})();

// ── Fetch federated timeline ──
async function fetchFedTimeline(offset = 0) {
  const token = localStorage.getItem('Shekael_token');
  const res = await fetch(
    `${API_URL}/federation/timeline?limit=20&offset=${offset}&lang=${USER_LANG}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.posts || [];
}

export default function Feed() {
  const { t } = useTranslation();
  const { posts, feedLoading, feedError, token, activeFilter } = useStore();
  const { fetchFeed, loadMore, hasMore, loadingMore } = useFeed();

  // ── Seen tracking con localStorage (persiste entre recargas) ──
  const [seenIds, setSeenIds] = useState(() => {
    try {
      const saved = localStorage.getItem('shekael_feed_seen');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const markSeen = useCallback((id) => {
    setSeenIds(prev => {
      const next = new Set(prev);
      next.add(String(id));
      try {
        const arr = Array.from(next);
        if (arr.length > 500) arr.splice(0, arr.length - 500);
        localStorage.setItem('shekael_feed_seen', JSON.stringify(arr));
      } catch { /* localStorage may be full */ }
      return new Set(arr);
    });
  }, []);

  const isSeen = useCallback((id) => seenIds.has(String(id)), [seenIds]);

  // ── Federated state ──
  const [fedPosts, setFedPosts] = useState([]);
  const [fedOffset, setFedOffset] = useState(0);
  const [fedHasMore, setFedHasMore] = useState(true);
  const [fedLoading, setFedLoading] = useState(false);
  const [fedError, setFedError] = useState(null);

  // ── IntersectionObserver para marcar vistos localmente ──
  const observerRef = useRef(null);
  const postRefCallback = useCallback((node, postId) => {
    if (!node) return;
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const id = entry.target.dataset.postId;
              if (id) markSeen(id);
            }
          });
        },
        { threshold: 0.3, rootMargin: '0px 0px -100px 0px' }
      );
    }
    node.dataset.postId = postId;
    observerRef.current.observe(node);
  }, [markSeen]);

  // ── Fetch local feed ──
  useEffect(() => {
    if (token) fetchFeed();
  }, [token, activeFilter]);

  // ── Fetch federated on mount ──
  useEffect(() => {
    if (!token) return;
    setFedLoading(true);
    setFedError(null);
    fetchFedTimeline(0)
      .then(fposts => {
        setFedPosts(fposts);
        setFedOffset(20);
        setFedHasMore(fposts.length >= 20);
        if (fposts.length === 0) setFedError('No hay contenido del Fediverso disponible ahora');
      })
      .catch(() => { setFedError('Error al conectar con el Fediverso'); })
      .finally(() => setFedLoading(false));
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
        if (hasMore) loadMore();
        else if (fedHasMore && !fedLoading) {
          setFedLoading(true);
          fetchFedTimeline(fedOffset).then(fposts => {
            if (fposts.length > 0) {
              setFedPosts(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const newPosts = fposts.filter(p => !existingIds.has(p.id));
                return [...prev, ...newPosts];
              });
              setFedOffset(prev => prev + fposts.length);
              setFedHasMore(fposts.length >= 20);
            } else setFedHasMore(false);
          }).catch(() => {}).finally(() => setFedLoading(false));
        }
      }
      scrollLockRef.current = false;
    });
  }, [loadMore, hasMore, fedHasMore, fedLoading, fedOffset]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // ── Filtrar locales según activeFilter + vistos ──
  const filteredLocal = useMemo(() => {
    return posts.filter((item) => {
      if (isSeen(item.id)) return false;

      if (activeFilter === 'all' || activeFilter === 'supported') return true;
      if (activeFilter === 'recent') {
        const yesterday = Date.now() - 86400000;
        return new Date(item.created_at).getTime() > yesterday;
      }
      if (activeFilter === 'following') return item.isFollowing === true;
      const mapped = TYPE_MAP[activeFilter];
      return mapped ? item.type === mapped : true;
    });
  }, [posts, activeFilter, isSeen]);

  // ── Filtrar federados según activeFilter ──
  const filteredFed = useMemo(() => {
    let f = fedPosts;

    if (activeFilter === 'image') f = f.filter(p => p.contentType === 'image');
    else if (activeFilter === 'video') f = f.filter(p => p.contentType === 'video');
    else if (activeFilter === 'text') f = f.filter(p => p.contentType === 'text' || !p.contentType);

    // Español primero
    f = [...f].sort((a, b) => {
      const aL = a.language === USER_LANG ? 1 : 0;
      const bL = b.language === USER_LANG ? 1 : 0;
      if (bL !== aL) return bL - aL;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return f;
  }, [fedPosts, activeFilter]);

  // ── Merge final según activeFilter ──
  const mergedFeed = useMemo(() => {
    if (activeFilter === 'following') {
      return filteredLocal.map(p => ({ type: 'local', post: p }));
    }

    if (activeFilter === 'supported') {
      const scored = [];
      for (const p of filteredLocal) scored.push({ type: 'local', post: p, score: (p.likes_count||0) + (p.video_view_count||0) });
      for (const p of filteredFed) scored.push({ type: 'fed', post: p, score: (p.stats?.likes||0) + (p.stats?.shares||0) });
      scored.sort((a, b) => b.score - a.score);
      return scored;
    }

    if (activeFilter === 'recent') {
      const all = [];
      for (const p of filteredLocal) all.push({ type: 'local', post: p, date: new Date(p.created_at).getTime() });
      for (const p of filteredFed) all.push({ type: 'fed', post: p, date: new Date(p.createdAt).getTime() });
      all.sort((a, b) => b.date - a.date);
      return all;
    }

    // 'all', 'image', 'video', 'text' → interleaving con prioridad idioma
    const localItems = filteredLocal.map(p => ({ type: 'local', post: p }));
    const fedItems = filteredFed.map(p => ({ type: 'fed', post: p }));

    let fedIdx = 0;
    const result = [];
    for (let i = 0; i < localItems.length; i++) {
      result.push(localItems[i]);
      if ((i + 1) % 4 === 0 && fedIdx < fedItems.length) result.push(fedItems[fedIdx++]);
    }
    while (fedIdx < fedItems.length) result.push(fedItems[fedIdx++]);

    return result;
  }, [filteredLocal, filteredFed, activeFilter]);

  const showEnd = !hasMore && !fedHasMore && !loadingMore;

  return (
    <div className={styles.layout} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
      <div className={styles.main}>
        {feedError && <div className={styles.errorBanner}>{feedError}</div>}
        {fedError && mergedFeed.length === 0 && <div className={styles.fedErrorBanner}>{fedError}</div>}

        {mergedFeed.length === 0 && (feedLoading || fedLoading || loadingMore) ? (
          <div className={styles.loadingList}>
            {[1, 2, 3].map(i => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : mergedFeed.length === 0 ? (
          <div className={styles.emptyState}>
            <FilesIcon size={32} className={styles.emptyIcon} />
            <p>{t('feed.noPostsYet', 'Aún no hay publicaciones.')}</p>
            <p className={styles.emptyHint}>
              Prueba el filtro &quot;Todo&quot; o cambia a &quot;Reciente&quot;
            </p>
            <a href="/create" className={styles.createLink}>
              + {t('feed.createPost', 'Crear publicación')}
            </a>
          </div>
        ) : (
          <div className={styles.postList}>
            {mergedFeed.map((item, index) => (
              <div key={item.type === 'local' ? `l-${item.post.id}` : `f-${item.post.id || index}`}>
                {shouldShowAd(index) && <AdSlot postIndex={index} source="feed" />}

                {item.type === 'local' ? (
                  <div ref={node => { if (node) postRefCallback(node, item.post.id); }}>
                    <PostCard post={item.post} />
                  </div>
                ) : (
                  <FediversePostCard post={item.post} />
                )}
              </div>
            ))}

            {(loadingMore || fedLoading) && (
              <div className={styles.loadingMore}><div className={styles.skeleton} /></div>
            )}

            {showEnd && !feedLoading && (
              <div className={styles.endMessage}>
                <p>{t('feed.endOfFeed', 'Has llegado al final.')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
