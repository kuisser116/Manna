import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  UserPlus, UserCheck, Camera, QrCode,
  LayoutGrid, Eye, MessageCircle, Share, Flag,
  Copy, Check, ImagePlus, CalendarDays, Settings
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ProfileEditModal from '../components/ProfileEditModal/ProfileEditModal';
import useStore from '../store';
import { getUserProfile, updateAvatar, updateProfile, updateCover } from '../api/users.api';
import { getUserPosts } from '../api/posts.api';
import PostCard from '../components/PostCard/PostCard';
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

export default function Profile() {
  const { t } = useTranslation();
  const { id: profileId } = useParams();
  const { user: currentUser } = useStore();

  const [userPosts, setUserPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [coverUrl, setCoverUrl] = useState(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef(null);

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

  const isOwnProfile = !profileId || currentUser?.id === profileId;

  const [profileData, setProfileData] = useState(isOwnProfile ? currentUser : null);
  const [profileLoading, setProfileLoading] = useState(!isOwnProfile);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
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
    }

    getUserProfile(targetId)
      .then(({ data }) => {
        setProfileData(prev => ({ ...prev, ...(data.user || data) }));
        if (data.user?.coverUrl) setCoverUrl(data.user.coverUrl);
      })
      .catch(() => {
        setProfileData({
          id: profileId,
          displayName: 'Usuario',
          email: '@usuario',
          stellarPublicKey: profileId
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
  const memberSince = memberSinceRaw ? new Date(memberSinceRaw).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }) : '21 de marzo de 2026';

  const tabs = [
    { id: 'posts', label: t('profile.tabs.all', 'Todo'), icon: <LayoutGrid size={14} /> },
    { id: 'videos', label: t('profile.tabs.videos', 'Videos'), icon: <Icons.Heart /> },
    { id: 'images', label: t('profile.tabs.images', 'Imágenes'), icon: <Icons.Bookmark /> },
    { id: 'text', label: t('profile.tabs.text', 'Texto'), icon: <LayoutGrid size={14} /> },
  ];

  const emptyStates = {
    posts: { icon: <Icons.Grid size={24} />, text: t('profile.noPosts', 'Aún no hay publicaciones en este remanso.') },
    videos: { icon: <Icons.Heart size={24} />, text: t('profile.noVideos', 'Parece que no hay videos por aquí.') },
    images: { icon: <Icons.Bookmark size={24} />, text: t('profile.noImages', 'No se han compartido imágenes todavía.') },
    text: { icon: <LayoutGrid size={24} />, text: t('profile.noText', 'Este espacio de texto está esperando ser llenado.') },
  };

  const hue = 200; // Valor predeterminado para hue

  if (profileLoading) {
    return (
      <div className={styles.layout}>
        <main className={styles.main}>
          <div className={styles.loadingContainer}>
            {t('common.loading', 'Cargando...')}
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
                  title="Cambiar portada"
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
                    <div className={styles.avatarOverlay}>
                      <Camera size={20} />
                    </div>
                  </div>
                </div>
              </div>
              <div className={styles.info}>
                <div className={styles.nameRow}>
                  <h1 className={styles.name}>{profileData?.displayName || 'Usuario'}</h1>
                  {isOwnProfile && (
                    <button 
                      className={styles.editBtn} 
                      onClick={() => setIsProfileModalOpen(true)}
                    >
                      <Settings size={18} />
                    </button>
                  )}
                </div>
                <span className={styles.handle}>@{profileData?.email || 'usuario'}</span>
                {profileData?.bio && <p className={styles.bio}>{profileData.bio}</p>}
                <div className={styles.metaLine}>
                  <CalendarDays size={16} /> {t('Miembro desde')} {memberSince}
                </div>
                <div className={styles.statsRow}>
                  <span><b>{profileData?.postsCount || 1}</b> {t('Publicaciones')}</span>
                  <span><b>{profileData?.followersCount || 1}</b> {t('Seguidores')}</span>
                  <span><b>{profileData?.followingCount || 1}</b> {t('Siguiendo')}</span>
                </div>
                <div className={styles.chips}>
                  <div className={styles.chip}>
                    <Icons.Heart />
                    0.00 MXNe
                  </div>
                  <div 
                    className={`${styles.chip} ${styles.chipClickable} ${styles.chipAddress}`}
                    onClick={handleCopyWallet}
                    title={t('Copiar dirección')}
                  >
                    {profileData?.stellarPublicKey?.slice(0, 10)}...{profileData?.stellarPublicKey?.slice(-7)}
                    {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </div>
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
                {emptyStates[activeTab]?.text || t('profile.noContent', 'Sin contenido disponible')}
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
    </div>
  );
}
