import { ExternalLink, Heart, Repeat2, MessageCircle, Globe, MapPin } from 'lucide-react';
import styles from './FederatedFeed.module.css';

const LANG_LABELS = {
  es: '🇪🇸',
  en: '🇬🇧',
  pt: '🇧🇷',
  fr: '🇫🇷',
  de: '🇩🇪',
  it: '🇮🇹',
  ja: '🇯🇵',
};

/**
 * Stripear HTML manteniendo saltos de línea
 */
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

function truncate(text, max = 300) {
  if (!text || text.length <= max) return text;
  return text.substring(0, max) + '...';
}

export default function FederatedCard({ post }) {
  const langIcon = LANG_LABELS[post.language] || '🌐';

  return (
    <article className={styles.fedPost}>
      {/* Author */}
      <div className={styles.postAuthor}>
        <img
          src={post.author?.avatar}
          alt={post.author?.displayName}
          className={styles.authorAvatar}
          onError={e => {
            e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%236366f1"/></svg>';
          }}
        />
        <div className={styles.authorInfo}>
          <span className={styles.authorName}>
            {post.author?.displayName || post.author?.username}
          </span>
          <span className={styles.authorHandle}>
            {post.author?.handle}
          </span>
        </div>
        <div className={styles.fedRight}>
          <span className={styles.langBadge} title={post.language}>
            {langIcon}
          </span>
          <span className={styles.instanceBadge}>
            {post.instance}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className={styles.postContent}>
        <p className={styles.postText}>
          {truncate(stripHtml(post.content), 300)}
        </p>
      </div>

      {/* Media */}
      {post.firstMedia && post.contentType === 'image' && (
        <div className={styles.postMedia}>
          <img
            src={post.firstMedia.preview_url || post.firstMedia.url}
            alt={post.firstMedia.description || ''}
            className={styles.mediaImage}
            loading="lazy"
            onError={e => { e.target.style.display = 'none'; }}
          />
        </div>
      )}

      {post.firstMedia && post.contentType === 'video' && (
        <div className={styles.postMedia}>
          <div className={styles.videoPlaceholder}>
            🎬 Video — Ver en {post.instance}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className={styles.postStats}>
        <span className={styles.statItem}>
          <Heart size={14} /> {post.stats?.likes || 0}
        </span>
        <span className={styles.statItem}>
          <Repeat2 size={14} /> {post.stats?.shares || 0}
        </span>
        <span className={styles.statItem}>
          <MessageCircle size={14} /> {post.stats?.replies || 0}
        </span>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.viewOriginal}
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink size={14} />
          Original
        </a>
      </div>

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className={styles.postTags}>
          {post.tags.slice(0, 5).map(tag => (
            <span key={tag} className={styles.tag}>#{tag}</span>
          ))}
        </div>
      )}
    </article>
  );
}
