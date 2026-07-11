import { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import PostCard from '../components/PostCard/PostCard';
import useStore from '../store';
import useFeed from '../hooks/useFeed';
import styles from '../styles/pages/Feed.module.css';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';
import logoImg from '../assets/personaje_1.12.png';

const TYPE_MAP = {
  image: 'image',
  video: 'video',
  text: 'micro-text',
};

export default function Feed() {
  const { t } = useTranslation();
  const { posts, feedLoading, feedError, token, activeFilter } = useStore();
  const { fetchFeed, loadMore, hasMore, loadingMore } = useFeed();

  useEffect(() => {
    if (token) fetchFeed();
  }, [token]);

  // Scroll infinito — throttle con RAF, sin framer-motion
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

  return (
    <div className={styles.layout} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
      <div className={styles.main}>
        {feedError && (
          <div className={styles.errorBanner}>
            ⚠️ {feedError}
          </div>
        )}

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
            {displayPosts.map((item) => (
              <div key={item.id}>
                <PostCard post={item} />
              </div>
            ))}
            {loadingMore && (
              <div className={styles.loadingMore}>
                <div className={styles.skeleton} />
              </div>
            )}
            {!hasMore && displayPosts.length > 0 && (
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
