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
                    <Link to={`/profile/${u.id}`} key={u.id} style={{ textDecoration: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                            <Avatar avatarUrl={u.avatarUrl} name={u.displayName} size={48} />
                            <div>
                                <h3 style={{ fontSize: '15px', color: 'var(--color-text)', margin: 0 }}>{u.displayName}</h3>
                                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>Reputación: {u.reputationLevel || 1}</p>
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

                        {!loading && results.users.length === 0 && results.posts.length === 0 && (
                            <div className={styles.emptyState}>
                                <span style={{fontSize: '40px'}}>🔍</span>
                                <p>No encontramos nada que coincida con "{query}"</p>
                            </div>
                        )}
                    </>
                )}
            </main>
    
        </div>
    );
}
