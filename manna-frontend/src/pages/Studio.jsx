import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    BarChart2, 
    Eye, 
    Heart, 
    Coins, 
    AlertCircle, 
    CheckCircle, 
    Clock, 
    Undo2,
    Search,
    MessageCircle,
    Trash2,
    ArrowLeft,
    LayoutDashboard,
    ExternalLink
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import useStore from '../store';
import useFeedbackModal from '../components/FeedbackModal/useFeedbackModal';
import ConfirmationModal from '../components/ConfirmationModal/ConfirmationModal';
import AppealModal from '../components/AppealModal/AppealModal';
import Avatar from '../components/Avatar/Avatar';
import { deletePost } from '../api/posts.api';
import logoImg from '../assets/personaje_1.12.png';
import styles from '../styles/pages/Studio.module.css';

const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud';

export default function Studio() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { token, user } = useStore();
    const { showSuccess, showError } = useFeedbackModal();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAppealOpen, setIsAppealOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedPost, setSelectedPost] = useState(null);
    const [stats, setStats] = useState({
        totalViews: 0,
        totalLikes: 0,
        totalSupports: 0,
        activePosts: 0,
        bannedPosts: 0
    });

    const fetchStats = async () => {
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
            const res = await fetch(`${API_URL}/posts/user/my-stats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Error al obtener estadísticas');
            const data = await res.json();
            
            setPosts(data.posts);
            
            const totals = data.posts.reduce((acc, post) => ({
                totalViews: acc.totalViews + (post.video_view_count || 0),
                totalLikes: acc.totalLikes + (post.likes_count || 0),
                totalSupports: acc.totalSupports + (post.supports_count || 0),
                activePosts: acc.activePosts + (post.is_banned ? 0 : 1),
                bannedPosts: acc.bannedPosts + (post.is_banned ? 1 : 0)
            }), { totalViews: 0, totalLikes: 0, totalSupports: 0, activePosts: 0, bannedPosts: 0 });
            
            setStats(totals);
        } catch (error) {
            console.error('Studio fetch error:', error);
            showError('Error', 'No se pudieron cargar tus estadísticas');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    const handleAppealClick = (post) => {
        setSelectedPost(post);
        setIsAppealOpen(true);
    };

    const confirmAppeal = async (reason) => {
        setIsAppealOpen(false);
        if (!selectedPost || !reason) return;

        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
            const res = await fetch(`${API_URL}/moderation/appeal/${selectedPost.id}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ reason })
            });

            if (res.ok) {
                showSuccess('Apelación enviada', 'Revisaremos tu caso lo antes posible.', true);
                fetchStats();
            } else {
                const errData = await res.json();
                showError('Error', errData.message || 'No se pudo enviar la apelación');
            }
        } catch (error) {
            showError('Error', 'Error de conexión');
        }
    };

    const handleDeleteClick = (post) => {
        setSelectedPost(post);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!selectedPost) return;
        try {
            await deletePost(selectedPost.id);
            showSuccess('Eliminado', 'Tu publicación ha sido borrada.', true);
            setPosts(prev => prev.filter(p => p.id !== selectedPost.id));
            // Opcional: Recalcular estadísticas locales
        } catch (error) {
            showError('Error', 'No se pudo eliminar la publicación');
        }
    };

    const getThumbnail = (post) => {
        if (!post) return null;
        if (post.video_thumbnail_url) return post.video_thumbnail_url;
        
        const parts = (post.content || '').split('|||');
        if (post.type === 'video') {
            if (parts[1] && !parts[1].startsWith('http') && !parts[1].startsWith('r2://')) {
                return `${PINATA_GATEWAY}/ipfs/${parts[1]}`;
            }
        } else if (post.type === 'image') {
            if (parts[0] && !parts[0].startsWith('http') && !parts[0].startsWith('r2://')) {
                return `${PINATA_GATEWAY}/ipfs/${parts[0]}`;
            }
            if (parts[0] && parts[0].startsWith('http')) return parts[0];
        }
        return null;
    };

    const getPostTitle = (post) => {
        if (!post) return '';
        if (post.video_title) return post.video_title;
        
        const parts = (post.content || '').split('|||');
        if (post.type === 'video') return parts[1] || 'Video sin título';
        if (post.type === 'image') return parts[2] || parts[1] || 'Imagen de Manná';
        return post.content?.substring(0, 50) + (post.content?.length > 50 ? '...' : '');
    };

    if (loading) return <div className={styles.loading}>{t('common.loading')}</div>;

    return (
        <div className={styles.portalWrapper}>
            <header className={styles.portalHeader}>
                <div className={styles.headerLeft}>
                    <Link to="/feed" className={styles.backBtn}>
                        <ArrowLeft size={20} />
                        <span>Volver a Manná</span>
                    </Link>
                    <div className={styles.divider} />
                    <div className={styles.brand}>
                        <img src={logoImg} alt="Manna" className={styles.headerLogo} />
                        <span className={styles.brandName}>Studio</span>
                    </div>
                </div>
                <div className={styles.headerRight}>
                    <div className={styles.userSection}>
                        <Avatar avatarUrl={user?.avatar_url} name={user?.display_name} size="sm" />
                        <span className={styles.userName}>{user?.display_name}</span>
                    </div>
                </div>
            </header>

            <div className={styles.container}>
                <header className={styles.pageHeader}>
                    <div className={styles.titleArea}>
                        <BarChart2 className={styles.mainIcon} size={28} />
                        <div>
                            <h1>Estadísticas de Creador</h1>
                            <p>Gestiona tu contenido y analiza tu impacto en la comunidad.</p>
                        </div>
                    </div>
                </header>

                <section className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon}><Eye size={20} /></div>
                        <div className={styles.statInfo}>
                            <span className={styles.statLabel}>Vistas totales</span>
                            <span className={styles.statValue}>{stats.totalViews.toLocaleString()}</span>
                        </div>
                        <div className={styles.statDecoration}><Eye size={60} /></div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'rgba(224, 36, 94, 0.1)', color: '#e0245e' }}><Heart size={20} /></div>
                        <div className={styles.statInfo}>
                            <span className={styles.statLabel}>Me gusta</span>
                            <span className={styles.statValue}>{stats.totalLikes.toLocaleString()}</span>
                        </div>
                        <div className={styles.statDecoration} style={{ color: 'rgba(224, 36, 94, 0.05)' }}><Heart size={60} /></div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--color-accent)' }}><Coins size={20} /></div>
                        <div className={styles.statInfo}>
                            <span className={styles.statLabel}>Apoyos (MXNe)</span>
                            <span className={styles.statValue}>{stats.totalSupports.toLocaleString()}</span>
                        </div>
                        <div className={styles.statDecoration} style={{ color: 'rgba(212, 175, 55, 0.05)' }}><Coins size={60} /></div>
                    </div>
                </section>

                <div className={styles.contentSection}>
                    <div className={styles.sectionHeader}>
                        <h2>Tus Publicaciones</h2>
                        <span className={styles.postCount}>{posts.length} posts</span>
                    </div>

                    <div className={styles.postsList}>
                        {posts.length === 0 ? (
                            <div className={styles.emptyState}>
                                <AlertCircle size={48} color="var(--color-text-muted)" />
                                <p>Aún no tienes publicaciones.</p>
                                <Link to="/upload" className={styles.uploadCta}>Subir contenido</Link>
                            </div>
                        ) : (
                            posts.map(post => (
                                <div key={post.id} className={styles.postCard}>
                                    <div className={styles.postMain}>
                                        <div className={styles.postThumbWrapper}>
                                            {getThumbnail(post) ? (
                                                <img src={getThumbnail(post)} alt="Thumbnail" className={styles.postThumb} />
                                            ) : (
                                                <div className={styles.postThumbFallback}>
                                                    {post.type === 'video' ? '🎥' : post.type === 'image' ? '🖼️' : '📝'}
                                                </div>
                                            )}
                                            <div className={styles.postTypeBadge}>
                                                {post.type.toUpperCase()}
                                            </div>
                                        </div>
                                        <div className={styles.postInfo}>
                                            <h3 className={styles.postTitle}>{getPostTitle(post)}</h3>
                                            <div className={styles.postMeta}>
                                                <span className={styles.postDate}>{new Date(post.created_at).toLocaleDateString()}</span>
                                                <div className={`${styles.statusBadge} ${post.is_banned ? styles.banned : styles.active}`}>
                                                    {post.is_banned ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
                                                    {post.is_banned ? 'Baneado' : 'Activo'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles.postStats}>
                                        <div className={styles.miniStat} title="Vistas">
                                            <Eye size={14} />
                                            <span>{post.video_view_count || 0}</span>
                                        </div>
                                        <div className={styles.miniStat} title="Me gusta">
                                            <Heart size={14} />
                                            <span>{post.likes_count || 0}</span>
                                        </div>
                                        <div className={styles.miniStat} title="Apoyos">
                                            <Coins size={14} />
                                            <span>{post.supports_count || 0}</span>
                                        </div>
                                    </div>

                                    <div className={styles.postActions}>
                                        <Link to={`/post/${post.id}`} className={styles.actionBtn} title="Ver publicación">
                                            <ExternalLink size={18} />
                                        </Link>
                                        
                                        {post.is_banned && (
                                            <button 
                                                className={`${styles.actionBtn} ${styles.appealBtn}`}
                                                onClick={() => handleAppealClick(post)}
                                                title="Apelar sanción"
                                            >
                                                <Undo2 size={18} />
                                            </button>
                                        )}

                                        <button 
                                            className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                            onClick={() => handleDeleteClick(post)}
                                            title="Eliminar permanentemente"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <AppealModal 
                isOpen={isAppealOpen}
                onClose={() => setIsAppealOpen(false)}
                onConfirm={confirmAppeal}
                postTitle={getPostTitle(selectedPost)}
            />

            <ConfirmationModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="¿Eliminar publicación?"
                message={`Estás a punto de eliminar "${getPostTitle(selectedPost)}". Esta acción borrará todas las estadísticas y archivos asociados permanentemente.`}
                confirmText="Eliminar de mi Studio"
            />
        </div>
    );
}

