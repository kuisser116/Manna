import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, Globe, ExternalLink } from 'lucide-react';
import { searchGlobal } from '../../api/search.api';
import PostCard from '../../components/PostCard/PostCard';
import FediversePostCard from '../../components/FediversePostCard/FediversePostCard';
import Avatar from '../../components/Avatar/Avatar';
import styles from './Search.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Search() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const [loading, setLoading] = useState(false);
    const [shekaelResults, setShekaelResults] = useState({ users: [], posts: [] });
    const [fedResults, setFedResults] = useState({ accounts: [], posts: [] });
    const [fedLoading, setFedLoading] = useState(false);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (!query.trim()) return;
        fetchedRef.current = false;
        
        // Shekael search
        setLoading(true);
        searchGlobal(query.trim())
            .then(res => setShekaelResults(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));

        // Fediverso search (simultáneo)
        setFedLoading(true);
        const token = localStorage.getItem('Shekael_token');
        fetch(`${API_URL}/federation/search?q=${encodeURIComponent(query.trim())}&type=all`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                if (data?.success) {
                    setFedResults({
                        accounts: data.accounts || [],
                        posts: data.posts || [],
                    });
                }
            })
            .catch(console.error)
            .finally(() => setFedLoading(false));
    }, [query]);

    const openFedProfile = (acc) => {
        const match = acc.handle?.match(/^@?([\w.-]+)@(.+)$/);
        if (match) {
            navigate(`/profile/fed__${encodeURIComponent(match[2])}__${encodeURIComponent(match[1])}`);
        }
    };

    const hasShekael = shekaelResults.users.length > 0 || shekaelResults.posts.length > 0;
    const hasFed = fedResults.accounts.length > 0 || fedResults.posts.length > 0;

    return (
        <div className={styles.layout}>
            <main className={styles.main}>
                <div className={styles.header}>
                    <h2>Búsqueda</h2>
                    <p>Resultados para "{query}"</p>
                </div>

                {loading ? (
                    <div className={styles.loadingSpinner} />
                ) : !query.trim() ? null : (
                    <>
                        {/* ── Usuarios de Shekael ── */}
                        {shekaelResults.users.length > 0 && (
                            <div className={styles.userGrid}>
                                {shekaelResults.users.map(u => (
                                    <Link to={`/profile/${u.id}`} key={u.id} className={styles.searchUserLink}>
                                        <div className={styles.searchUserCard}>
                                            <Avatar avatarUrl={u.avatarUrl} name={u.displayName} size={48} />
                                            <div>
                                                <h3 className={styles.searchUserName}>{u.displayName}</h3>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}

                        {/* ── Posts de Shekael ── */}
                        {shekaelResults.posts.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
                                {shekaelResults.posts.map(post => (
                                    <PostCard key={post.id} post={post} />
                                ))}
                            </div>
                        )}

                        {/* ── Perfiles del Fediverso ── */}
                        {fedResults.accounts.length > 0 && !hasShekael && (
                            <div style={{ marginTop: 16 }}>
                                <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--color-text)' }}>
                                    Perfiles en el Fediverso
                                </h4>
                                <div className={styles.fedAccounts}>
                                    {fedResults.accounts.map(acc => (
                                        <div key={acc.handle} onClick={() => openFedProfile(acc)} className={styles.fedAccountCard} style={{ cursor: 'pointer' }}>
                                            <img src={acc.avatar} alt={acc.displayName} className={styles.fedAvatar} onError={e => { e.target.style.display = 'none'; }} />
                                            <div className={styles.fedAccountInfo}>
                                                <span className={styles.fedAccountName}>{acc.displayName}</span>
                                                <span className={styles.fedAccountHandle}>{acc.handle}</span>
                                                <span className={styles.fedAccountStats}>{acc.followersCount} seguidores</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Posts del Fediverso ── */}
                        {fedResults.posts.length > 0 && (
                            <div style={{ marginTop: hasShekael ? 8 : 16 }}>
                                {hasShekael && (
                                    <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-muted)' }}>
                                        También del Fediverso ({fedResults.posts.length})
                                    </h4>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {fedResults.posts.map((post, i) => (
                                        <FediversePostCard key={post.id || i} post={post} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Sin resultados ── */}
                        {!loading && !hasShekael && !hasFed && !fedLoading && (
                            <div className={styles.emptyState}>
                                <Globe size={24} opacity={0.3} />
                                <p>No encontramos nada que coincida con "{query}"</p>
                                <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                                    Prueba buscar en el Fediverso: @usuario@instancia.social
                                </p>
                            </div>
                        )}

                        {/* ── Cargando Fediverso ── */}
                        {fedLoading && !hasShekael && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: 32, color: 'var(--color-text-muted)', fontSize: 13 }}>
                                <Loader2 size={16} className={styles.spin} />
                                Buscando en el Fediverso...
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
