import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import PostCard from '../components/PostCard/PostCard';
import FediversePostCard from '../components/FediversePostCard/FediversePostCard';
import AdSlot, { shouldShowAd } from '../components/AdSlot/AdSlot';
import useStore from '../store';
import useFeed from '../hooks/useFeed';
import { markPostAsSeen } from '../api/posts.api';
import { FilesIcon } from 'lucide-react';
import styles from '../styles/pages/Feed.module.css';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const TYPE_MAP = {
  image: 'image',
  video: 'video',
  text: 'micro-text',
};

// ── Preferencia de idioma ──
const USER_LANG = (() => {
  const nav = navigator.language || '';
  return nav.startsWith('es') ? 'es' : 'es';
})();

const SEEN_FED_KEY = 'shekael_seen_fed';
function getSeenFed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_FED_KEY) || '[]'));
  } catch { return new Set(); }
}
function markSeenFed(id) {
  try {
    const s = getSeenFed();
    s.add(String(id));
    localStorage.setItem(SEEN_FED_KEY, JSON.stringify(Array.from(s).slice(-500)));
  } catch {}
}

// ── Stripear HTML ──
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<p>/gi, '').replace(/<\/p>/gi, ' ')
    .replace(/<a[^>]*>/gi, '').replace(/<\/a>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .trim();
}

// ── Fetch federated ──
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

  // Federated state
  const [fedPosts, setFedPosts] = useState([]);
  const [fedOffset, setFedOffset] = useState(0);
  const [fedHasMore, setFedHasMore] = useState(true);
  const [fedLoading, setFedLoading] = useState(false);
  const [fedError, setFedError] = useState(null);
  const seenFed = useRef(getSeenFed());

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

  // ── Scroll infinito (local + fed) ──
  const scrollLockRef = useRef(false);
  const handleScroll = useCallback(() => {
    if (scrollLockRef.current) return;
    scrollLockRef.current = true;

    requestAnimationFrame(() => {
      const threshold = 1000;
      const scrollBottom = window.innerHeight + window.scrollY;
      const docHeight = document.documentElement.offsetHeight;

      if (scrollBottom >= docHeight - threshold) {
        // Cargar más locales
        if (hasMore) {
          loadMore();
        }
        // Cargar más federados si no hay más locales
        else if (fedHasMore && !fedLoading) {
          setFedLoading(true);
          fetchFedTimeline(fedOffset).then(fposts => {
            if (fposts.length > 0) {
              setFedPosts(prev => [...prev, ...fposts]);
              setFedOffset(prev => prev + fposts.length);
              setFedHasMore(fposts.length >= 20);
            } else {
              setFedHasMore(false);
            }
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

  // ── Seen tracking (local) ──
  const seenQueueRef = useRef(new Set());
  const seenTimerRef = useRef(null);

  const handlePostVisible = useCallback((postId) => {
    if (!postId || seenQueueRef.current.has(postId)) return;
    seenQueueRef.current.add(postId);
    if (seenTimerRef.current) clearTimeout(seenTimerRef.current);
    seenTimerRef.current = setTimeout(() => {
      const batch = Array.from(seenQueueRef.current);
      seenQueueRef.current.clear();
      batch.forEach((id) => markPostAsSeen(id).catch(() => {}));
    }, 2000);
  }, []);

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

  // ── Filtrar posts locales según activeFilter ──
  const filteredLocal = useMemo(() => {
    return posts.filter((item) => {
      if (activeFilter === 'all' || activeFilter === 'supported') return true;
      if (activeFilter === 'recent') {
        const yesterday = Date.now() - 86400000;
        return new Date(item.created_at).getTime() > yesterday;
      }
      if (activeFilter === 'following') return item.isFollowing === true;
      const mapped = TYPE_MAP[activeFilter];
      return mapped ? item.type === mapped : true;
    });
  }, [posts, activeFilter]);

  // ── Filtrar federados según activeFilter ──
  const filteredFed = useMemo(() => {
    let fposts = fedPosts;

    // Filtrar por tipo
    if (activeFilter === 'image') fposts = fposts.filter(p => p.contentType === 'image');
    else if (activeFilter === 'video') fposts = fposts.filter(p => p.contentType === 'video');
    else if (activeFilter === 'text') fposts = fposts.filter(p => p.contentType === 'text' || !p.contentType);

    // Excluir ya vistos
    if (activeFilter !== 'supported') {
      fposts = fposts.filter(p => !seenFed.current.has(String(p.id)));
    }

    // Lenguaje: español primero
    fposts = [...fposts].sort((a, b) => {
      const aLang = a.language === USER_LANG ? 1 : 0;
      const bLang = b.language === USER_LANG ? 1 : 0;
      if (bLang !== aLang) return bLang - aLang;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return fposts;
  }, [fedPosts, activeFilter]);

  // ── Merge final ──
  const mergedFeed = useMemo(() => {
    if (activeFilter === 'following') {
      // Solo seguidos locales
      return filteredLocal.map(p => ({ type: 'local', post: p }));
    }

    if (activeFilter === 'supported') {
      // Popular: mezclar por engagement
      const scored = [];
      for (const p of filteredLocal) {
        scored.push({ type: 'local', post: p, score: (p.likes_count||0) + (p.video_view_count||0) });
      }
      for (const p of filteredFed) {
        scored.push({ type: 'fed', post: p, score: (p.stats?.likes||0) + (p.stats?.shares||0) });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored;
    }

    if (activeFilter === 'recent') {
      // Cronológico
      const all = [];
      for (const p of filteredLocal) all.push({ type: 'local', post: p, date: new Date(p.created_at).getTime() });
      for (const p of filteredFed) all.push({ type: 'fed', post: p, date: new Date(p.createdAt).getTime() });
      all.sort((a, b) => b.date - a.date);
      return all;
    }

    // 'all', 'image', 'video', 'text' → mezcla con interleaving
    const localItems = filteredLocal.map(p => ({ type: 'local', post: p }));
    const fedItems = filteredFed.map(p => ({ type: 'fed', post: p }));

    // Interleaving: cada 4 locales, 1 federado
    let fedIdx = 0;
    const result = [];
    for (let i = 0; i < localItems.length; i++) {
      result.push(localItems[i]);
      if ((i + 1) % 4 === 0 && fedIdx < fedItems.length) {
        result.push(fedItems[fedIdx++]);
      }
    }
    // Federados restantes al final
    while (fedIdx < fedItems.length) result.push(fedItems[fedIdx++]);

    return result;
  }, [filteredLocal, filteredFed, activeFilter]);

  // ── Dividir en no-leídos / leídos (para labels) ──
  const unseenLocal = filteredLocal.filter(p => !p.seen_at);
  const hasUnseen = unseenLocal.length > 0;

  // Marcar federados como vistos al renderizar
  useEffect(() => {
    for (const item of mergedFeed) {
      if (item.type === 'fed') markSeenFed(item.post.id);
    }
  }, [mergedFeed]);

  const showEnd = !hasMore && !fedHasMore && !loadingMore;

  return (
    <div className={styles.layout} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
      <div className={styles.main}>
        {feedError && (
          <div className={styles.errorBanner}>{feedError}</div>
        )}
        {fedError && mergedFeed.length === 0 && (
          <div className={styles.fedErrorBanner}>{fedError}</div>
        )}

        {mergedFeed.length === 0 && (feedLoading || fedLoading || loadingMore) ? (
          <div className={styles.loadingList}>
            {[1, 2, 3].map((i) => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : mergedFeed.length === 0 ? (
          <div className={styles.emptyState}>
            <FilesIcon size={32} className={styles.emptyIcon} />
            <p>{t('feed.noPostsYet', 'Aún no hay publicaciones.')}</p>
            <p className={styles.emptyHint}>
              Prueba el filtro "Todo" o cambia a "Reciente"
            </p>
            <a href="/create" className={styles.createLink}>
              + {t('feed.createPost', 'Crear publicación')}
            </a>
          </div>
        ) : (
          <div className={styles.postList}>
            {hasUnseen && <div className={styles.sectionLabel}>· Nuevo</div>}

            {mergedFeed.map((item, index) => (
              <div key={item.type === 'local' ? `l-${item.post.id}` : `f-${item.post.id || index}`}>
                {/* Label 'Anterior' al pasar de no-leídos a leídos */}
                {hasUnseen && item.type === 'local' && item.post.seen_at && (
                  (index === 0 || (mergedFeed[index - 1]?.type === 'local' && !mergedFeed[index - 1]?.post?.seen_at))
                ) && <div className={styles.sectionLabel}>· Anterior</div>}

                {shouldShowAd(index) && <AdSlot postIndex={index} source="feed" />}

                {item.type === 'local' ? (
                  <div ref={(node) => { if (!item.post.seen_at) postRefCallback(node, item.post.id); }}>
                    <PostCard post={item.post} />
                  </div>
                ) : (
                  <FediversePostCard post={item.post} />
                )}
              </div>
            ))}

            {(loadingMore || fedLoading) && (
              <div className={styles.loadingMore}>
                <div className={styles.skeleton} />
              </div>
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
