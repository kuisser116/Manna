import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, MessageCircle, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import layoutStyles from '../styles/pages/PostDetail.module.css';
import detailStyles from '../components/TextDetailLayout/TextDetailLayout.module.css';

const API_URL = import.meta.env.VITE_API_URL || location.origin;

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

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export default function FediversePostDetailHandler({ id }) {
  const navigate = useNavigate();

  // Parse: fed__instanceDomain__postId
  const parts = id.replace('fed__', '').split('__');
  const instanceDomain = parts[0] || '';
  const postId = parts[1] || '';

  const [post, setPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!instanceDomain || !postId) return;

    setLoading(true);
    fetch(`${API_URL}/federation/status/${instanceDomain}/${postId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('Shekael_token')}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data?.success && data.post) {
          setPost(data.post);
          setReplies(data.replies || []);
        } else {
          setError('No se pudo cargar el post del Fediverso');
        }
      })
      .catch(() => setError('Error al conectar con el Fediverso'))
      .finally(() => setLoading(false));
  }, [instanceDomain, postId]);

  if (loading) {
    return (
      <div className={layoutStyles.layout}>
        <main className={layoutStyles.main}>
          <div className={layoutStyles.loadingSpinner} />
        </main>
      </div>
    );
  }

  if (!post) {
    return (
      <div className={layoutStyles.layout}>
        <main className={layoutStyles.main}>
          <div className={layoutStyles.header}>
            <button onClick={() => navigate(-1)} className={layoutStyles.backBtn}>
              <ArrowLeft size={24} />
            </button>
            <h2>Publicación no encontrada</h2>
          </div>
        </main>
      </div>
    );
  }

  const content = stripHtml(post.content);
  const formattedDate = formatDate(post.createdAt);
  const instanceName = post.instance || instanceDomain;

  return (
    <div className={detailStyles.page}>
      <div className={detailStyles.contentGrid}>
        {/* ═══ Columna principal ═══ */}
        <main className={detailStyles.mainCol}>
          <div className={layoutStyles.header}>
            <button onClick={() => navigate(-1)} className={layoutStyles.backBtn}>
              <ArrowLeft size={24} />
            </button>
            <h2>Publicación</h2>
            <a
              href={post.url} target="_blank" rel="noopener noreferrer"
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none',
                padding: '6px 12px', border: '1px solid var(--color-primary)', borderRadius: 8,
              }}
            >
              <ExternalLink size={14} /> Original
            </a>
          </div>

          {/* ── Post Container (exactamente como TextDetailLayout) ── */}
          <div className={detailStyles.mainPostContainer}>
            {/* Author header */}
            <div className={detailStyles.authorHeader}>
              <a href={post.author?.url} target="_blank" rel="noopener noreferrer" className={detailStyles.authorRow}>
                <img
                  src={post.author?.avatar}
                  alt=""
                  style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', background: 'var(--color-surface)' }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
                <div className={detailStyles.authorInfo}>
                  <span className={detailStyles.displayName}>
                    {post.author?.displayName || post.author?.username}
                  </span>
                  <span className={detailStyles.dateText}>
                    @{instanceName} · {formattedDate}
                  </span>
                </div>
              </a>
            </div>

            {/* Content */}
            <motion.div
              className={detailStyles.contentArea}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className={detailStyles.mainContent}>{content}</div>
            </motion.div>

            {/* Image */}
            {post.firstMedia?.type === 'image' && (
              <a href={post.firstMedia.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', borderRadius: 8, overflow: 'hidden', marginTop: 12 }}>
                <img
                  src={post.firstMedia.preview_url || post.firstMedia.url}
                  alt={post.firstMedia.description || ''}
                  style={{ width: '100%', maxHeight: 500, objectFit: 'contain', display: 'block' }}
                  loading="lazy"
                />
              </a>
            )}

            {/* Video placeholder */}
            {post.firstMedia?.type === 'video' && (
              <a href={post.url} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  height: 200, background: 'var(--color-surface)', borderRadius: 8,
                  color: 'var(--color-text-dim)', textDecoration: 'none', marginTop: 12,
                }}>
                ▶ Ver video en {instanceName}
              </a>
            )}

            {/* Actions (misma estructura que TextDetailLayout) */}
            <div className={detailStyles.interactionsRow}>
              <div className={detailStyles.actions}>
                <a href={post.url} target="_blank" rel="noopener noreferrer"
                  className={detailStyles.actionBtn}
                  style={{ textDecoration: 'none' }}>
                  <Heart size={18} /> <span>{post.stats?.likes || 0}</span>
                </a>
                <div className={detailStyles.statItem}>
                  <MessageCircle size={18} /> <span>{post.stats?.replies || 0}</span>
                </div>
                <a href={post.url} target="_blank" rel="noopener noreferrer"
                  className={detailStyles.actionBtn}
                  style={{ marginLeft: 'auto', textDecoration: 'none', color: 'var(--color-primary)' }}>
                  <ExternalLink size={16} /> Mastodon
                </a>
              </div>
            </div>
          </div>

          <div className={detailStyles.divider} />

          {/* ── Respuestas (misma estructura que comment section) ── */}
          <section className={detailStyles.commentsSection}>
            <h2 className={detailStyles.commentsTitle}>Respuestas ({replies.length})</h2>

            {replies.length === 0 ? (
              <p className={detailStyles.emptyComments}>
                No hay respuestas visibles desde Shekael.{' '}
                <a href={post.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
                  Ver en Mastodon
                </a>
              </p>
            ) : (
              <div className={detailStyles.commentsList}>
                <AnimatePresence>
                  {replies.map((reply, i) => (
                    <motion.div
                      key={reply.id || i}
                      className={detailStyles.commentItem}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <img
                        src={reply.author?.avatar}
                        alt=""
                        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                      <div className={detailStyles.commentContent}>
                        <span className={detailStyles.commentName}>
                          {reply.author?.displayName || reply.author?.username}
                        </span>
                        <p className={detailStyles.commentText}>{stripHtml(reply.content)}</p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        </main>

        {/* ═══ Sidebar ═══ */}
        <aside className={detailStyles.sideCol}>
          <h3 className={detailStyles.sideTitle}>Información</h3>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Post desde <strong>{instanceName}</strong>, parte del Fediverso.
            Las interacciones ocurren en la instancia original.
          </p>
          <a href={post.url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none', marginTop: 8 }}>
            <ExternalLink size={14} /> Abrir original
          </a>
        </aside>
      </div>
    </div>
  );
}
