import { useState, useEffect } from 'react';
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
    const [activeTab, setActiveTab] = useState('all'); // all, users, posts, videos, fediverse
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState({ users: [], posts: [] });

    // Fediverse search
    const [fedLoading, setFedLoading] = useState(false);
    const [fedResults, setFedResults] = useState({ accounts: [], posts: [] });
    
    useEffect(() => {
        if (!query.trim()) return;
        setLoading(true);
        searchGlobal(query.trim())
            .then(res => setResults(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [query]);

    // Fediverso search effect
    useEffect(() => {
        if (!query.trim() || activeTab !== 'fediverse') return;
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
    }, [query, activeTab]);

    // Filtrado local según la pestaña
    const filteredPosts = results.posts.filter(p => {
        if (activeTab === 'videos') return p.type === 'video';
        if (activeTab === 'posts') return p.type !== 'video';
        return true;
    });

    const renderUsers = () => {
        if (results.users.length === 0) return null;
        return (
            <div className={styles.userGrid}>
                {results.users.map(u => (
                    <Link to={`/profile/${u.id}`} key={u.id} className={styles.searchUserLink}>
                        <div className={styles.searchUserCard}>
                            <Avatar avatarUrl={u.avatarUrl} name={u.displayName} size={48} />
                            <div>
                                <h3 className={styles.searchUserName}>{u.displayName}</h3>
                                <p className={styles.searchUserRep}>Reputación: {u.reputationLevel || 1}</p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        );
    };

    const openFedProfile = (acc) => {
        // Parse handle: @user@instance -> extract domain + user
        const match = acc.handle?.match(/^@?([\w.-]+)@(.+)$/);
        if (match) {
            navigate(`/fediverse-profile/${encodeURIComponent(match[2])}/${encodeURIComponent(match[1])}`);
        }
    };

    return (
        <div className={styles.layout}>
            <main className={styles.main}>
                <div className={styles.header}>
                    <h2>Búsqueda</h2>
                    <p>Resultados para "{query}"</p>
                </div>

                <div className={styles.tabs}>
                    <button className={`${styles.tab} ${activeTab === 'all' ? styles.tabActive : ''}`} onClick={() => setActiveTab('all')}>Todo</button>
                    <button className={`${styles.tab} ${activeTab === 'users' ? styles.tabActive : ''}`} onClick={() => setActiveTab('users')}>Usuarios ({results.users.length})</button>
                    <button className={`${styles.tab} ${activeTab === 'posts' ? styles.tabActive : ''}`} onClick={() => setActiveTab('posts')}>Publicaciones</button>
                    <button className={`${styles.tab} ${activeTab === 'videos' ? styles.tabActive : ''}`} onClick={() => setActiveTab('videos')}>Videos</button>
                    <button className={`${styles.tab} ${activeTab === 'fediverse' ? styles.tabActive : ''}`} onClick={() => setActiveTab('fediverse')}>Fediverso</button>
                </div>

                {activeTab === 'fediverse' ? (
                    <div className={styles.fediverseResults}>
                        {fedLoading ? (
                            <div className={styles.fedLoading}>
                                <Loader2 size={20} className={styles.spin} />
                                <span>Buscando en el Fediverso...</span>
                            </div>
                        ) : (
                            <>
                                {fedResults.accounts.length > 0 && (
                                    <div className={styles.fedSection}>
                                        <h4 className={styles.fedSectionTitle}>Perfiles en el Fediverso ({fedResults.accounts.length})</h4>
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

                                {fedResults.posts.length > 0 && (
                                    <div className={styles.fedSection}>
                                        <h4 className={styles.fedSectionTitle}>Publicaciones en el Fediverso ({fedResults.posts.length})</h4>
                                        <div className={styles.fedPosts}>
                                            {fedResults.posts.map((post, i) => (
                                                <FediversePostCard key={post.id || i} post={post} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {!fedLoading && fedResults.accounts.length === 0 && fedResults.posts.length === 0 && query.trim() && (
                                    <div className={styles.emptyState}>
                                        <Globe size={24} opacity={0.3} />
                                        <p>Sin resultados en el Fediverso para "{query}"</p>
                                        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Prueba buscar @usuario@instancia.social</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : loading ? (
                    <div className={styles.loadingSpinner} />
                ) : (
                    <>
                        {(activeTab === 'all' || activeTab === 'users') && renderUsers()}

                        {(activeTab !== 'users') && (
                            <div className={styles.postList}>
                                {filteredPosts.length === 0 && results.posts.length > 0 ? (
                                    <div className={styles.emptyState}>
                                        <p>No se encontraron resultados en esta categoría.</p>
                                    </div>
                                ) : (
                                    filteredPosts.map(post => (
                                        <PostCard key={post.id} post={post} />
                                    ))
                                )}
                            </div>
                        )}

                        {!loading && results.users.length === 0 && results.posts.length === 0 && (
                            <div className={styles.emptyState}>
                                <span></span>
                                <p>No encontramos nada que coincida con "{query}"</p>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
