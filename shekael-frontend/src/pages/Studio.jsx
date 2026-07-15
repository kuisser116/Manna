import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import {
  LayoutDashboard, FileText, BarChart3, MessageCircle, DollarSign,
  Eye, Heart, Coins, MessageSquare, Trash2, ExternalLink, Edit3, Save, X,
  ChevronUp, AlertCircle, CheckCircle, ArrowLeft, Clock, ThumbsUp, Activity
} from 'lucide-react';
import useStore from '../store';
import useFeedbackModal from '../components/FeedbackModal/useFeedbackModal';
import ConfirmationModal from '../components/ConfirmationModal/ConfirmationModal';
import Avatar from '../components/Avatar/Avatar';
import { deletePost, updatePost, getMyComments, getMyStats, getMyOverview } from '../api/posts.api';
import styles from '../styles/pages/Studio.module.css';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'contenido', label: 'Contenido', icon: FileText },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'comentarios', label: 'Comentarios', icon: MessageCircle },
  { id: 'monetizar', label: 'Monetizar', icon: DollarSign },
];

function StatCard({ icon: Icon, label, value, format, className }) {
  return (
    <div className={`${styles.statCard} ${className || ''}`}>
      <div className={styles.statIcon}><Icon size={20} /></div>
      <div className={styles.statInfo}>
        <span className={styles.statLabel}>{label}</span>
        <span className={styles.statValue}>
          {format === 'decimal' ? (Number(value)?.toFixed(2) || '0') : (Number(value)?.toLocaleString() || '0')}
        </span>
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, value, label }) {
  return (
    <div className={styles.miniStat}>
      <Icon size={13} />
      <span>{Number(value)?.toLocaleString() || '0'}</span>
      {label && <span className={styles.miniLabel}>{label}</span>}
    </div>
  );
}

export default function Studio() {
  const navigate = useNavigate();
  const { user } = useStore();
  const { showSuccess, showError } = useFeedbackModal();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [posts, setPosts] = useState([]);
  const [overview, setOverview] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPost, setEditingPost] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState(null);

  // Refs for GSAP
  const dashboardRef = useRef(null);
  const statCardsRef = useRef([]);
  const tabContentRef = useRef(null);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [overRes, postsRes] = await Promise.all([
          getMyOverview(),
          getMyStats()
        ]);
        if (cancelled) return;
        setOverview(overRes.data.overview);
        setPosts(postsRes.data.posts || []);
      } catch (err) {
        console.error('Studio load error:', err);
        showError('Error', 'No se pudieron cargar tus datos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Load comments when tab changes
  useEffect(() => {
    if (activeTab !== 'comentarios' || comments.length > 0) return;
    getMyComments()
      .then(res => setComments(res.data.comments || []))
      .catch(() => {});
  }, [activeTab]);

  // GSAP entrance animations
  useEffect(() => {
    if (loading) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(`.${styles.tabHeader}`,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }
      );
      gsap.fromTo(`.${styles.statCard}`,
        { opacity: 0, y: 20, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.07, ease: 'power3.out' },
        '-=0.2'
      );
    }, tabContentRef);
    return () => ctx.revert();
  }, [loading, activeTab]);

  // Helpers
  const getPostTitle = (post) => {
    if (!post) return '';
    if (post.video_title) return post.video_title;
    if (post.type === 'image') return 'Imagen';
    if (post.type === 'video') return 'Video';
    return post.content?.substring(0, 60) + (post.content?.length > 60 ? '...' : '');
  };

  const getPostTypeIcon = (type) => {
    if (type === 'video') return '🎥';
    if (type === 'image') return '🖼';
    return '📝';
  };

  // Edit handlers
  const startEdit = (post) => {
    setEditingPost(post.id);
    setEditContent(post.content || '');
  };

  const cancelEdit = () => {
    setEditingPost(null);
    setEditContent('');
  };

  const saveEdit = async (postId) => {
    if (!editContent.trim()) return;
    setSavingEdit(true);
    try {
      await updatePost(postId, { content: editContent.trim() });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, content: editContent.trim(), edited_at: new Date().toISOString() } : p));
      showSuccess('Editado', 'Contenido actualizado.', true);
      setEditingPost(null);
    } catch (err) {
      showError('Error', 'No se pudo editar');
    }
    setSavingEdit(false);
  };

  // Delete handlers
  const confirmDelete = async () => {
    if (!postToDelete) return;
    try {
      await deletePost(postToDelete.id);
      showSuccess('Eliminado', 'Publicacion borrada.', true);
      setPosts(prev => prev.filter(p => p.id !== postToDelete.id));
    } catch {
      showError('Error', 'No se pudo eliminar');
    }
    setDeleteModalOpen(false);
  };

  // --- RENDER ---
  if (loading) {
    return (
      <div className={styles.layout}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Cargando tu estudio...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.brand}>
            <span className={styles.brandName}>Shekael Studio</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <Avatar avatarUrl={user?.avatar_url} name={user?.display_name} size="sm" />
          <span className={styles.userName}>{user?.display_name}</span>
        </div>
      </header>

      {/* Tabs */}
      <div className={styles.tabBar}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={styles.content} ref={tabContentRef}>
        {/* ───── DASHBOARD ───── */}
        {activeTab === 'dashboard' && (
          <div ref={dashboardRef}>
            <div className={styles.tabHeader}>
              <h2>Dashboard</h2>
              <p>Resumen de tu actividad en Shekael</p>
            </div>

            <div className={styles.statsGrid}>
              <StatCard icon={Eye} label="Vistas totales" value={overview?.totalViews} />
              <StatCard icon={Heart} label="Me gusta" value={overview?.totalLikes} />
              <StatCard icon={MessageSquare} label="Comentarios" value={overview?.totalComments} />
              <StatCard icon={Coins} label="Apoyos (MXNe)" value={overview?.totalSupports} format="decimal" />
            </div>

            <div className={styles.statsGrid}>
              <StatCard icon={FileText} label="Publicaciones" value={overview?.totalPosts} />
              <StatCard icon={CheckCircle} label="Activas" value={overview?.activePosts} />
              <StatCard icon={Activity} label="Este mes" value={overview?.postsThisMonth} />
            </div>

            {overview?.topPost && (
              <div className={styles.topPostCard}>
                <div className={styles.topPostHeader}>
                  <ChevronUp size={18} />
                  <span>Top publicacion</span>
                </div>
                <div className={styles.topPostBody}>
                  <span className={styles.topPostTitle}>{getPostTitle(overview.topPost)}</span>
                  <div className={styles.topPostStats}>
                    <MiniStat icon={Eye} value={overview.topPost.video_view_count} label="vistas" />
                    <MiniStat icon={Heart} value={overview.topPost.likes_count} label="likes" />
                    <MiniStat icon={Coins} value={overview.topPost.supports_count} label="apoyos" />
                  </div>
                </div>
              </div>
            )}

            {overview?.byType && (
              <div className={styles.byTypeCard}>
                <h3>Por tipo</h3>
                <div className={styles.byTypeGrid}>
                  {Object.entries(overview.byType).map(([type, count]) => (
                    <div key={type} className={styles.typePill}>
                      {getPostTypeIcon(type)} {type === 'micro-text' ? 'Texto' : type.charAt(0).toUpperCase() + type.slice(1)}
                      <span className={styles.typeCount}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ───── CONTENIDO ───── */}
        {activeTab === 'contenido' && (
          <div>
            <div className={styles.tabHeader}>
              <h2>Contenido</h2>
              <p>{posts.length} publicaciones</p>
            </div>

            {posts.length === 0 ? (
              <div className={styles.emptyState}>
                <FileText size={48} />
                <p>Aun no tienes publicaciones.</p>
              </div>
            ) : (
              <div className={styles.postsList}>
                {posts.map(post => (
                  <div key={post.id} className={`${styles.postCard} ${post.is_banned ? styles.postBanned : ''}`}>
                    <div className={styles.postMain}>
                      <div className={styles.postTypeBadge}>{getPostTypeIcon(post.type)}</div>
                      <div className={styles.postInfo}>
                        {editingPost === post.id ? (
                          <div className={styles.editArea}>
                            <textarea
                              className={styles.editTextarea}
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={3}
                              autoFocus
                            />
                            <div className={styles.editActions}>
                              <button className={styles.editSaveBtn} onClick={() => saveEdit(post.id)} disabled={savingEdit}>
                                <Save size={14} /> {savingEdit ? 'Guardando...' : 'Guardar'}
                              </button>
                              <button className={styles.editCancelBtn} onClick={cancelEdit}>
                                <X size={14} /> Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h3 className={styles.postTitle}>{getPostTitle(post)}</h3>
                            <div className={styles.postMeta}>
                              <span className={styles.postDate}>
                                {new Date(post.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                              <div className={`${styles.statusBadge} ${post.is_banned ? styles.banned : styles.active}`}>
                                {post.is_banned ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
                                {post.is_banned ? 'Baneado' : 'Activo'}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {editingPost !== post.id && (
                      <>
                        <div className={styles.postStats}>
                          <MiniStat icon={Eye} value={post.video_view_count} />
                          <MiniStat icon={Heart} value={post.likes_count} />
                          <MiniStat icon={Coins} value={post.supports_count} />
                        </div>

                        <div className={styles.postActions}>
                          <button className={styles.actionBtn} onClick={() => startEdit(post)} title="Editar">
                            <Edit3 size={16} />
                          </button>
                          <button
                            className={styles.actionBtn}
                            onClick={() => navigate(`/post/${post.id}`)}
                            title="Ver"
                          >
                            <ExternalLink size={16} />
                          </button>
                          <button
                            className={`${styles.actionBtn} ${styles.deleteBtn}`}
                            onClick={() => { setPostToDelete(post); setDeleteModalOpen(true); }}
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ───── ANALYTICS ───── */}
        {activeTab === 'analytics' && (
          <div>
            <div className={styles.tabHeader}>
              <h2>Analytics</h2>
              <p>Rendimiento detallado de tu contenido</p>
            </div>

            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Vistas por publicacion</h3>
                <div className={styles.barChart}>
                  {posts.slice(0, 10).map(post => {
                    const maxViews = Math.max(...posts.map(p => p.video_view_count || 0), 1);
                    const pct = ((post.video_view_count || 0) / maxViews) * 100;
                    return (
                      <div key={post.id} className={styles.barRow}>
                        <span className={styles.barLabel}>{getPostTitle(post).substring(0, 20)}</span>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={styles.barValue}>{post.video_view_count || 0}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={styles.analyticsCard}>
                <h3>Top por engagement</h3>
                <div className={styles.engagementList}>
                  {[...posts]
                    .sort((a, b) => ((b.likes_count || 0) + (b.supports_count || 0)) - ((a.likes_count || 0) + (a.supports_count || 0)))
                    .slice(0, 10)
                    .map((post, i) => (
                      <div key={post.id} className={styles.engagementRow}>
                        <span className={styles.engagementRank}>#{i + 1}</span>
                        <span className={styles.engagementTitle}>{getPostTitle(post).substring(0, 25)}</span>
                        <span className={styles.engagementScore}>
                          <Heart size={12} /> {post.likes_count || 0}
                          <Coins size={12} /> {post.supports_count || 0}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className={styles.analyticsSummary}>
              <div className={styles.summaryItem}>
                <span>Total vistas</span>
                <strong>{(overview?.totalViews || 0).toLocaleString()}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Total likes</span>
                <strong>{(overview?.totalLikes || 0).toLocaleString()}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Total comentarios</span>
                <strong>{(overview?.totalComments || 0).toLocaleString()}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Total apoyos MXNe</span>
                <strong>{(overview?.totalSupports || 0).toFixed(2)}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Publicaciones activas</span>
                <strong>{overview?.activePosts || 0}/{overview?.totalPosts || 0}</strong>
              </div>
            </div>
          </div>
        )}

        {/* ───── COMENTARIOS ───── */}
        {activeTab === 'comentarios' && (
          <div>
            <div className={styles.tabHeader}>
              <h2>Comentarios</h2>
              <p>{comments.length} comentarios en tus publicaciones</p>
            </div>

            {comments.length === 0 ? (
              <div className={styles.emptyState}>
                <MessageCircle size={48} />
                <p>No hay comentarios en tus publicaciones aun.</p>
              </div>
            ) : (
              <div className={styles.commentsList}>
                {comments.map(c => (
                  <div key={c.id} className={styles.commentCard}>
                    <div className={styles.commentAuthor}>
                      <Avatar avatarUrl={c.author_avatar} name={c.author_name} size="xs" />
                      <span className={styles.commentName}>{c.author_name || 'Alguien'}</span>
                      <span className={styles.commentDate}>
                        {new Date(c.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <p className={styles.commentText}>{c.content}</p>
                    <div className={styles.commentPostRef}>
                      En: <span className={styles.commentPostTitle}>{c.post_title}</span>
                      <button className={styles.commentViewBtn} onClick={() => navigate(`/post/${c.post_id}`)}>
                        <ExternalLink size={12} /> Ver post
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ───── MONETIZAR ───── */}
        {activeTab === 'monetizar' && (
          <div>
            <div className={styles.tabHeader}>
              <h2>Monetizar</h2>
              <p>Ganancias y opciones de monetizacion</p>
            </div>

            <div className={styles.monetizePlaceholder}>
              <div className={styles.monetizeIcon}>
                <DollarSign size={48} />
              </div>
              <h3>Proximamente</h3>
              <p>Estamos construyendo el sistema de monetizacion para creadores en Shekael.</p>

              <div className={styles.monetizeFeatures}>
                <div className={styles.monetizeFeature}>
                  <div className={styles.featureIcon}>📢</div>
                  <div>
                    <strong>Anuncios</strong>
                    <p>Gana MXNe cuando otros usuarios vean anuncios en tu contenido</p>
                  </div>
                </div>
                <div className={styles.monetizeFeature}>
                  <div className={styles.featureIcon}>💛</div>
                  <div>
                    <strong>Apoyos directos</strong>
                    <p>Recibe donaciones en MXNe de tu comunidad</p>
                  </div>
                </div>
                <div className={styles.monetizeFeature}>
                  <div className={styles.featureIcon}>🔒</div>
                  <div>
                    <strong>Contenido exclusivo</strong>
                    <p>Publica contenido solo para seguidores que apoyen tu trabajo</p>
                  </div>
                </div>
              </div>

              <div className={styles.comingSoonBadge}>
                <Clock size={16} />
                <span>Disponible en una proxima actualizacion</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Eliminar publicacion?"
        message={`Se borrara "${getPostTitle(postToDelete)}" permanentemente con todos sus datos.`}
        confirmText="Eliminar"
      />
    </div>
  );
}
