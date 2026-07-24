import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPostDetail, createComment, getFeed } from '../api/posts.api';
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

// ── Fediverse Section ──
function FediverseDetailSection({ rawId, navigate }) {
  const { addToast } = useStore();
  const { token } = useStore();
  const parts = rawId.replace('fed__', '').split('__');
  const instanceDomain = parts[0] || '';
  const postId = parts.slice(1).join('');

  const [post, setPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [recommendedFed, setRecommendedFed] = useState([]);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!instanceDomain || !postId) return;
    setLoading(true);

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_URL}/federation/status/${instanceDomain}/${postId}`, { headers }).then(r => r.json()),
      fetch(`${API_URL}/federation/timeline?limit=8`, { headers }).then(r => r.json()),
    ])
      .then(([postData, timelineData]) => {
        if (postData?.success && postData.post) {
          setPost(postData.post);
          setReplies(postData.replies || []);

          // Mapear timeline como recomendados
          const tl = (timelineData?.posts || []);
          setRecommendedFed(
            tl
              .filter(p => String(p.id) !== String(postData.post.id))
              .slice(0, 8)
              .map(p => ({
                id: `fed__${extractInstance(p.instanceUrl || p.instance || instanceDomain)}__${p.id}`,
                display_name: p.author?.displayName || p.author?.username || 'Fediverso',
                content: stripHtml(p.content || '').slice(0, 70) + '...',
                avatar_url: p.author?.avatar || '',
              }))
          );
        } else setPost(null);
      })
      .catch(() => setPost(null))
      .finally(() => setLoading(false));
  }, [instanceDomain, postId, token]);

  function extractInstance(url) {
    if (!url) return instanceDomain;
    try { return new URL(url).hostname; } catch { return url; }
  }

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
            <button onClick={() => navigate(-1)} className={styles.backBtn}>
              ←
            </button>
            <h2>Publicación no encontrada</h2>
          </div>
        </main>
      </div>
    );
  }

  // Determinar tipo y mapear datos al formato de Shekael
  const fedType = post.firstMedia?.type === 'image' ? 'image'
    : post.firstMedia?.type === 'video' ? 'video' : 'text';

  const mappedPost = {
    id: post.id,
    author_id: `fed__${post.instance}__${post.author?.username}`,
    display_name: post.author?.displayName || post.author?.username,
    avatar_url: post.author?.avatar,
    content: fedType === 'image'
      ? `${post.firstMedia?.url}|||${post.author?.displayName || 'Imagen'}|||`
      : stripHtml(post.content),
    supports_count: 0,
    stellar_public_key: null,
    created_at: post.createdAt,
    type: fedType,
    has_liked: false,
    likes_count: post.stats?.likes || 0,
    // Para ImageDetailLayout: necesita parts[0] = url
    // Para VideoDetailLayout: necesita campos de video (ficticios)
    video_view_count: post.stats?.shares || 0,
    video_status: 'none',
    video_playback_id: null,
    video_r2_url: null,
    video_hls_r2_url: null,
    video_thumbnail_url: null,
    video_title: post.author?.displayName || 'Video',
    video_description: stripHtml(post.content).slice(0, 200),
    video_tags: null,
  };

  const fedComments = (replies || []).map(r => ({
    id: r.id,
    avatar_url: r.author?.avatar,
    display_name: r.author?.displayName || r.author?.username,
    content: stripHtml(r.content),
    created_at: r.createdAt,
  }));

  const handleFedLike = () => {
    window.open(post.url, '_blank', 'noopener,noreferrer');
  };

  const handleFedSubmitComment = (e) => {
    e.preventDefault();
    addToast('info', 'Para responder, abre la publicación en Mastodon');
    window.open(post.url, '_blank', 'noopener,noreferrer');
  };

  const sharedProps = {
    post: mappedPost,
    comments: fedComments,
    commentText,
    onCommentChange: setCommentText,
    onSubmitComment: handleFedSubmitComment,
    isSubmitting: false,
    recommendedPosts: recommendedFed,
    likesCount: mappedPost.likes_count,
    isLiked: false,
    onLike: handleFedLike,
    onBack: () => navigate(-1),
    onDelete: () => addToast('error', 'No puedes eliminar posts del Fediverso'),
  };

  if (fedType === 'video') {
    return <VideoDetailLayout {...sharedProps} registerView={() => {}} />;
  }
  if (fedType === 'image') {
    return <ImageDetailLayout {...sharedProps} />;
  }
  return <TextDetailLayout {...sharedProps} />;
}

// ══════════════════════════════════════════════════════
// PostDetail — componente PRINCIPAL (Shekael + Fediverso)
// ══════════════════════════════════════════════════════
export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, setVideoMode } = useStore();
  const { addToast, showConfirm } = useStore();
  const { verifyCompletion } = useQuests();

  // ── POST FEDERADO ──
  if (id.startsWith('fed__')) {
    return <FediverseDetailSection rawId={id} navigate={navigate} />;
  }

  // ── POST NORMAL SHEKAEL ──
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
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
      setCommentText('');
      addToast('success', 'Comentario enviado');
    } catch {
      addToast('error', 'Error', 'No se pudo enviar el comentario');
    } finally { setIsSubmitting(false); }
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
      onBack={() => navigate(-1)} registerView={registerView} onDelete={handleDeletePost} />;
  }

  if (post.type === 'image') {
    return <ImageDetailLayout post={post} comments={comments} commentText={commentText}
      onCommentChange={setCommentText} onSubmitComment={handleSubmitComment}
      isSubmitting={isSubmitting} recommendedPosts={recommendedImagePosts}
      likesCount={likesCount} isLiked={isLiked} onLike={handleLike}
      onBack={() => navigate(-1)} onDelete={handleDeletePost} />;
  }

  return <TextDetailLayout post={post} comments={comments} commentText={commentText}
    onCommentChange={setCommentText} onSubmitComment={handleSubmitComment}
    isSubmitting={isSubmitting} recommendedPosts={recommendedTextPosts}
    likesCount={likesCount} isLiked={isLiked} onLike={handleLike}
    onDelete={handleDeletePost} />;
}
