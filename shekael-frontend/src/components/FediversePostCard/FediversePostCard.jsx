import { Heart, Repeat2, MessageCircle, ExternalLink, Bookmark } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../store';
import { trackSignal } from '../../api/algorithm.api';
import styles from '../PostCard/PostCard.module.css';

const LANG_LABELS = {
  es: '🇪🇸', en: '🇬🇧', pt: '🇧🇷', fr: '🇫🇷',
  de: '🇩🇪', it: '🇮🇹', ja: '🇯🇵',
};

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

function timeAgo(dateStr) {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function extractInstanceDomain(instanceUrl) {
  if (!instanceUrl) return '';
  return instanceUrl.replace('https://', '');
}

export default function FediversePostCard({ post }) {
  const navigate = useNavigate();
  const { addToast } = useStore();
  const [imgError, setImgError] = useState(false);
  const langIcon = LANG_LABELS[post.language] || '🌐';

  const [fedSaved, setFedSaved] = useState(() => {
    try {
      const raw = localStorage.getItem('shekael_saved');
      if (raw) return JSON.parse(raw).includes(String(post.id));
    } catch {}
    return false;
  });

  const openDetail = useCallback(() => {
    const instanceDomain = extractInstanceDomain(post.instanceUrl);
    if (instanceDomain && post.id) {
      const fedId = `fed__${instanceDomain}__${post.id}`;
      navigate(`/post/${fedId}`, { state: { fedPost: post } });
    } else {
      window.open(post.url, '_blank', 'noopener,noreferrer');
    }
  }, [navigate, post]);

  const openOriginal = useCallback((e) => {
    if (e) e.stopPropagation();
    window.open(post.url, '_blank', 'noopener,noreferrer');
  }, [post.url]);

  const openFedProfile = useCallback((e) => {
    e.stopPropagation();
    // Usar el handle real: @usuario@instancia
    const handle = post.author?.handle || '';
    const match = handle.match(/^@?([\w.-]+)@(.+)$/);
    if (match) {
      const [, user, domain] = match;
      navigate(`/profile/fed__${encodeURIComponent(domain)}__${encodeURIComponent(user)}`);
    } else if (post.author?.url) {
      window.open(post.author.url, '_blank', 'noopener,noreferrer');
    }
  }, [navigate, post]);

  const handleAction = useCallback((e) => {
    e.stopPropagation();
    window.open(post.url, '_blank', 'noopener,noreferrer');
  }, [post.url]);

  const handleFedSave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const newSaved = !fedSaved;
    setFedSaved(newSaved);
    try {
      const raw = localStorage.getItem('shekael_saved');
      let ids = raw ? JSON.parse(raw) : [];
      if (newSaved) {
        if (!ids.includes(post.id)) ids.push(post.id);
      } else {
        ids = ids.filter(id => id !== post.id);
      }
      if (ids.length > 500) ids = ids.slice(-500);
      localStorage.setItem('shekael_saved', JSON.stringify(ids));
    } catch {}
    const instanceDomain = extractInstanceDomain(post.instanceUrl);
    const fedId = `fed__${instanceDomain}__${post.id}`;
    trackSignal(fedId, newSaved ? 'save' : 'view', 'fediverso');
  }, [post, fedSaved]);

  return (
    <article className={styles.card} onClick={openDetail} style={{ cursor: 'pointer' }}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div onClick={openFedProfile} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <img
            src={post.author?.avatar}
            alt=""
            className={styles.avatar}
            style={{ borderRadius: '50%', objectFit: 'cover', width: 42, height: 42 }}
            onError={e => { e.target.style.display = 'none'; }}
          />
          <div className={styles.meta}>
            <span className={styles.displayName}>
              {post.author?.displayName || post.author?.username}
              <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 6 }}>
                {langIcon} {post.instance}
              </span>
            </span>
          <span className={styles.dateText}>
            {post.author?.handle} · {timeAgo(post.createdAt)}
          </span>
        </div>
        </div>
        <span className={styles.typeBadge}>
          Fediverso
        </span>
      </div>

      {/* ── Body ── */}
      <div className={styles.body}>
        <p className={styles.textContent}>
          {stripHtml(post.content)}
        </p>

        {post.firstMedia?.type === 'image' && !imgError && (
          <img
            src={post.firstMedia.preview_url || post.firstMedia.url}
            alt={post.firstMedia.description || ''}
            className={styles.postImage}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}

        {post.firstMedia?.type === 'video' && (
          <div className={styles.postImage} style={{
            background: 'var(--color-surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 200, color: 'var(--color-text-dim)', fontSize: 14, gap: 8,
          }}>
            🎬 Video
            <ExternalLink size={14} />
            Ver en {post.instance}
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={handleAction}>
          <Heart size={16} /> {post.stats?.likes || 0}
        </button>
        <button className={styles.actionBtn} onClick={handleAction}>
          <MessageCircle size={16} /> {post.stats?.replies || 0}
        </button>
        <button className={styles.actionBtn} onClick={handleAction}>
          <Repeat2 size={16} /> {post.stats?.shares || 0}
        </button>
        <button
          className={styles.actionBtn}
          onClick={handleFedSave}
          title={fedSaved ? 'Guardado' : 'Guardar'}
        >
          <Bookmark size={16} fill={fedSaved ? 'var(--color-primary)' : 'none'} stroke={fedSaved ? 'var(--color-primary)' : 'currentColor'} />
        </button>
        <button
          className={`${styles.actionBtn} ${styles.saveBtn}`}
          onClick={openOriginal}
          title="Abrir en Mastodon"
        >
          <ExternalLink size={16} />
          Abrir
        </button>
      </div>

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10,
          fontSize: 12, color: 'var(--color-primary)',
        }}>
          {post.tags.slice(0, 6).map(t => (
            <span key={t} style={{ opacity: 0.7 }}>#{t}</span>
          ))}
        </div>
      )}
    </article>
  );
}
