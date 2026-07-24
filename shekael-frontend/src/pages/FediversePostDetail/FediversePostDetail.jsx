import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, Globe, MessageCircle, Heart, Repeat2 } from 'lucide-react';
import FediversePostCard from '../../components/FediversePostCard/FediversePostCard';
import useStore from '../../store';
import styles from './FediversePostDetail.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

export default function FediversePostDetail() {
  const { id, instance } = useParams();
  const navigate = useNavigate();
  const { addToast, user } = useStore();

  const [post, setPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!instance || !id) return;

    setLoading(true);
    fetch(`${API_URL}/federation/status/${instance}/${id}`, {
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
  }, [instance, id]);

  // ── Loading ──
  if (loading) {
    return (
      <div className={styles.page}>
        <main className={styles.mainCol}>
          <div className={styles.loadingSpinner} />
        </main>
      </div>
    );
  }

  // ── Error ──
  if (error || !post) {
    return (
      <div className={styles.page}>
        <main className={styles.mainCol}>
          <div className={styles.headerBar}>
            <button onClick={() => navigate(-1)} className={styles.backBtn}>
              <ArrowLeft size={24} />
            </button>
            <h2 className={styles.notFoundTitle}>Post no encontrado</h2>
          </div>
          <div className={styles.errorState}>
            <Globe size={32} opacity={0.4} />
            <p>{error || 'Este post no está disponible en el Fediverso'}</p>
          </div>
        </main>
      </div>
    );
  }

  const formattedDate = formatDate(post.createdAt);
  const content = stripHtml(post.content);

  return (
    <div className={styles.page}>
      <div className={styles.contentGrid}>
        {/* ═══ Columna Principal ═══ */}
        <main className={styles.mainCol}>
          <div className={styles.mainPostContainer}>
            {/* ── Cabecera ── */}
            <div className={styles.headerBar}>
              <button onClick={() => navigate(-1)} className={styles.backBtn}>
                <ArrowLeft size={24} />
              </button>
              <a href={post.url} target="_blank" rel="noopener noreferrer" className={styles.originalBtn}>
                <ExternalLink size={16} />
                Abrir en {post.instance}
              </a>
            </div>

            {/* ── Autor ── */}
            <div className={styles.authorHeader}>
              <a href={post.author?.url} target="_blank" rel="noopener noreferrer" className={styles.authorRow}>
                <img
                  src={post.author?.avatar}
                  alt=""
                  className={styles.avatar}
                  onError={e => { e.target.style.display = 'none'; }}
                />
                <div className={styles.authorInfo}>
                  <span className={styles.displayName}>
                    {post.author?.displayName || post.author?.username}
                  </span>
                  <span className={styles.dateText}>
                    {post.author?.handle} · {formattedDate}
                  </span>
                </div>
              </a>
              <span className={styles.instanceBadge}>{post.instance}</span>
            </div>

            {/* ── Contenido ── */}
            <div className={styles.postBody}>
              <p className={styles.postText}>{content}</p>

              {post.firstMedia?.type === 'image' && !imgError && (
                <a href={post.firstMedia.url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={post.firstMedia.preview_url || post.firstMedia.url}
                    alt={post.firstMedia.description || ''}
                    className={styles.postImage}
                    loading="lazy"
                    onError={() => setImgError(true)}
                  />
                </a>
              )}

              {post.firstMedia?.type === 'video' && (
                <a href={post.url} target="_blank" rel="noopener noreferrer" className={styles.videoPlaceholder}>
                  <span>▶</span> Ver video en {post.instance}
                </a>
              )}
            </div>

            {/* ── Stats ── */}
            <div className={styles.statsRow}>
              <span className={styles.statItem}>
                <Heart size={16} /> {post.stats?.likes || 0}
              </span>
              <span className={styles.statItem}>
                <Repeat2 size={16} /> {post.stats?.shares || 0}
              </span>
              <span className={styles.statItem}>
                <MessageCircle size={16} /> {post.stats?.replies || 0}
              </span>
            </div>

            {/* ── Acción ── */}
            <div className={styles.actionRow}>
              <a href={post.url} target="_blank" rel="noopener noreferrer" className={styles.actionBtn}>
                <Heart size={18} /> {post.stats?.likes || 0}
              </a>
              <a href={post.url} target="_blank" rel="noopener noreferrer" className={styles.actionBtn}>
                <MessageCircle size={18} /> {post.stats?.replies || 0}
              </a>
              <a href={post.url} target="_blank" rel="noopener noreferrer" className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}>
                <ExternalLink size={16} />
                Responder en Mastodon
              </a>
            </div>

            {/* ── Tags ── */}
            {post.tags?.length > 0 && (
              <div className={styles.tagsRow}>
                {post.tags.slice(0, 8).map(t => (
                  <span key={t} className={styles.tag}>#{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* ═══ Respuestas ═══ */}
          <div className={styles.repliesSection}>
            <h3 className={styles.repliesTitle}>Respuestas ({replies.length})</h3>

            {replies.length === 0 ? (
              <div className={styles.noReplies}>
                <MessageCircle size={24} opacity={0.3} />
                <p>No hay respuestas visibles</p>
                <a href={post.url} target="_blank" rel="noopener noreferrer" className={styles.replyLink}>
                  <ExternalLink size={14} /> Ver en Mastodon
                </a>
              </div>
            ) : (
              <div className={styles.repliesList}>
                {replies.map((reply, i) => (
                  <FediversePostCard key={reply.id || i} post={reply} />
                ))}
              </div>
            )}
          </div>
        </main>

        {/* ═══ Sidebar (similar a PostDetail) ═══ */}
        <aside className={styles.sideCol}>
          <div className={styles.sideCard}>
            <h4 className={styles.sideTitle}>Sobre este post</h4>
            <p className={styles.sideText}>
              Post desde <strong>{post.instance}</strong>, parte del Fediverso.
              Las interacciones (likes, respuestas) ocurren en la instancia original.
            </p>
            <a href={post.url} target="_blank" rel="noopener noreferrer" className={styles.sideLink}>
              <ExternalLink size={14} /> Abrir original
            </a>
          </div>

          {post.language && (
            <div className={styles.sideCard}>
              <h4 className={styles.sideTitle}>Idioma</h4>
              <p className={styles.sideText}>
                {post.language === 'es' ? '🇪🇸 Español' :
                 post.language === 'en' ? '🇬🇧 Inglés' :
                 post.language === 'pt' ? '🇧🇷 Portugués' :
                 post.language === 'fr' ? '🇫🇷 Francés' :
                 post.language === 'de' ? '🇩🇪 Alemán' :
                 post.language === 'it' ? '🇮🇹 Italiano' :
                 post.language === 'ja' ? '🇯🇵 Japonés' : `🌐 ${post.language}`}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
