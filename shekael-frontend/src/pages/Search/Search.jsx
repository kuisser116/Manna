import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { searchGlobal } from '../../api/search.api';
import PostCard from '../../components/PostCard/PostCard';
import Avatar from '../../components/Avatar/Avatar';
import styles from './Search.module.css';

export default function Search() {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const [activeTab, setActiveTab] = useState('all'); // all, users, posts, videos
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState({ users: [], posts: [] });
    
    useEffect(() => {
        if (!query.trim()) return;
        setLoading(true);
        searchGlobal(query.trim())
            .then(res => setResults(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [query]);

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
                </div>

                {loading ? (
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

                        {activeTab === 'fediverse' && (
                            <div className={styles.fediverseResults}>
                                {fedLoading ? (
                                    <div className={styles.fedLoading}>
                                        <Loader2 size={20} className={styles.spin} />
                                        <span>Buscando en el Fediverso...</span>
                                    </div>
                                ) : (
                                    <>
                                        {fediverseResults.accounts.length > 0 && (
                                            <div className={styles.fedSection}>
                                                <h4 className={styles.fedSectionTitle}>Perfiles en el Fediverso</h4>
                                                <div className={styles.fedAccounts}>
                                                    {fediverseResults.accounts.map(acc => (
                                                        <a key={acc.handle} href={acc.url} target="_blank" rel="noopener noreferrer" className={styles.fedAccountCard}>
                                                            <img src={acc.avatar} alt={acc.displayName} className={styles.fedAvatar} onError={e => { e.target.style.display = 'none'; }} />
                                                            <div className={styles.fedAccountInfo}>
                                                                <span className={styles.fedAccountName}>{acc.displayName}</span>
                                                                <span className={styles.fedAccountHandle}>{acc.handle}</span>
                                                                <span className={styles.fedAccountStats}>{acc.followersCount} seguidores</span>
                                                            </div>
                                                            <ExternalLink size={14} className={styles.fedExternalIcon} />
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {fediverseResults.posts.length > 0 && (
                                            <div className={styles.fedSection}>
                                                <h4 className={styles.fedSectionTitle}>Publicaciones en el Fediverso</h4>
                                                <div className={styles.fedPosts}>
                                                    {fediverseResults.posts.map(post => (
                                                        <a key={post.id || post.uri} href={post.url} target="_blank" rel="noopener noreferrer" className={styles.fedPostCard}>
                                                            <div className={styles.fedPostAuthor}>
                                                                <img src={post.author?.avatar} alt="" className={styles.fedPostAvatar} onError={e => { e.target.style.display = 'none'; }} />
                                                                <div className={styles.fedPostAuthorInfo}>
                                                                    <span className={styles.fedPostAuthorName}>{post.author?.displayName}</span>
                                                                    <span className={styles.fedPostAuthorHandle}>{post.author?.handle}</span>
                                                                </div>
                                                            </div>
                                                            <p className={styles.fedPostText}>{post.contentText?.substring(0, 200)}</p>
                                                            <div className={styles.fedPostMeta}>
                                                                <span>{post.stats?.likes || 0} ♥</span>
                                                                <span>{post.instance}</span>
                                                                <ExternalLink size={12} />
                                                            </div>
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {!fedLoading && fediverseResults.posts.length === 0 && fediverseResults.accounts.length === 0 && query.trim() && (
                                            <div className={styles.emptyState}>
                                                <Globe size={24} />
                                                <p>Sin resultados en el Fediverso para "{query}"</p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {!loading && activeTab !== 'fediverse' && results.users.length === 0 && results.posts.length === 0 && (
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
