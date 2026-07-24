import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ExternalLink, FileText,
  UserPlus, UserCheck, Camera, QrCode,
  LayoutGrid, Eye, MessageCircle, Share, Flag,
  Copy, Check, ImagePlus, CalendarDays, Settings, BarChart3
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ProfileEditModal from '../components/ProfileEditModal/ProfileEditModal';
import useStore from '../store';
import { getUserProfile, updateAvatar, updateProfile, updateCover } from '../api/users.api';
import { getUserPosts } from '../api/posts.api';
import PostCard from '../components/PostCard/PostCard';
import FediversePostCard from '../components/FediversePostCard/FediversePostCard';
import layoutStyles from '../styles/pages/PostDetail.module.css';
import styles from '../styles/pages/Profile.module.css';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';


const Icons = {
  Grid: () => <LayoutGrid size={14} />,
  Heart: ({ filled = false }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  Bookmark: ({ filled = false }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

// ── Perfil del Fediverso (dentro de Profile.jsx, sin archivo aparte) ──
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function formatCount(n) {
  if (!n) return 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n;
}

function FediverseProfileView() {
  const { instance, username: routeUsername } = useParams();
  const navigate = useNavigate();

  const instanceDomain = instance || '';
  const username = routeUsername || '';

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!instanceDomain || !username) return;
    setLoading(true);

    const handle = `@${username}@${instanceDomain}`;
    const token = localStorage.getItem('Shekael_token');

    fetch(`${API_URL}/federation/account-profile/${encodeURIComponent(handle)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data?.success) {
          setProfile(data.account);
          setPosts(data.posts || []);
        } else {
          setError('No se pudo cargar el perfil');
        }
      })
      .catch(() => setError('Error al conectar con el Fediverso'))
      .finally(() => setLoading(false));
  }, [instanceDomain, username]);

  if (loading) {
    return (
      <div className={layoutStyles.layout}>
        <main className={layoutStyles.main}>
          <div className={layoutStyles.loadingSpinner} />
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={layoutStyles.layout}>
        <main className={layoutStyles.main}>
          <div className={layoutStyles.header}>
            <button onClick={() => navigate(-1)} className={layoutStyles.backBtn}>
              <ArrowLeft size={24} />
            </button>
            <h2>Perfil no encontrado</h2>
          </div>
          <p style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
            {error || 'Este perfil no está disponible en el Fediverso'}
          </p>
        </main>
      </div>
    );
  }

  const acct = profile;

  return (
    <div className={layoutStyles.layout}>
      <main className={layoutStyles.main}>
        <div className={layoutStyles.header}>
          <button onClick={() => navigate(-1)} className={layoutStyles.backBtn}>
            <ArrowLeft size={24} />
          </button>
          <h2>Perfil</h2>
          <a href={acct.url} target="_blank" rel="noopener noreferrer"
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--color-primary)', borderRadius: 8 }}>
            <ExternalLink size={14} /> Mastodon
          </a>
        </div>

        <div style={{ height: 200, background: 'var(--color-surface-2)', borderRadius: 12, overflow: 'hidden', margin: '0 24px' }}>
          {acct.header && <img src={acct.header} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>

        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: -40, marginBottom: 16 }}>
            <img
              src={acct.avatar}
              alt=""
              style={{ width: 80, height: 80, borderRadius: '50%', border: '3px solid var(--color-bg)', objectFit: 'cover' }}
              onError={e => { e.target.style.display = 'none'; }}
            />
            <div style={{ marginLeft: 16, flex: 1 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                {acct.displayName || acct.username}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                @{username}@{instanceDomain}
              </p>
            </div>
          </div>

          {acct.note && (
            <div style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.6, marginBottom: 16 }}>
              {acct.note.replace(/<[^>]+>/g, '')}
            </div>
          )}

          <div style={{ display: 'flex', gap: 24, marginBottom: 16, fontSize: 13 }}>
            <span><strong>{formatCount(acct.statusesCount || acct.statuses_count)}</strong> <span style={{ color: 'var(--color-text-muted)' }}>posts</span></span>
            <span><strong>{formatCount(acct.followersCount || acct.followers_count)}</strong> <span style={{ color: 'var(--color-text-muted)' }}>seguidores</span></span>
            <span><strong>{formatCount(acct.followingCount || acct.following_count)}</strong> <span style={{ color: 'var(--color-text-muted)' }}>siguiendo</span></span>
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            Últimas publicaciones ({posts.length})
          </h3>

          {posts.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: 40 }}>
              <FileText size={24} opacity={0.3} /><br />
              No hay publicaciones disponibles de este usuario
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 80 }}>
              {posts.map((post, i) => (
                <FediversePostCard key={post.id || i} post={post} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export { FediverseProfileView };

export default function Profile() {
  const { t } = useTranslation();
  const { id: profileId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, privacy } = useStore();

  const [userPosts, setUserPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [coverUrl, setCoverUrl] = useState(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const coverInputRef = useRef(null);
  const avatarInputRef = useRef(null);

  const handleCoverChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setCoverUrl(preview);
    setCoverUploading(true);
    try {
      const { data } = await updateCover(file);
      if (data?.coverUrl) {
        URL.revokeObjectURL(preview);
        setCoverUrl(data.coverUrl);
      }
    } catch {
      // Keep optimistic local preview when upload fails.
    } finally {
      setCoverUploading(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setProfileData(prev => ({ ...prev, avatarUrl: preview }));
    setAvatarUploading(true);
    try {
      const { data } = await updateAvatar(file);
      if (data?.avatarUrl) {
        URL.revokeObjectURL(preview);
        setProfileData(prev => ({ ...prev, avatarUrl: data.avatarUrl }));
      }
    } catch {
      // Keep optimistic local preview
    } finally {
      setAvatarUploading(false);
    }
  };

  const isOwnProfile = !profileId || currentUser?.id === profileId;

  const [profileData, setProfileData] = useState(isOwnProfile ? currentUser : null);
  const [profileLoading, setProfileLoading] = useState(!isOwnProfile);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);


  const handleCopyWallet = () => {
    if (!profileData?.stellarPublicKey) return;
    navigator.clipboard.writeText(profileData.stellarPublicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [profileId]);

  useEffect(() => {
    const targetId = isOwnProfile ? currentUser?.id : profileId;
    if (!targetId) return;

    if (isOwnProfile) {
      setProfileData(currentUser);
    } else {
      setProfileLoading(true);
      // Resetear datos ajenos para no mostrar datos del usuario actual
      setProfileData(null);
    }

    getUserProfile(targetId)
      .then(({ data }) => {
        const userData = data.user || data;

        // Normalizar campos (tanto para propio como ajeno)
        const normalized = {
          id: userData.id,
          displayName: userData.displayName || userData.display_name || 'Usuario',
          username: userData.username || null,
          handle: userData.handle || 'usuario',
          bio: userData.bio || '',
          avatarUrl: userData.avatarUrl || userData.avatar_url || null,
          stellarPublicKey: userData.stellarPublicKey || userData.stellar_public_key || null,
          createdAt: userData.createdAt || userData.created_at,
          postsCount: userData.postsCount || userData.posts_count || 0,
          followersCount: userData.followersCount || userData.followers_count || 0,
          followingCount: userData.followingCount || userData.following_count || 0,
        };

        if (isOwnProfile) {
          // Propio perfil: fusionar con datos actuales del store
          setProfileData(prev => ({ ...prev, ...normalized }));
          if (userData.avatar_url && !userData.avatarUrl) {
            normalized.avatarUrl = userData.avatar_url;
            setProfileData(prev => ({ ...prev, avatarUrl: userData.avatar_url }));
          }
          // Actualizar store con username si cambió
          if (normalized.username && normalized.username !== currentUser?.username) {
            useStore.getState().setUser({ ...currentUser, username: normalized.username });
          }
        } else {
          // Perfil ajeno: SOLO datos del servidor
          setProfileData(normalized);
        }

        // Cover para AMBOS casos (propio y ajeno)
        const cover = userData.coverUrl || userData.cover_url;
        if (cover) setCoverUrl(cover);
      })
      .catch(() => {
        setProfileData({
          id: profileId,
          displayName: 'Usuario',
          handle: 'no encontrado',
          stellarPublicKey: null
        });
      })
      .finally(() => setProfileLoading(false));
  }, [isOwnProfile, profileId, currentUser]);

  useEffect(() => {
    const targetId = isOwnProfile ? currentUser?.id : profileId;
    if (!targetId) return;

    setPostsLoading(true);

    getUserPosts(targetId)
      .then(({ data }) => {
        const posts = data.posts || [];
        const normalizedPosts = posts.map((post) => {
          const mediaType = post.mediaType || post.media_type || post.type || post.post_type || 'text';
          return {
            ...post,
            mediaType: String(mediaType).toLowerCase(),
            created_at: post.createdAt || post.created_at
          };
        });

        if (activeTab === 'videos') {
          setUserPosts(normalizedPosts.filter((post) => post.mediaType.includes('video')));
          return;
        }

        if (activeTab === 'images') {
          setUserPosts(normalizedPosts.filter((post) => post.mediaType.includes('image')));
          return;
        }

        if (activeTab === 'text') {
          setUserPosts(normalizedPosts.filter((post) => !post.mediaType.includes('video') && !post.mediaType.includes('image')));
          return;
        }

        setUserPosts(normalizedPosts);
      })
      .catch((err) => {
        console.error('Error fetching user posts:', err);
        setUserPosts([]);
      })
      .finally(() => setPostsLoading(false));
  }, [isOwnProfile, currentUser?.id, profileId, activeTab]);

  const handleProfileUpdate = async ({ displayName, bio, avatarFile }) => {
    let newAvatarUrl = profileData.avatarUrl;

    if (avatarFile) {
      const { data } = await updateAvatar(avatarFile);
      newAvatarUrl = data.avatarUrl;
    }

    if (displayName !== undefined || bio !== undefined) {
      await updateProfile({ displayName, bio });
    }

    const newName = displayName !== undefined ? displayName : profileData.displayName;
    const newBio = bio !== undefined ? bio : profileData.bio;

    setProfileData(prev => ({
      ...prev,
      avatarUrl: newAvatarUrl,
      displayName: newName,
      bio: newBio
    }));

    if (isOwnProfile) {
      const { user } = useStore.getState();
      useStore.getState().setUser({
        ...user,
        avatarUrl: newAvatarUrl,
        displayName: newName,
        bio: newBio
      });
    }
  };

  const memberSinceRaw = profileData?.createdAt || profileData?.created_at;
  const memberSince = memberSinceRaw ? new Date(memberSinceRaw).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }) : 'March 21, 2026';

  const tabs = [
    { id: 'posts', label: t('profile.tabs.all', 'All'), icon: <LayoutGrid size={14} /> },
    { id: 'videos', label: t('profile.tabs.videos', 'Videos'), icon: <Icons.Heart /> },
    { id: 'images', label: t('profile.tabs.images', 'Images'), icon: <Icons.Bookmark /> },
    { id: 'text', label: t('profile.tabs.text', 'Text'), icon: <LayoutGrid size={14} /> },
  ];

  const emptyStates = {
    posts: { icon: <Icons.Grid size={24} />, text: t('profile.noPosts', 'No posts yet in this profile.') },
    videos: { icon: <Icons.Heart size={24} />, text: t('profile.noVideos', 'No videos found here yet.') },
    images: { icon: <Icons.Bookmark size={24} />, text: t('profile.noImages', 'No images have been shared yet.') },
    text: { icon: <LayoutGrid size={24} />, text: t('profile.noText', 'This text section is still empty.') },
  };

  const hue = 200;

  if (profileLoading) {
    return (
      <div className={styles.layout}>
        <main className={styles.main}>
          <div className={styles.loadingContainer}>
            {t('common.loading', 'Loading...')}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.layout} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
      <main className={styles.main}>
        <section className={styles.profileCard}>
          <div
            className={styles.cover}
            style={coverUrl ? { backgroundImage: `url(${coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            {!coverUrl && <div className={styles.coverGlow} />}
            {isOwnProfile && (
              <>
                <button
                  className={`${styles.coverEditBtn} ${coverUploading ? styles.coverEditBtnLoading : ''}`}
                  onClick={() => !coverUploading && coverInputRef.current?.click()}
                  title={t('profile.changeCover', 'Change cover')}
                  disabled={coverUploading}
                >
                  <ImagePlus size={16} strokeWidth={1.5} />
                </button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleCoverChange}
                />
              </>
            )}
          </div>

          <div className={styles.header}>
            <div className={styles.avatarArea}>
              <div className={styles.avatarWrapper}>
                <div className={styles.avatarFrame}>
                  <div className={styles.avatar} style={{ backgroundImage: `url(${profileData?.avatarUrl})` }}>
                    {!profileData?.avatarUrl && <span className={styles.avatarEmpty}>A</span>}
                    {isOwnProfile && (
                      <div
                        className={`${styles.avatarOverlay} ${avatarUploading ? styles.avatarOverlayDisabled : ''}`}
                        onClick={() => !avatarUploading && avatarInputRef.current?.click()}
                      >
                        {avatarUploading ? '...' : <Camera size={20} />}
                      </div>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleAvatarChange}
                  />
                </div>
              </div>
              <div className={styles.info}>
                <div className={styles.nameRow}>
                  <h1 className={styles.name}>{profileData?.displayName || 'Usuario'}</h1>
                  {isOwnProfile ? (
                    <>
                      <button
                        className={styles.editBtn}
                        onClick={() => navigate('/studio')}
                        title="Shekael Studio"
                      >
                        <BarChart3 size={18} />
                      </button>
                      <button
                        className={styles.editBtn}
                        onClick={() => setIsProfileModalOpen(true)}
                        title="Editar perfil"
                      >
                        <Settings size={18} />
                      </button>
                      <button
                        className={styles.editBtn}
                        onClick={() => setIsPrivacyModalOpen(true)}
                        title="Privacidad"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </button>
                    </>
                  ) : (
                    <button
                      className={styles.msgBtn}
                      onClick={async () => {
                        try {
                          const { sendMessageRequest } = await import('../api/chats.api');
                          const res = await sendMessageRequest(profileData.id);
                          if (res.data.alreadyConnected && res.data.conversationId) {
                            navigate('/chat', { state: { openConversationId: res.data.conversationId } });
                          } else {
                            useStore.getState().addToast('success', 'Solicitud enviada', 'Cuando acepte podran chatear.');
                          }
                        } catch (err) {
                          const msg = err.response?.data?.message || 'Error al enviar solicitud';
                          useStore.getState().addToast('error', 'Error', msg);
                        }
                      }}
                      title="Enviar mensaje"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                      Enviar mensaje
                    </button>
                  )}
                </div>

                {profileData?.bio && (isOwnProfile ? privacy.showBio !== false : true) && <p className={styles.bio}>{profileData.bio}</p>}
                <div className={styles.metaLine}>
                  <CalendarDays size={16} /> {t('profile.memberSince', 'Member since')} {memberSince}
                </div>
                {(!isOwnProfile || privacy.showStats !== false) && (
                  <div className={styles.statsRow}>
                    <span><b>{profileData?.postsCount || 0}</b> {t('profile.stats.posts', 'Posts')}</span>
                    <span><b>{profileData?.followersCount || 0}</b> {t('profile.stats.followers', 'Followers')}</span>
                    <span><b>{profileData?.followingCount || 0}</b> {t('profile.stats.following', 'Following')}</span>
                  </div>
                )}
                <div className={styles.chips}>
                  {profileData?.stellarPublicKey && (isOwnProfile ? privacy.showStellarKey !== false : true) && (
                    <div
                      className={`${styles.chip} ${styles.chipClickable} ${styles.chipAddress} ${copied ? styles.chipCopied : ''}`}
                      onClick={handleCopyWallet}
                      title={t('profile.copyAddress', 'Copy address')}
                    >
                      {profileData.stellarPublicKey.slice(0, 10)}...{profileData.stellarPublicKey.slice(-7)}
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className={styles.tabsWrap}>
          <div className={styles.tabs}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.tabOn : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={styles.tabIcon}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.posts}>
          {postsLoading ? (
            <div className={styles.loadingContainer}>{t('common.loading')}</div>
          ) : userPosts.length > 0 ? (
            <div className={styles.postList}>
              {userPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                {emptyStates[activeTab]?.icon || <Icons.Grid />}
              </div>
              <p className={styles.emptyText}>
                {emptyStates[activeTab]?.text || t('profile.noContent', 'No content available')}
              </p>
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {isProfileModalOpen && (
          <ProfileEditModal
            user={profileData}
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            onSave={handleProfileUpdate}
          />
        )}
      </AnimatePresence>

      {/* Modal de Privacidad */}
      <AnimatePresence>
        {isPrivacyModalOpen && (
          <PrivacyModal
            isOpen={isPrivacyModalOpen}
            onClose={() => setIsPrivacyModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PrivacyModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const { privacy, setPrivacy } = useStore();

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const toggle = (key) => {
    setPrivacy({ [key]: !privacy[key] });
  };

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>Privacidad</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.profileAboutText}>
            Controla qué información se muestra en tu perfil público.
          </p>
          <p className={styles.profileAboutMuted}>
            Los mensajes directos siempre están cifrados E2EE y nadie puede leerlos, ni Shekael.
          </p>

          <div className={styles.privacySection}>
            <PrivacyToggle
              label="Mostrar correo electrónico"
              desc="Si está apagado, otros usuarios verán @usuario en lugar de tu correo"
              enabled={privacy.showEmail}
              onToggle={() => toggle('showEmail')}
            />
            <PrivacyToggle
              label="Mostrar llave Stellar"
              enabled={privacy.showStellarKey !== false}
              onToggle={() => toggle('showStellarKey')}
            />
            <PrivacyToggle
              label="Mostrar estadísticas"
              desc="Seguidores, siguiendo y conteo de publicaciones"
              enabled={privacy.showStats !== false}
              onToggle={() => toggle('showStats')}
            />
            <PrivacyToggle
              desc="Tu bio se muestra en tu perfil público"
              enabled={privacy.showBio !== false}
              onToggle={() => toggle('showBio')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivacyToggle({ label, desc, enabled, onToggle }) {
  return (
    <div className={styles.privacyItem}>
      <div style={{ flex: 1 }}>
        <strong>{label}</strong>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.4 }}>
          {desc}
        </p>
      </div>
      <button
        className={`${styles.toggleSwitch} ${enabled ? styles.toggleOn : ''}`}
        onClick={onToggle}
        role="switch"
        aria-checked={enabled}
      >
        <span className={styles.toggleKnob} />
      </button>
    </div>
  );
}
