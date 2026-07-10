import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import PostCard from '../components/PostCard/PostCard';
import useStore from '../store';
import useFeed from '../hooks/useFeed';
import styles from '../styles/pages/Feed.module.css';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';
import logoImg from '../assets/personaje_1.12.png';

const FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'image', label: 'Imágenes' },
  { id: 'video', label: 'Videos' },
  { id: 'text', label: 'Texto' },
  { id: 'supported', label: 'Más apoyados' },
  { id: 'recent', label: 'Recientes' },
  { id: 'following', label: 'Siguiendo' },
];

const TYPE_MAP = {
  image: 'image',
  video: 'video',
  text: 'micro-text',
};

export default function Feed() {
  const { t } = useTranslation();
  const {
    posts, feedLoading, feedError, token,
    feedScrollPosition, setFeedScrollPosition
  } = useStore();
  const { fetchFeed, loadMore, hasMore } = useFeed();
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    if (token) fetchFeed();
  }, [token]);

  useEffect(() => {
    if (!feedLoading && posts.length > 0 && feedScrollPosition > 0) {
      window.scrollTo(0, feedScrollPosition);
    }
  }, [feedLoading, posts.length, feedScrollPosition]);

  useEffect(() => {
    const handleScroll = () => {
      const threshold = 1000;
      const currentScroll = window.innerHeight + document.documentElement.scrollTop;
      const documentHeight = document.documentElement.offsetHeight;

      if (currentScroll >= documentHeight - threshold) {
        loadMore();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMore]);

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
      <main className={styles.main}>
        <div className={styles.filterWrap}>
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
          <motion.div className={styles.postList} layout>
            {displayPosts.map((item, i) => {
              const isExistingPost = i < displayPosts.length - 3;

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={isExistingPost ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: isExistingPost ? 0 : i * 0.05 }}
                >
                  <PostCard post={item} />
                </motion.div>
              );
            })}
            {!hasMore && displayPosts.length > 0 && (
              <div className={styles.endMessage}>
                <p>{t('feed.endOfFeed', 'Has llegado al final.')}</p>
              </div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}
