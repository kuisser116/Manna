import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPostDetail, createComment, getFeed } from '../api/posts.api';
import useFeedbackModal from '../components/FeedbackModal/useFeedbackModal';
import FeedbackModal from '../components/FeedbackModal/FeedbackModal';
import PostCard from '../components/PostCard/PostCard';
import VideoDetailLayout from '../components/VideoDetailLayout/VideoDetailLayout';
import ImageDetailLayout from '../components/ImageDetailLayout/ImageDetailLayout';
import TextDetailLayout from '../components/TextDetailLayout/TextDetailLayout';
import ConfirmationModal from '../components/ConfirmationModal/ConfirmationModal';
import useStore from '../store';
import { likePostCounter, unlikePost } from '../api/quests.api';
import { useQuests } from '../hooks/useQuests';
import styles from '../styles/pages/PostDetail.module.css';

export default function PostDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token, setVideoMode } = useStore();

    const [post, setPost] = useState(null);
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [commentText, setCommentText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [recommendedPosts, setRecommendedPosts] = useState([]);
    const [recommendedImagePosts, setRecommendedImagePosts] = useState([]);
    const [recommendedTextPosts, setRecommendedTextPosts] = useState([]);

    // Likes
    const [isLiked, setIsLiked] = useState(false);
    const [likesCount, setLikesCount] = useState(0);
    const [viewRegistered, setViewRegistered] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isLiking, setIsLiking] = useState(false);

    const { modalState, showSuccess, showError, hideModal } = useFeedbackModal();
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
                showError('Error', 'No se pudo cargar la publicación');
            } finally {
                setLoading(false);
            }
        };

        fetchPost();

        // Limpiar modo video al salir de la página
        return () => {
            setVideoMode('default');
        };
    }, [id, setVideoMode, showError]);

    // Cargar posts recomendados (videos)
    useEffect(() => {
        if (!post || post.type !== 'video') return;
        getFeed(0)
            .then(({ data }) => {
                const posts = Array.isArray(data) ? data : (data.posts || []);
                setRecommendedPosts(posts.filter((p) => p.type === 'video' && p.id !== post.id));
            })
            .catch(() => { });
    }, [post?.id, post?.type]);

    // Cargar posts recomendados (imágenes)
    useEffect(() => {
        if (!post || post.type !== 'image') return;
        getFeed(0)
            .then(({ data }) => {
                const posts = Array.isArray(data) ? data : (data.posts || []);
                setRecommendedImagePosts(posts.filter((p) => p.type === 'image' && p.id !== post.id));
            })
            .catch(() => { });
    }, [post?.id, post?.type]);

    // Cargar posts recomendados (texto)
    useEffect(() => {
        if (!post || (post.type === 'video' || post.type === 'image')) return;
        getFeed(0)
            .then(({ data }) => {
                const posts = Array.isArray(data) ? data : (data.posts || []);
                setRecommendedTextPosts(posts.filter((p) => p.type !== 'video' && p.type !== 'image' && p.id !== post.id));
            })
            .catch(() => { });
    }, [post?.id, post?.type]);

    const handleLike = async () => {
        if (isLiking) return;
        setIsLiking(true);
        const wasLiked = isLiked;
        try {
            setIsLiked(!wasLiked);
            setLikesCount((prev) => wasLiked ? Math.max(0, prev - 1) : prev + 1);

            let res;
            if (wasLiked) {
                res = await unlikePost(id);
            } else {
                res = await likePostCounter(id);
            }

            if (!wasLiked && res?.data?.missionCompleted) verifyCompletion(true);
        } catch {
            setIsLiked(wasLiked);
            setLikesCount((prev) => wasLiked ? prev + 1 : Math.max(0, prev - 1));
        } finally {
            setIsLiking(false);
        }
    };

    const registerView = async (watchedSeconds = 0, videoDuration = 0) => {
        if (viewRegistered) return;
        setViewRegistered(true);
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
            const res = await fetch(`${API_URL}/posts/${id}/view`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ watchedSeconds, videoDuration })
            });

            if (res.ok) {
                console.log("Vista registrada exitosamente");
                // Importante: Refrescar misiones para que suba la barra
                verifyCompletion(true);
            } else {
                const errorData = await res.json();
                console.warn("Error en registro de vista:", errorData.message);
                // Refrescar de todos modos para sincronizar estado
                verifyCompletion(false);
            }
        } catch (e) {
            console.error('Error registrando vista', e);
            verifyCompletion(false);
        }
    };

    useEffect(() => {
        if (post && post.type !== 'video' && !viewRegistered) {
            registerView();
        }
    }, [post, viewRegistered]);

    const handleSubmitComment = async (e) => {
        if (e) e.preventDefault();
        if (!commentText.trim()) return;
        setIsSubmitting(true);
        try {
            const { data } = await createComment(id, commentText);
            setComments((prev) => [...prev, data.comment]);
            setCommentText('');
            showSuccess('¡Comentario enviado!', '', true);
        } catch (err) {
            console.error(err);
            showError('Error', 'No se pudo enviar el comentario');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeletePost = () => {
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
            const res = await fetch(`${API_URL}/posts/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                showSuccess('Publicación eliminada', 'Tu contenido ha sido borrado permanentemente.', true);
                setTimeout(() => navigate('/feed'), 2000);
            } else {
                const data = await res.json();
                showError('Error', data.message || 'No se pudo eliminar la publicación');
            }
        } catch (err) {
            showError('Error', 'Fallo de conexión');
        }
    };

    // ── Loading ──
    if (loading) {
        return (
            <div className={styles.layout}>
                <main className={styles.main}>
                    <div className={styles.loadingSpinner} />
                </main>

            </div>
        );
    }

    // ── Not found ──
    if (!post) {
        return (
            <div className={styles.layout}>
                <main className={styles.main}>
                    <div className={styles.header}>
                        <button onClick={() => navigate(-1)} className={styles.backBtn}>
                            <ArrowLeft size={24} />
                        </button>
                        <h2>Post no encontrado</h2>
                    </div>
                </main>

            </div>
        );
    }

    // ── Video ──
    if (post.type === 'video') {
        return (
            <>
                <VideoDetailLayout
                    post={post}
                    comments={comments}
                    commentText={commentText}
                    onCommentChange={setCommentText}
                    onSubmitComment={handleSubmitComment}
                    isSubmitting={isSubmitting}
                    recommendedPosts={recommendedPosts}
                    likesCount={likesCount}
                    isLiked={isLiked}
                    onLike={handleLike}
                    onBack={() => navigate(-1)}
                    registerView={registerView}
                    onDelete={handleDeletePost}
                />
                <FeedbackModal
                    isOpen={modalState.isOpen}
                    onClose={hideModal}
                    type={modalState.type}
                    title={modalState.title}
                    message={modalState.message}
                    showCloseButton={modalState.showCloseButton}
                    autoClose={modalState.autoClose}
                    autoCloseDelay={modalState.autoCloseDelay}
                />
                <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={confirmDelete}
                    title="¿Eliminar publicación?"
                    message="Esta acción no se puede deshacer y borrará permanentemente tu contenido y sus interacciones."
                    confirmText="Eliminar permanentemente"
                />
            </>
        );
    }

    // ── Image ──
    if (post.type === 'image') {
        return (
            <>
                <ImageDetailLayout
                    post={post}
                    comments={comments}
                    commentText={commentText}
                    onCommentChange={setCommentText}
                    onSubmitComment={handleSubmitComment}
                    isSubmitting={isSubmitting}
                    recommendedPosts={recommendedImagePosts}
                    likesCount={likesCount}
                    isLiked={isLiked}
                    onLike={handleLike}
                    onBack={() => navigate(-1)}
                    onDelete={handleDeletePost}
                />
                <FeedbackModal
                    isOpen={modalState.isOpen}
                    onClose={hideModal}
                    type={modalState.type}
                    title={modalState.title}
                    message={modalState.message}
                    showCloseButton={modalState.showCloseButton}
                    autoClose={modalState.autoClose}
                    autoCloseDelay={modalState.autoCloseDelay}
                />
                <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={confirmDelete}
                    title="¿Eliminar publicación?"
                    message="Esta acción no se puede deshacer y borrará permanentemente tu contenido y sus interacciones."
                    confirmText="Eliminar permanentemente"
                />
            </>
        );
    }

    // ── Text / Others (Base Mode) ──
    return (
        <>
            <TextDetailLayout
                post={post}
                comments={comments}
                commentText={commentText}
                onCommentChange={setCommentText}
                onSubmitComment={handleSubmitComment}
                isSubmitting={isSubmitting}
                recommendedPosts={recommendedTextPosts}
                likesCount={likesCount}
                isLiked={isLiked}
                onLike={handleLike}
                onDelete={handleDeletePost}
            />
            <FeedbackModal
                isOpen={modalState.isOpen}
                onClose={hideModal}
                type={modalState.type}
                title={modalState.title}
                message={modalState.message}
                showCloseButton={modalState.showCloseButton}
                autoClose={modalState.autoClose}
                autoCloseDelay={modalState.autoCloseDelay}
            />
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="¿Eliminar publicación?"
                message="Esta acción no se puede deshacer y borrará permanentemente tu contenido y sus interacciones."
                confirmText="Eliminar permanentemente"
            />
        </>
    );
}
