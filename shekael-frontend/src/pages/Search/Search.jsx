import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Globe } from 'lucide-react';
import { searchGlobal } from '../../api/search.api';
import PostCard from '../../components/PostCard/PostCard';
import Avatar from '../../components/Avatar/Avatar';
import styles from './Search.module.css';

export default function Search() {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState({ users: [], posts: [] });
    const carouselRef = useRef(null);

    useEffect(() => {
        if (!query.trim()) return;

        setLoading(true);
        searchGlobal(query.trim())
            .then(res => setResults(res.data))
            .catch(() => setResults({ users: [], posts: [] }))
            .finally(() => setLoading(false));
    }, [query]);

    // Drag-to-scroll
    useEffect(() => {
        const el = carouselRef.current;
        if (!el || results.users.length <= 1) return;

        let isDragging = false;
        let didDrag = false;
        let startX = 0;
        let scrollStart = 0;

        const onMouseDown = (e) => {
            didDrag = false;
            isDragging = true;
            startX = e.clientX;
            scrollStart = el.scrollLeft;
            el.style.cursor = 'grabbing';
            el.style.userSelect = 'none';
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const dx = e.clientX - startX;
            el.scrollLeft = scrollStart - dx;
            if (Math.abs(dx) > 5) didDrag = true;
        };

        const onMouseUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            el.style.cursor = '';
            el.style.userSelect = '';
            // Si arrastró, prevenir click en los links
            if (didDrag) {
                const preventClick = (ce) => {
                    ce.preventDefault();
                    ce.stopPropagation();
                    document.removeEventListener('click', preventClick, true);
                };
                document.addEventListener('click', preventClick, true);
            }
        };

        el.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            el.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            el.style.cursor = '';
            el.style.userSelect = '';
        };
    }, [results.users.length]);

    // Auto-scroll lento (se pausa al arrastrar y 8s tras soltar)
    useEffect(() => {
        const el = carouselRef.current;
        if (!el || results.users.length <= 1) return;

        let pauseTimeout = null;
        let isPaused = false;
        let isProgrammatic = false;

        const pause = (durationMs = 8000) => {
            isPaused = true;
            if (pauseTimeout) clearTimeout(pauseTimeout);
            pauseTimeout = setTimeout(() => {
                isPaused = false;
                pauseTimeout = null;
            }, durationMs);
        };

        // Ignorar scroll programático
        const handleScroll = () => {
            if (isProgrammatic) return;
            pause();
        };
        const handleMouseDown = () => pause(10000);

        el.addEventListener('scroll', handleScroll, { passive: true });
        el.addEventListener('mousedown', handleMouseDown);

        const interval = setInterval(() => {
            if (isPaused) return;

            const maxScroll = el.scrollWidth - el.clientWidth;
            if (maxScroll <= 0) return;

            const next = el.scrollLeft + 0.5;
            isProgrammatic = true;
            if (next >= maxScroll) {
                el.scrollTo({ left: 0, behavior: 'smooth' });
                setTimeout(() => { isProgrammatic = false; }, 400);
            } else {
                el.scrollLeft = next;
                requestAnimationFrame(() => { isProgrammatic = false; });
            }
        }, 30);

        return () => {
            clearInterval(interval);
            if (pauseTimeout) clearTimeout(pauseTimeout);
            el.removeEventListener('scroll', handleScroll);
            el.removeEventListener('mousedown', handleMouseDown);
        };
    }, [results.users.length]);

    const hasAny = results.users.length > 0 || results.posts.length > 0;

    return (
        <div className={styles.layout}>
            <main className={styles.main}>
                {loading ? (
                    <div className={styles.loadingSpinner} />
                ) : !query.trim() ? null : !hasAny ? (
                    <div className={styles.emptyState}>
                        <Globe size={24} opacity={0.3} />
                        <p>No encontramos nada que coincida con "{query}"</p>
                    </div>
                ) : (
                    <>
                        {results.users.length > 0 && (
                            <section className={styles.userSection}>
                                <div className={styles.userCarousel} ref={carouselRef}>
                                    {results.users.map(u => (
                                        <Link to={`/profile/${u.id}`} key={u.id} className={styles.searchUserLink}>
                                            <div className={styles.searchUserCard}>
                                                <Avatar avatarUrl={u.avatarUrl} name={u.displayName} size={40} />
                                                <h3 className={styles.searchUserName}>{u.displayName}</h3>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}

                        {results.posts.length > 0 && (
                            <section className={styles.postSection}>
                                <div className={styles.postList}>
                                    {results.posts.map(post => (
                                        <PostCard key={post.id} post={post} />
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
