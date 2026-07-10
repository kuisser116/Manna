import { useCallback, useState, useEffect, useRef } from 'react';
import { getFeed, createPost as apiCreate } from '../api/posts.api';
import useStore from '../store';

export function useFeed() {
    const { 
        setPosts, addPost, setFeedLoading, setFeedError, posts
    } = useStore();
    const [currentPage, setCurrentPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const fetchFeed = useCallback(async (page = 0, append = false) => {
        if (append) {
            setLoadingMore(true);
        } else {
            setFeedLoading(true);
            setCurrentPage(0);
            setHasMore(true);
        }
        setFeedError(null);
        
        try {
            const { data } = await getFeed(page);
            const postsData = data.posts || data;

            setHasMore(data.hasMore && postsData.length > 0);

            if (append && page > 0) {
                const scrollPosition = window.scrollY;
                const store = useStore.getState();
                const currentPosts = store.posts || [];
                
                const existingIds = new Set(currentPosts.map(p => p.id));
                const newPostsOnly = postsData.filter(p => !existingIds.has(p.id));
                
                if (newPostsOnly.length > 0) {
                    const updatedPosts = [...currentPosts, ...newPostsOnly];
                    setPosts(updatedPosts);
                    
                    setTimeout(() => {
                        window.scrollTo(0, scrollPosition);
                    }, 50);
                }
            } else {
                setPosts(postsData);
            }
        } catch (err) {
            setFeedError(err.response?.data?.message || 'Error al cargar el feed');
        } finally {
            setFeedLoading(false);
            setLoadingMore(false);
        }
    }, [setPosts, setFeedLoading, setFeedError]);

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
        loadMore,
        hasMore,
        loadingMore
    };
}

export default useFeed;
