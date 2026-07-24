import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, Globe } from 'lucide-react';
import FediversePostCard from '../../components/FediversePostCard/FediversePostCard';
import styles from './FediversePostDetail.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function FediversePostDetail() {
  const { id, instance } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [post, setPost] = useState(location.state?.post || null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(!post);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!instance || !id) return;
    if (post && replies.length > 0) return; // Ya cargado

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
          setError('No se pudo cargar el post');
        }
      })
      .catch(() => setError('Error al conectar con el Fediverso'))
      .finally(() => setLoading(false));
  }, [instance, id]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Loader2 size={24} className={styles.spin} />
          <span>Cargando post del Fediverso...</span>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> Volver
        </button>
        <div className={styles.error}>
          <Globe size={32} />
          <p>{error || 'Post no encontrado'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> Volver
        </button>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.originalLink}
        >
          <ExternalLink size={14} />
          Abrir original en {post.instance}
        </a>
      </div>

      <div className={styles.postSection}>
        <FediversePostCard post={post} />
      </div>

      <div className={styles.repliesSection}>
        <h3 className={styles.repliesTitle}>
          Respuestas ({replies.length})
        </h3>

        {replies.length === 0 ? (
          <p className={styles.noReplies}>
            Este post no tiene respuestas visibles desde Shekael.{' '}
            <a href={post.url} target="_blank" rel="noopener noreferrer">
              Ver en Mastodon
            </a>
          </p>
        ) : (
          <div className={styles.repliesList}>
            {replies.map((reply, i) => (
              <FediversePostCard key={reply.id || i} post={reply} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
