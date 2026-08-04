import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPostDetail, createComment, getPostComments, getFeed } from '../api/posts.api';
import { likePostCounter, unlikePost } from '../api/quests.api';

import VideoDetailLayout from '../components/VideoDetailLayout/VideoDetailLayout';
import ImageDetailLayout from '../components/ImageDetailLayout/ImageDetailLayout';
import TextDetailLayout from '../components/TextDetailLayout/TextDetailLayout';
import useStore from '../store';
import { useQuests } from '../hooks/useQuests';
import styles from '../styles/pages/PostDetail.module.css';

const API_URL = import.meta.env.VITE_API_URL || location.origin;

// ── Helpers ──
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<p>/gi, '').replace(/<\/p>/gi, ' ')
    .replace(/<a[^>]*>/gi, '').replace(/<\/a>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .trim();
}

// ══════════════════════════════════════════════════════
// PostDetail
// ══════════════════════════════════════════════════════
export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, setVideoMode } = useStore();
  const { addToast, showConfirm } = useStore();
  const { verifyCompletion } = useQuests();

  // ── SHEKAEL POST ──
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsPage, setCommentsPage] = useState(0);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recommendedPosts, setRecommendedPosts] = useState([]);
  const [recommendedImagePosts, setRecommendedImagePosts] = useState([]);
  const [recommendedTextPosts, setRecommendedTextPosts] = useState([]);

  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [viewRegistered, setViewRegistered] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);

    const fetchPost = async () => {
      try {
        const { data } = await getPostDetail(id);
        setPost(data.post);
        setComments(data.comments || []);
        setCommentsTotal(data.post?.comments_count || data.comments?.length || 0);
        setCommentsHasMore((data.post?.comments_count || 0) > (data.comments?.length || 0));
        setCommentsPage(0);
        setIsLiked(data.post?.has_liked || false);
        setLikesCount(data.post?.likes_count || 0);
      } catch (err) {
        console.error(err);
        addToast('error', 'Error', 'No se pudo cargar la publicación');
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
    return () => { setVideoMode('default'); };
  }, [id, setVideoMode]);

  // Cargar posts recomendados
  useEffect(() => {
    if (!post) return;
    getFeed(0).then(({ data }) => {
      const posts = Array.isArray(data) ? data : (data.posts || []);
      if (post.type === 'video') setRecommendedPosts(posts.filter(p => p.type === 'video' && p.id !== post.id));
      else if (post.type === 'image') setRecommendedImagePosts(posts.filter(p => p.type === 'image' && p.id !== post.id));
      else setRecommendedTextPosts(posts.filter(p => p.type !== 'video' && p.type !== 'image' && p.id !== post.id));
    }).catch(() => {});
  }, [post?.id, post?.type]);

  const handleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);
    const wasLiked = isLiked;
    try {
      setIsLiked(!wasLiked);
      setLikesCount(prev => wasLiked ? Math.max(0, prev - 1) : prev + 1);
      const res = wasLiked ? await unlikePost(id) : await likePostCounter(id);
      if (!wasLiked && res?.data?.missionCompleted) verifyCompletion(true);
    } catch {
      setIsLiked(wasLiked);
      setLikesCount(prev => wasLiked ? prev + 1 : Math.max(0, prev - 1));
    } finally { setIsLiking(false); }
  };

  const registerView = async (watchedSeconds = 0, videoDuration = 0) => {
    if (viewRegistered) return;
    setViewRegistered(true);
    try {
      const res = await fetch(`${API_URL}/posts/${id}/view`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchedSeconds, videoDuration })
      });
      if (res.ok) verifyCompletion(true);
      else verifyCompletion(false);
    } catch { verifyCompletion(false); }
  };

  useEffect(() => {
    if (post && post.type !== 'video' && !viewRegistered) registerView();
  }, [post, viewRegistered]);

  const handleSubmitComment = async (e) => {
    if (e) e.preventDefault();
    if (!commentText.trim()) return;
    setIsSubmitting(true);
    try {
      const { data } = await createComment(id, commentText);
      setComments(prev => [...prev, data.comment]);
      setCommentsTotal(prev => prev + 1);
      setCommentText('');
      addToast('success', 'Comentario enviado');
    } catch {
      addToast('error', 'Error', 'No se pudo enviar el comentario');
    } finally { setIsSubmitting(false); }
  };

  const loadMoreComments = async () => {
    if (commentsLoadingMore) return;
    setCommentsLoadingMore(true);
    try {
      const nextPage = commentsPage + 1;
      const { data } = await getPostComments(id, nextPage);
      setComments(prev => {
        const existing = new Set(prev.map(c => c.id));
        const fresh = (data.comments || []).filter(c => !existing.has(c.id));
        return [...prev, ...fresh];
      });
      setCommentsHasMore(data.hasMore);
      setCommentsPage(data.page);
    } catch {
      addToast('error', 'Error', 'No se pudieron cargar los comentarios');
    } finally { setCommentsLoadingMore(false); }
  };

  const confirmDelete = async () => {
    try {
      const res = await fetch(`${API_URL}/posts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) { addToast('success', 'Publicación eliminada'); setTimeout(() => navigate('/feed'), 2000); }
      else { const d = await res.json(); addToast('error', 'Error', d.message || 'No se pudo eliminar'); }
    } catch { addToast('error', 'Error', 'Fallo de conexión'); }
  };

  const handleDeletePost = () => {
    showConfirm('¿Eliminar publicación?', 'Esta acción no se puede deshacer.', confirmDelete, { confirmLabel: 'Eliminar permanentemente', danger: true });
  };

  // ── Render normal Shekael ──
  if (loading) {
    return (
      <div className={styles.layout}>
        <main className={styles.main}>
          <div className={styles.loadingSpinner} />
        </main>
      </div>
    );
  }

  if (!post) {
    return (
      <div className={styles.layout}>
        <main className={styles.main}>
          <div className={styles.header}>
            <button onClick={() => navigate(-1)} className={styles.backBtn}>←</button>
            <h2>Publicación no encontrada</h2>
          </div>
        </main>
      </div>
    );
  }

  if (post.type === 'video') {
    return <VideoDetailLayout post={post} comments={comments} commentText={commentText}
      onCommentChange={setCommentText} onSubmitComment={handleSubmitComment}
      isSubmitting={isSubmitting} recommendedPosts={recommendedPosts}
      likesCount={likesCount} isLiked={isLiked} onLike={handleLike}
      onBack={() => navigate(-1)} registerView={registerView} onDelete={handleDeletePost}
      commentsTotal={commentsTotal} commentsHasMore={commentsHasMore}
      commentsLoadingMore={commentsLoadingMore} onLoadMoreComments={loadMoreComments} />;
  }

  if (post.type === 'image') {
    return <ImageDetailLayout post={post} comments={comments} commentText={commentText}
      onCommentChange={setCommentText} onSubmitComment={handleSubmitComment}
      isSubmitting={isSubmitting} recommendedPosts={recommendedImagePosts}
      likesCount={likesCount} isLiked={isLiked} onLike={handleLike}
      onBack={() => navigate(-1)} onDelete={handleDeletePost}
      commentsTotal={commentsTotal} commentsHasMore={commentsHasMore}
      commentsLoadingMore={commentsLoadingMore} onLoadMoreComments={loadMoreComments} />;
  }

  return <TextDetailLayout post={post} comments={comments} commentText={commentText}
    onCommentChange={setCommentText} onSubmitComment={handleSubmitComment}
    isSubmitting={isSubmitting} recommendedPosts={recommendedTextPosts}
    likesCount={likesCount} isLiked={isLiked} onLike={handleLike}
    onDelete={handleDeletePost}
    commentsTotal={commentsTotal} commentsHasMore={commentsHasMore}
    commentsLoadingMore={commentsLoadingMore} onLoadMoreComments={loadMoreComments} />;
}
