import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Heart, MessageCircle, Repeat2, Globe, Loader2 } from 'lucide-react';
import FediversePostCard from '../../components/FediversePostCard/FediversePostCard';
import styles from '../PostDetail.module.css';

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
      <div className={styles.layout}>
        <main className={styles.main}>
          <div className={styles.loadingSpinner} />
        </main>
      </div>
    );
  }

  // ── Error ──
  if (!post) {
    return (
      <div className={styles.layout}>
        <main className={styles.main}>
          <div className={styles.header}>
            <button onClick={() => navigate(-1)} className={styles.backBtn}>
              <ArrowLeft size={24} />
            </button>
            <h2>Post no encontrado</h2>
          </div>
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Globe size={32} opacity={0.4} />
            <p style={{ marginTop: 12 }}>{error || 'Este post no está disponible'}</p>
          </div>
        </main>
      </div>
    );
  }

  const formattedDate = formatDate(post.createdAt);
  const content = stripHtml(post.content);
  const isOwner = false; // Federated posts never owned by local user

  return (
    <div className={styles.layout}>
      <main className={styles.main}>
        {/* ── Header (exactamente igual a PostDetail) ── */}
        <div className={styles.header}>
          <button onClick={() => navigate(-1)} className={styles.backBtn}>
            <ArrowLeft size={24} />
          </button>
          <h2>Publicación</h2>
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, color: 'var(--color-primary)',
              textDecoration: 'none', padding: '6px 12px',
              border: '1px solid var(--color-primary)',
              borderRadius: 8,
            }}
          >
            <ExternalLink size={14} />
            Original
          </a>
        </div>

        {/* ── FediversePostCard (ya se ve idéntica a PostCard) ── */}
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 24px' }}>
          <FediversePostCard post={post} isDetail />
        </div>

        {/* ── Acciones (mismo estilo que PostDetail) ── */}
        <div style={{
          maxWidth: 680, margin: '0 auto', padding: '0 24px 16px',
          display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          <a href={post.url} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', border: '1px solid var(--color-border)',
              borderRadius: 8, color: 'var(--color-text-muted)',
              fontSize: 13, textDecoration: 'none', cursor: 'pointer',
            }}>
            <Heart size={16} /> {post.stats?.likes || 0}
          </a>
          <a href={post.url} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', border: '1px solid var(--color-border)',
              borderRadius: 8, color: 'var(--color-text-muted)',
              fontSize: 13, textDecoration: 'none', cursor: 'pointer',
            }}>
            <MessageCircle size={16} /> {post.stats?.replies || 0}
          </a>
          <a href={post.url} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', border: '1px solid var(--color-border)',
              borderRadius: 8, color: 'var(--color-text-muted)',
              fontSize: 13, textDecoration: 'none', cursor: 'pointer',
            }}>
            <Repeat2 size={16} /> {post.stats?.shares || 0}
          </a>
          <a href={post.url} target="_blank" rel="noopener noreferrer"
            style={{
              marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', border: '1px solid var(--color-primary)',
              borderRadius: 8, color: 'var(--color-primary)',
              fontSize: 13, textDecoration: 'none', cursor: 'pointer',
            }}>
            <ExternalLink size={14} /> Abrir en Mastodon
          </a>
        </div>

        {/* ── Respuestas (misma estructura que comment section de PostDetail) ── */}
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px 80px' }}>
          <h3 style={{
            fontSize: 17, fontWeight: 600, color: 'var(--color-text)',
            margin: '24px 0 16px', paddingTop: 16, borderTop: '1px solid var(--color-border)',
          }}>
            Respuestas ({replies.length})
          </h3>

          {replies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
              <MessageCircle size={24} opacity={0.3} />
              <p style={{ marginTop: 8, fontSize: 14 }}>No hay respuestas visibles desde Shekael</p>
              <a href={post.url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--color-primary)', fontSize: 13, textDecoration: 'none' }}>
                Ver en Mastodon →
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {replies.map((reply, i) => (
                <FediversePostCard key={reply.id || i} post={reply} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
