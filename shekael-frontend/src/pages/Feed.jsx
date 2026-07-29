import { useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import PostCard from '../components/PostCard/PostCard';
import useStore from '../store';
import useFeed from '../hooks/useFeed';
import { FilesIcon } from 'lucide-react';
import styles from '../styles/pages/Feed.module.css';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';

export default function Feed() {
  const { t } = useTranslation();
  const { posts, feedLoading, feedError } = useStore();
  const { fetchFeed, loadMore, hasMore, loadingMore } = useFeed();
  const loaded = useRef(false);
  const sentinelRef = useRef(null);

  // ── Carga inicial ──
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    fetchFeed();
  }, [fetchFeed]);

  // ── Sorted cronológico ──
  const sortedPosts = useMemo(() => {
    return [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [posts]);

  // ── IntersectionObserver — carga más ANTES de llegar al final ──
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting && hasMore && !loadingMore) {
            loadMore();
          }
        }
      },
      { rootMargin: '0px 0px 1000px 0px' } // 1000px antes del final, como YouTube
    );

    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  // ── Loading ──
  if (feedLoading && sortedPosts.length === 0) {
    return (
      <div className={styles.layout} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
        <div className={styles.main}>
          <div className={styles.skeletonList}>
            {[1, 2, 3].map(i => <div key={i} className={styles.skeleton} />)}
          </div>
        </div>
      </div>
    );
  }

  if (sortedPosts.length === 0) {
    return (
      <div className={styles.layout} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
        <div className={styles.main}>
          <div className={styles.emptyState}>
            <FilesIcon size={32} className={styles.emptyIcon} />
            <p>{t('feed.noPostsYet', 'Aún no hay publicaciones.')}</p>
            <a href="/create" className={styles.createLink}>+ {t('feed.createPost', 'Crear publicación')}</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layout} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
      <div className={styles.main}>
        {feedError && <div className={styles.errorBanner}>{feedError}</div>}
        {sortedPosts.map(post => (
          <PostCard key={post.id} post={post} />
        ))}
        {loadingMore && (
          <div className={styles.skeletonList}>
            {[1, 2].map(i => <div key={i} className={styles.skeleton} />)}
          </div>
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>
    </div>
  );
}
