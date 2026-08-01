import { useRef, useCallback, useState } from 'react';
import { getFeed, createPost as apiCreate } from '../api/posts.api';
import useStore from '../store';

export function useFeed() {
  const { setPosts, addPost, setFeedLoading, setFeedError } = useStore();

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(0);
  const loadingRef = useRef(false);

  const fetchFeed = useCallback(async (page = 0) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const isInitial = page === 0;
    if (isInitial) {
      setFeedLoading(true);
      pageRef.current = 0;
      setHasMore(true);
    }
    setFeedError(null);

    const activeFilter = useStore.getState().activeFilter;
    const sortParam = activeFilter === 'supported' ? 'supported' : 'ranked';

    try {
      const { data } = await getFeed(page, sortParam);
      const postsData = data.posts || data;
      const moreAvailable = !!(data.hasMore && postsData.length > 0);
      setHasMore(moreAvailable);

      if (isInitial) {
        setPosts(postsData);
      } else {
        // Agregar al final — scroll anchoring del navegador mantiene
        // la posición estable sin intervención manual
        const store = useStore.getState();
        const currentPosts = store.posts || [];
        const existingIds = new Set(currentPosts.map(p => p.id));
        const newPosts = postsData.filter(p => !existingIds.has(p.id));

        if (newPosts.length > 0) {
          setPosts([...currentPosts, ...newPosts]);
        }
      }
    } catch (err) {
      setFeedError(err.response?.data?.message || 'Error al cargar el feed');
    } finally {
      setFeedLoading(false);
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [setPosts, setFeedLoading, setFeedError]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    pageRef.current = nextPage;
    fetchFeed(nextPage);
  }, [fetchFeed, hasMore]);

  const createPost = useCallback(async (postData) => {
    const { data } = await apiCreate(postData);
    addPost(data.post || data);
    return data;
  }, [addPost]);

  return {
    fetchFeed,
    createPost,
    loadMore,
    hasMore,
    loadingMore,
  };
}

export default useFeed;
