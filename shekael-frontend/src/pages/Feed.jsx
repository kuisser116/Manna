import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import PostCard from '../components/PostCard/PostCard';
import AdSlot, { shouldShowAd } from '../components/AdSlot/AdSlot';
import FederatedCard from '../components/FederatedFeed/FederatedCard';
import useStore from '../store';
import useFeed from '../hooks/useFeed';
import { markPostAsSeen } from '../api/posts.api';
import styles from '../styles/pages/Feed.module.css';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';
import logoImg from '../assets/personaje_1.12.png';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const TYPE_MAP = {
  image: 'image',
  video: 'video',
  text: 'micro-text',
};

// ── Filtros del feed ──
const FILTERS = [
  { key: 'forYou', label: 'Para ti' },
  { key: 'following', label: 'Siguiendo' },
  { key: 'trending', label: 'Tendencias' },
  { key: 'recent', label: 'Reciente' },
];

// ── Detectar idioma preferido del usuario ──
function getUserLang() {
  const stored = localStorage.getItem('preferred_lang');
  if (stored) return stored;
  // Detectar del navegador
  const navLang = navigator.language || '';
  if (navLang.startsWith('es')) return 'es';
  return 'es'; // Default: español para Shekael
}

// ── Stripear HTML (para federated posts) ──
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, ' ')
    .replace(/<a[^>]*>/gi, '')
    .replace(/<\/a>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .trim();
}

// ── Determinar prioridad de idioma ──
function langPriority(lang, userLang) {
  if (!lang) return 0;
  if (lang === userLang) return 3;
  if (lang === 'en') return 1;
  return 0;
}

// ── Truncar texto para federated posts ──
function truncate(text, max = 200) {
  if (!text || text.length <= max) return text;
  return text.substring(0, max) + '...';
}

export default function Feed() {
  const { t } = useTranslation();
  const { posts, feedLoading, feedError, token, activeFilter } = useStore();
  const { fetchFeed, loadMore, hasMore, loadingMore } = useFeed();

  // Estado del filtro principal
  const [feedFilter, setFeedFilter] = useState('forYou');

  // Estado para posts federados
  const [fedPosts, setFedPosts] = useState([]);
  const [fedLoading, setFedLoading] = useState(false);

  // Idioma del usuario
  const userLang = useMemo(() => getUserLang(), []);

  // ── Fetch inicial ──
  useEffect(() => {
    if (token) fetchFeed();
  }, [token, activeFilter]);

  // ── Fetch federado cuando cambia el filtro ──
  useEffect(() => {
    if (!token) return;
    if (feedFilter === 'following') {
      setFedPosts([]);
      return; // No necesita federados
    }

    setFedLoading(true);
    const limit = feedFilter === 'trending' ? 30 : 20;
    const endpoint = feedFilter === 'trending'
      ? `${API_URL}/federation/trending?limit=${limit}&lang=${userLang}`
      : `${API_URL}/federation/timeline?limit=${limit}&lang=${userLang}`;

    fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        setFedPosts(data.posts || []);
      })
      .catch(() => {
        setFedPosts([]);
      })
      .finally(() => setFedLoading(false));
  }, [feedFilter, token, userLang]);

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

    if (seenTimerRef.current) clearTimeout(seenTimerRef.current);
    seenTimerRef.current = setTimeout(() => {
      const batch = Array.from(seenQueueRef.current);
      seenQueueRef.current.clear();
      batch.forEach((id) => {
        markPostAsSeen(id).catch(() => {});
      });
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

  // ── Filtrar posts locales ──
  const filteredLocalPosts = useMemo(() => {
    return posts.filter((item) => {
      // Filtro local según pestaña activa del store
      if (activeFilter === 'all') return true;
      if (activeFilter === 'supported') return true;
      if (activeFilter === 'recent') {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return new Date(item.created_at) > yesterday;
      }
      if (feedFilter === 'following') return item.isFollowing === true;
      if (activeFilter === 'following') return item.isFollowing === true;
      const mapped = TYPE_MAP[activeFilter];
      return mapped ? item.type === mapped : true;
    });
  }, [posts, activeFilter, feedFilter]);

  // ── Merge local + federated según filtro activo ──
  const mergedFeed = useMemo(() => {
    if (feedFilter === 'following') {
      // Solo posts de seguidos — sin federados
      return filteredLocalPosts.map(p => ({ type: 'local', post: p }));
    }

    if (feedFilter === 'trending') {
      // Tendencia: mezclar por engagement
      const scored = [];

      for (const p of filteredLocalPosts) {
        const score = (p.likes_count || 0) + (p.video_view_count || 0);
        scored.push({ type: 'local', post: p, score });
      }

      for (const p of fedPosts) {
        const score = (p.stats?.likes || 0) + (p.stats?.shares || 0);
        scored.push({ type: 'fed', post: p, score });
      }

      scored.sort((a, b) => b.score - a.score);
      return scored;
    }

    if (feedFilter === 'recent') {
      // Reciente: todos cronológico
      const combined = [];

      for (const p of filteredLocalPosts) {
        combined.push({ type: 'local', post: p, date: new Date(p.created_at).getTime() });
      }
      for (const p of fedPosts) {
        combined.push({ type: 'fed', post: p, date: new Date(p.createdAt).getTime() });
      }

      combined.sort((a, b) => b.date - a.date);
      return combined;
    }

    // ── "Para ti" (default): feed inteligente ──
    const result = [];

    // 1. Posts locales (siempre primero)
    for (const p of filteredLocalPosts) {
      result.push({ type: 'local', post: p });
    }

    // 2. Intercalar federados con prioridad de idioma
    const sortedFed = [...fedPosts].sort((a, b) => {
      const aLang = langPriority(a.language, userLang);
      const bLang = langPriority(b.language, userLang);
      if (bLang !== aLang) return bLang - aLang;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Interleaving: cada 4 posts locales, insertar 1 federado
    let fedIdx = 0;
    const final = [];
    for (let i = 0; i < result.length; i++) {
      final.push(result[i]);
      // Insertar federado cada 4 locales (si quedan)
      if ((i + 1) % 4 === 0 && fedIdx < sortedFed.length) {
        final.push({ type: 'fed', post: sortedFed[fedIdx++] });
      }
    }
    // Agregar federados restantes al final
    while (fedIdx < sortedFed.length) {
      final.push({ type: 'fed', post: sortedFed[fedIdx++] });
    }

    return final;
  }, [filteredLocalPosts, fedPosts, feedFilter, userLang]);

  // ── Posts sin leer / leídos (solo para locales) ──
  const unseenPosts = filteredLocalPosts.filter(p => !p.seen_at);
  const seenPosts = filteredLocalPosts.filter(p => p.seen_at);

  return (
    <div className={styles.layout} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
      <div className={styles.main}>
        {/* ── Filter Pills ── */}
        <div className={styles.filterTrack}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`${styles.filterChip} ${feedFilter === f.key ? styles.filterChipActive : ''}`}
              onClick={() => setFeedFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Error ── */}
        {feedError && (
          <div className={styles.errorBanner}>
            {feedError}
          </div>
        )}

        {/* ── Loading ── */}
        {feedLoading ? (
          <div className={styles.loadingList}>
            {[1, 2, 3].map((i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        ) : mergedFeed.length === 0 && !fedLoading ? (
          <div className={styles.emptyState}>
            <img src={logoImg} alt="Empty Feed" className={styles.emptyLogo} />
            <p>{t('feed.noPostsYet', 'Todavía no hay publicaciones.')}</p>
            <a href="/create" className={styles.createLink}>{t('feed.createPost', 'Crear publicación')}</a>
          </div>
        ) : (
          <div className={styles.postList}>
            {/* Sección "Nuevo" solo en modo Para ti con posts sin leer */}
            {feedFilter === 'forYou' && unseenPosts.length > 0 && (
              <div className={styles.sectionLabel}>· Nuevo</div>
            )}

            {mergedFeed.map((item, index) => (
              <div key={item.type === 'local' ? `local-${item.post.id}` : `fed-${item.post.id || index}`}>
                {/* Para ti: mostrar label "Anterior" después de los no leídos */}
                {feedFilter === 'forYou' && item.type === 'local' && item.post.seen_at && unseenPosts.length > 0 && (
                  index === 0 || (mergedFeed[index - 1]?.type === 'local' && !mergedFeed[index - 1]?.post?.seen_at)
                ) && (
                  <div className={styles.sectionLabel}>· Anterior</div>
                )}

                {/* Anuncios intercalados */}
                {shouldShowAd(index) && (
                  <AdSlot postIndex={index} source="feed" />
                )}

                {/* Post local */}
                {item.type === 'local' && (
                  <div ref={(node) => { if (!item.post.seen_at) postRefCallback(node, item.post.id); }}>
                    <PostCard post={item.post} />
                  </div>
                )}

                {/* Post federado */}
                {item.type === 'fed' && (
                  <FederatedCard post={item.post} />
                )}
              </div>
            ))}

            {loadingMore && (
              <div className={styles.loadingMore}>
                <div className={styles.skeleton} />
              </div>
            )}
            {!hasMore && mergedFeed.length > 0 && (
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
