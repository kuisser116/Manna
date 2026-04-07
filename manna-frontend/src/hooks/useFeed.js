import { useCallback, useState, useEffect, useRef } from 'react';
import { getFeed, createPost as apiCreate } from '../api/posts.api';
import { getActiveAd } from '../api/ads.api';
import useStore from '../store';

export function useFeed() {
    const { 
        setPosts, addPost, setFeedLoading, setFeedError, posts, 
        sessionSeenAds, addSeenAd, postsSinceLastAd, setPostsSinceLastAd 
    } = useStore();
    const [activeAds, setActiveAds] = useState([]);
    const [currentPage, setCurrentPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    
    // Ref para guardar los posts puros de la pág 0 y evitar re-fetch de API cuando llegan ads
    const rawPage0PostsRef = useRef(null);
    const lastInjectedAdIdsRef = useRef(new Set());

    // Cargar anuncios activos (pool)
    useEffect(() => {
        const loadActiveAds = async () => {
            try {
                const { data } = await getActiveAd({ limit: 10 });
                if (data.ads && data.ads.length > 0) {
                    setActiveAds(data.ads);
                } else if (data.ad) {
                    setActiveAds([{ ad: data.ad, sessionToken: data.sessionToken }]);
                }
            } catch (error) {
                console.warn('No se pudieron cargar anuncios:', error.message);
            }
        };

        loadActiveAds();
        const interval = setInterval(loadActiveAds, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // Efecto reactivo: Si llegan los anuncios después de cargar el feed, re-inyectar sobre los RAW
    useEffect(() => {
        if (activeAds.length > 0 && rawPage0PostsRef.current && !posts.some(p => p.isAd)) {
            const { feedWithAds, injectedAdIds, finalCounter } = insertAdsInFeed(
                rawPage0PostsRef.current, 
                activeAds, 
                sessionSeenAds, 
                0, 
                0,
                lastInjectedAdIdsRef.current
            );
            
            injectedAdIds.forEach(id => {
                if (!lastInjectedAdIdsRef.current.has(id)) {
                    addSeenAd(id);
                    lastInjectedAdIdsRef.current.add(id);
                }
            });
            
            setPostsSinceLastAd(finalCounter);
            setPosts(feedWithAds);
        }
        // Quitamos sessionSeenAds de las dependencias para evitar bucles si cambia por addSeenAd
    }, [activeAds, posts.length, setPosts, addSeenAd, setPostsSinceLastAd]);

    const fetchFeed = useCallback(async (page = 0, append = false) => {
        if (append) {
            setLoadingMore(true);
        } else {
            setFeedLoading(true);
            setCurrentPage(0);
            setHasMore(true);
            lastInjectedAdIdsRef.current.clear(); // Limpiar rastro en refresh
        }
        setFeedError(null);
        
        try {
            const { data } = await getFeed(page);
            const postsData = data.posts || data;
            
            if (page === 0) rawPage0PostsRef.current = postsData;

            setHasMore(data.hasMore && postsData.length > 0);

            let feedResult = postsData;
            if (activeAds.length > 0 && postsData.length > 0) {
                // Estabilidad solo para la página 0; para las demás, exigimos anuncios frescos
                const stabilitySet = page === 0 ? lastInjectedAdIdsRef.current : new Set();
                
                const { feedWithAds, injectedAdIds, finalCounter } = insertAdsInFeed(
                    postsData, 
                    activeAds, 
                    sessionSeenAds, 
                    postsSinceLastAd, 
                    page,
                    stabilitySet
                );
                feedResult = feedWithAds;
                
                injectedAdIds.forEach(id => {
                    if (!lastInjectedAdIdsRef.current.has(id)) {
                        addSeenAd(id);
                        lastInjectedAdIdsRef.current.add(id);
                    }
                });
                setPostsSinceLastAd(finalCounter);
            }

            if (append && page > 0) {
                const scrollPosition = window.scrollY;
                const store = useStore.getState();
                const currentPosts = store.posts || [];
                
                const existingIds = new Set(currentPosts.map(p => p.id));
                const newPostsOnly = feedResult.filter(p => !existingIds.has(p.id));
                
                if (newPostsOnly.length > 0) {
                    const updatedPosts = [...currentPosts, ...newPostsOnly];
                    setPosts(updatedPosts);
                    
                    setTimeout(() => {
                        window.scrollTo(0, scrollPosition);
                    }, 50);
                }
            } else {
                setPosts(feedResult);
            }
        } catch (err) {
            setFeedError(err.response?.data?.message || 'Error al cargar el feed');
        } finally {
            setFeedLoading(false);
            setLoadingMore(false);
        }
    }, [setPosts, setFeedLoading, setFeedError, activeAds, sessionSeenAds, addSeenAd, postsSinceLastAd, setPostsSinceLastAd]);

    const createPost = useCallback(async (postData) => {
        const { data } = await apiCreate(postData);
        addPost(data.post || data);
        return data;
    }, [addPost]);

    const loadMore = useCallback(() => {
        if (!loadingMore && hasMore) {
            const nextPage = currentPage + 1;
            setCurrentPage(nextPage);
            fetchFeed(nextPage, true);
        }
    }, [currentPage, loadingMore, hasMore, fetchFeed]);

    return {
        fetchFeed,
        createPost,
        activeAds,
        loadMore,
        hasMore,
        loadingMore
    };
}

function insertAdsInFeed(posts, adPool, seenSet, currentCounter, page = 0, currentlyInjectedSet = new Set()) {
    const feedWithAds = [];
    let postsSinceLastAd = currentCounter;
    const injectedAdIds = [];

    // Ahora permitimos anuncios que YA estén en el feed actual para evitar que desaparezcan en re-renders
    let availableAds = adPool.filter(item => !seenSet.has(item.ad.id) || currentlyInjectedSet.has(item.ad.id));

    // TikTok Style Start: Primer item si es página 0
    if (page === 0 && availableAds.length > 0) {
        const firstAd = availableAds[0];
        availableAds = availableAds.slice(1);
        injectedAdIds.push(firstAd.ad.id);
        postsSinceLastAd = 0; 
        
        feedWithAds.push({
            id: `ad-start-${firstAd.ad.id}`,
            type: 'ad',
            ad: firstAd.ad,
            proofToken: firstAd.sessionToken,
            postId: 'initial-ad',
            created_at: new Date().toISOString(),
            isAd: true,
            context: 'feed'
        });
    }

    posts.forEach((post, index) => {
        feedWithAds.push(post);
        postsSinceLastAd++;
        
        // Lógica probabilística: Entre 10 y 21 posts (más separados)
        let shouldInject = false;
        if (postsSinceLastAd >= 10) {
            if (postsSinceLastAd >= 21) {
                shouldInject = true;
            } else {
                // Probabilidad aumenta poco a poco
                const probability = postsSinceLastAd <= 15 ? 0.15 : 0.50;
                shouldInject = Math.random() < probability;
            }
        }

        if (shouldInject && availableAds.length > 0 && index !== posts.length - 1) {
            const selected = availableAds[0];
            availableAds = availableAds.slice(1);
            injectedAdIds.push(selected.ad.id);
            postsSinceLastAd = 0;

            feedWithAds.push({
                id: `ad-${selected.ad.id}-${page}-${index}`,
                type: 'ad',
                ad: selected.ad,
                proofToken: selected.sessionToken,
                postId: post.id,
                created_at: new Date().toISOString(),
                isAd: true,
                context: 'feed'
            });
        }
    });

    return { feedWithAds, injectedAdIds, finalCounter: postsSinceLastAd };
}

export default useFeed;
