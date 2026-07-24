import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Calendar, Users, FileText } from 'lucide-react';
import FediversePostCard from '../components/FediversePostCard/FediversePostCard';
import layoutStyles from '../styles/pages/PostDetail.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function formatCount(n) {
  if (!n) return 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n;
}

export default function FediverseProfile() {
  const { id: rawId } = useParams();
  const navigate = useNavigate();

  // Parse: fed__instance__username
  const parts = rawId.replace('fed__', '').split('__');
  const instanceDomain = parts[0] || '';
  const username = parts.slice(1).join('__');

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!instanceDomain || !username) return;
    setLoading(true);

    const handle = `@${username}@${instanceDomain}`;
    const token = localStorage.getItem('Shekael_token');

    fetch(`${API_URL}/federation/account-profile/${encodeURIComponent(handle)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data?.success) {
          setProfile(data.account);
          setPosts(data.posts || []);
        } else {
          setError('No se pudo cargar el perfil');
        }
      })
      .catch(() => setError('Error al conectar con el Fediverso'))
      .finally(() => setLoading(false));
  }, [instanceDomain, username]);

  if (loading) {
    return (
      <div className={layoutStyles.layout}>
        <main className={layoutStyles.main}>
          <div className={layoutStyles.loadingSpinner} />
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={layoutStyles.layout}>
        <main className={layoutStyles.main}>
          <div className={layoutStyles.header}>
            <button onClick={() => navigate(-1)} className={layoutStyles.backBtn}>
              <ArrowLeft size={24} />
            </button>
            <h2>Perfil no encontrado</h2>
          </div>
          <p style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
            {error || 'Este perfil no está disponible en el Fediverso'}
          </p>
        </main>
      </div>
    );
  }

  const acct = profile;

  return (
    <div className={layoutStyles.layout}>
      <main className={layoutStyles.main}>
        <div className={layoutStyles.header}>
          <button onClick={() => navigate(-1)} className={layoutStyles.backBtn}>
            <ArrowLeft size={24} />
          </button>
          <h2>Perfil</h2>
          <a href={acct.url} target="_blank" rel="noopener noreferrer"
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--color-primary)', borderRadius: 8 }}>
            <ExternalLink size={14} /> Mastodon
          </a>
        </div>

        {/* Cover */}
        <div style={{ height: 200, background: 'var(--color-surface-2)', borderRadius: 12, overflow: 'hidden', margin: '0 24px' }}>
          {acct.header && <img src={acct.header} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>

        {/* Profile info */}
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: -40, marginBottom: 16 }}>
            <img
              src={acct.avatar}
              alt=""
              style={{ width: 80, height: 80, borderRadius: '50%', border: '3px solid var(--color-bg)', objectFit: 'cover' }}
              onError={e => { e.target.style.display = 'none'; }}
            />
            <div style={{ marginLeft: 16, flex: 1 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                {acct.displayName || acct.username}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                @{username}@{instanceDomain}
              </p>
            </div>
          </div>

          {/* Bio */}
          {acct.note && (
            <div style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.6, marginBottom: 16 }}>
              {acct.note.replace(/<[^>]+>/g, '')}
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 16, fontSize: 13 }}>
            <span><strong>{formatCount(acct.statusesCount || acct.statuses_count)}</strong> <span style={{ color: 'var(--color-text-muted)' }}>posts</span></span>
            <span><strong>{formatCount(acct.followersCount || acct.followers_count)}</strong> <span style={{ color: 'var(--color-text-muted)' }}>seguidores</span></span>
            <span><strong>{formatCount(acct.followingCount || acct.following_count)}</strong> <span style={{ color: 'var(--color-text-muted)' }}>siguiendo</span></span>
          </div>

          {/* Posts */}
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            Últimas publicaciones ({posts.length})
          </h3>

          {posts.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: 40 }}>
              <FileText size={24} opacity={0.3} /><br />
              No hay publicaciones disponibles de este usuario
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 80 }}>
              {posts.map((post, i) => (
                <FediversePostCard key={post.id || i} post={post} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
