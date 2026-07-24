import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPostDetail, createComment, getFeed } from '../api/posts.api';

import FediversePostDetail from './FediversePostDetailHandler';
import PostCard from '../components/PostCard/PostCard';
import VideoDetailLayout from '../components/VideoDetailLayout/VideoDetailLayout';
import ImageDetailLayout from '../components/ImageDetailLayout/ImageDetailLayout';
import TextDetailLayout from '../components/TextDetailLayout/TextDetailLayout';
import useStore from '../store';
import { likePostCounter, unlikePost } from '../api/quests.api';
import { useQuests } from '../hooks/useQuests';
import styles from '../styles/pages/PostDetail.module.css';

const API_URL = import.meta.env.VITE_API_URL || location.origin;

export default function PostDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { token, setVideoMode } = useStore();

    // ── Detectar si es post federado ──
    // Formato: fed__instanceDomain__postId
    const isFed = id.startsWith('fed__');
    if (isFed) {
        return <FediversePostDetail id={id} />;
    }

    // ── Post normal de Shekael ──
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
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isLiking, setIsLiking] = useState(false);

    const { addToast, showConfirm } = useStore();
    const { verifyCompletion } = useQuests();

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
            if (res.ok) { verifyCompletion(true); } else { verifyCompletion(false); }
        } catch (e) { verifyCompletion(false); }
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
        } catch (err) {
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
            else { const data = await res.json(); addToast('error', 'Error', data.message || 'No se pudo eliminar'); }
        } catch { addToast('error', 'Error', 'Fallo de conexión'); }
    };

    const handleDeletePost = () => {
        showConfirm('¿Eliminar publicación?', 'Esta acción no se puede deshacer.', confirmDelete, { confirmLabel: 'Eliminar permanentemente', danger: true });
    };

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
                            <ArrowLeft size={24} />
                        </button>
                        <h2>Publicación no encontrada</h2>
                    </div>
                </main>
            </div>
        );
    }

    if (post.type === 'video') {
        return <VideoDetailLayout post={post} comments={comments} commentText={commentText} onCommentChange={setCommentText} onSubmitComment={handleSubmitComment} isSubmitting={isSubmitting} recommendedPosts={recommendedPosts} likesCount={likesCount} isLiked={isLiked} onLike={handleLike} onBack={() => navigate(-1)} registerView={registerView} onDelete={handleDeletePost} />;
    }

    if (post.type === 'image') {
        return <ImageDetailLayout post={post} comments={comments} commentText={commentText} onCommentChange={setCommentText} onSubmitComment={handleSubmitComment} isSubmitting={isSubmitting} recommendedPosts={recommendedImagePosts} likesCount={likesCount} isLiked={isLiked} onLike={handleLike} onBack={() => navigate(-1)} onDelete={handleDeletePost} />;
    }

    return <TextDetailLayout post={post} comments={comments} commentText={commentText} onCommentChange={setCommentText} onSubmitComment={handleSubmitComment} isSubmitting={isSubmitting} recommendedPosts={recommendedTextPosts} likesCount={likesCount} isLiked={isLiked} onLike={handleLike} onDelete={handleDeletePost} />;
}
