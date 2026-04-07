import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  UserPlus, UserCheck, Camera, QrCode,
  Heart, Bookmark, LayoutGrid, Eye, MessageCircle, Share, Flag,
  Wallet, Settings, ExternalLink, Copy, Check, ImagePlus
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ProfileEditModal from '../components/ProfileEditModal/ProfileEditModal';
import useStore from '../store';
import { getUserPosts, getLikedPosts, getSavedPosts } from '../api/posts.api';
import { getUserProfile, toggleFollow, updateAvatar, updateProfile, updateCover } from '../api/users.api';
import styles from '../styles/pages/Profile.module.css';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';
import { FastAverageColor } from 'fast-average-color';
import WalletWidget from '../components/WalletWidget/WalletWidget';


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
  const { user: currentUser, balance, balanceMXN, mxncBalance } = useStore();

  const [userPosts, setUserPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [copied, setCopied] = useState(false);
  const [coverUrl, setCoverUrl] = useState(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [patternColor, setPatternColor] = useState('rgba(225, 29, 72, 0.05)'); // Fallback Rosa Mexicano @ 5%
  const [solidPatternColor, setSolidPatternColor] = useState('rgb(225, 29, 72)');
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
    } catch (err) {
    } finally {
      setCoverUploading(false);
    }
  };

  const isOwnProfile = !profileId || currentUser?.id === profileId;

  const [profileData, setProfileData] = useState(isOwnProfile ? currentUser : null);
  const [profileLoading, setProfileLoading] = useState(!isOwnProfile);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

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
        setIsFollowing(data.isFollowing || false);
        if (data.user?.coverUrl) setCoverUrl(data.user.coverUrl);
      })
      .catch((err) => {
        setProfileData({
          id: profileId,
          displayName: 'Usuario',
          email: '@usuario',
          stellarPublicKey: profileId
        });
      })
      .finally(() => setProfileLoading(false));
  }, [isOwnProfile, profileId, currentUser?.id]);

  useEffect(() => {
    const targetId = isOwnProfile ? currentUser?.id : profileId;
    if (!targetId) return;

    setPostsLoading(true);
    setUserPosts([]);

    let fetchPromise;
    if (activeTab === 'posts') {
      fetchPromise = getUserPosts(targetId);
    } else if (activeTab === 'liked') {
      fetchPromise = getLikedPosts(targetId);
    } else if (activeTab === 'saved') {
      fetchPromise = getSavedPosts();
    }

    fetchPromise
      .then(({ data }) => {
        setUserPosts(data.posts || []);
      })
      .catch((err) => {
      })
      .finally(() => setPostsLoading(false));
  }, [isOwnProfile, currentUser?.id, profileId, activeTab]);

  useEffect(() => {
    if (!coverUrl) {
      setPatternColor('rgba(225, 29, 72, 0.05)');
      setSolidPatternColor('rgb(225, 29, 72)');
      return;
    }

    const fac = new FastAverageColor();
    const img = new Image();

    const isBlob = coverUrl.startsWith('blob:');

    if (!isBlob) {
      img.crossOrigin = 'anonymous';
      const separator = coverUrl.includes('?') ? '&' : '?';
      img.src = `${coverUrl}${separator}t=${new Date().getTime()}`;
    } else {
      img.src = coverUrl;
    }

    img.onload = () => {
      try {
        const color = fac.getColor(img);
        const rgba = `rgba(${color.value[0]}, ${color.value[1]}, ${color.value[2]}, 0.05)`;
        const solid = `rgb(${color.value[0]}, ${color.value[1]}, ${color.value[2]})`;
        setPatternColor(rgba);
        setSolidPatternColor(solid);
      } catch (e) {
        setPatternColor('rgba(225, 29, 72, 0.05)');
        setSolidPatternColor('rgb(225, 29, 72)');
      }
    };

    img.onerror = () => {
      setPatternColor('rgba(225, 29, 72, 0.05)');
      setSolidPatternColor('rgb(225, 29, 72)');
    };

    return () => {
      img.onload = null;
      img.onerror = null;
      fac.destroy();
    };
  }, [coverUrl]);

  const handleFollowToggle = async () => {
    setFollowLoading(true);
    const willFollow = !isFollowing;
    try {
      setIsFollowing(willFollow);
      setProfileData(prev => ({
        ...prev,
        followersCount: prev.followersCount + (willFollow ? 1 : -1)
      }));

      await toggleFollow(profileId);
      window.dispatchEvent(new CustomEvent('manna:quest-refresh'));
    } catch (err) {
      setIsFollowing(!willFollow);
      setProfileData(prev => ({
        ...prev,
        followersCount: prev.followersCount - (willFollow ? 1 : -1)
      }));
    } finally {
      setFollowLoading(false);
    }
  };

  const handleProfileUpdate = async ({ displayName, bio, avatarFile }) => {
    try {
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
    } catch (err) {
      throw err;
    }
  };

  const copyAddress = () => {
    if (profileData?.stellarPublicKey) {
      navigator.clipboard.writeText(profileData.stellarPublicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const initials = (profileData?.displayName || 'U').slice(0, 2).toUpperCase();
  const hue = (profileData?.displayName || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  const displayBalance = isOwnProfile
    ? parseFloat(mxncBalance || balanceMXN || balance || 0).toFixed(2)
    : '0.00';

  const tabs = [
    { id: 'posts', label: t('profile.posts', 'Publicaciones'), icon: <Icons.Grid /> },
    { id: 'liked', label: t('profile.likes', 'Me Gusta'), icon: <Icons.Heart /> },
    { id: 'saved', label: t('profile.saved', 'Guardados'), icon: <Icons.Bookmark /> },
  ];

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
    <div className={styles.layout} style={{ '--dynamic-color': solidPatternColor }}>
      <div
        className={styles.decorStrip}
        style={{
          '--pattern-url': `url(${bgPatternUrl})`,
          '--pattern-color': patternColor
        }}
        aria-hidden="true"
      />
      <main className={styles.main}>
        <div
          className={styles.cover}
          style={coverUrl ? { backgroundImage: `url(${coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          {!coverUrl && (
            <>
              <div className={styles.coverGlow} />
              <div className={styles.coverPattern} />
            </>
          )}
          {isOwnProfile && (
            <>
              <button
                className={`${styles.coverEditBtn} ${coverUploading ? styles.coverEditBtnLoading : ''}`}
                onClick={() => !coverUploading && coverInputRef.current?.click()}
                title="Cambiar portada"
                disabled={coverUploading}
              >
                <ImagePlus size={16} strokeWidth={1.5} />
                <span>{coverUploading ? 'Guardando...' : 'Cambiar portada'}</span>
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
        <div className={styles.coverLine} />

        <div className={styles.header}>
          <div className={styles.avatarArea}>
            <div className={styles.avatarWrapper}>
              <div className={styles.avatarFrame}>
                <div
                  className={`${styles.avatar} ${!profileData?.avatarUrl ? styles.avatarEmpty : ''}`}
                  style={profileData?.avatarUrl ? {
                    background: `url(${profileData.avatarUrl}) center/cover`
                  } : {
                    background: `hsl(${hue}, 50%, 35%)`
                  }}
                >
                  {profileData?.avatarUrl ? null : initials}
                  {isOwnProfile && (
                    <button
                      onClick={() => setIsProfileModalOpen(true)}
                      className={styles.avatarOverlay}
                      title={t('profile.editProfile')}
                    >
                      <Camera size={22} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.info}>
              <h1 className={styles.name}>{profileData?.displayName || 'Usuario'}</h1>
              <span className={styles.handle}>@{profileData?.displayName?.toLowerCase().replace(/\s+/g, '_') || 'usuario'}</span>

              {profileData?.bio && (
                <p className={styles.bio}>{profileData.bio}</p>
              )}

              {!isOwnProfile && (
                <div className={styles.actions}>
                  <button
                    className={`${styles.followBtn} ${isFollowing ? styles.following : ''}`}
                    onClick={handleFollowToggle}
                    disabled={followLoading}
                  >
                    {isFollowing ? (
                      <><UserCheck size={14} /> {t('profile.following')}</>
                    ) : (
                      <><UserPlus size={14} /> {t('profile.follow')}</>
                    )}
                  </button>

                  <button
                    className={styles.payBtn}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('manna:pay-user', {
                        detail: {
                          publicKey: profileData.stellarPublicKey,
                          name: profileData.displayName
                        }
                      }));
                    }}
                  >
                    <QrCode size={14} /> Pagar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.statsGroup}>
          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <span className={styles.statNum}>{profileData?.postsCount || 0}</span>
              <span className={styles.statLabel}>Posts</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNum}>{profileData?.followersCount || 0}</span>
              <span className={styles.statLabel}>Seguidores</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNum}>{profileData?.followingCount || 0}</span>
              <span className={styles.statLabel}>Siguiendo</span>
            </div>
          </div>
        </div>

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
                <article key={post.id} className={styles.post}>
                  <div className={styles.postTop}>
                    <div className={styles.postAvatar} style={{
                      background: post.author_avatar_url || post.avatarUrl || profileData?.avatarUrl
                        ? `url(${post.author_avatar_url || post.avatarUrl || profileData?.avatarUrl}) center/cover`
                        : `hsl(${hue}, 50%, 35%)`
                    }}>
                      {(post.author_avatar_url || post.avatarUrl || profileData?.avatarUrl) ? null : (post.display_name || post.author_name || 'U').slice(0, 2).toUpperCase()}
                    </div>
                    <div className={styles.postMeta}>
                      <div className={styles.postAuthor}>{post.display_name || 'Usuario'}</div>
                      <div className={styles.postDate}>
                        {new Date(post.created_at || Date.now()).toLocaleDateString('es-MX', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>

                  <p className={styles.postText}>{post.content || 'Publicación'}</p>

                  <div className={styles.postActions}>
                    <button className={`${styles.actionBtn} ${post.isLiked ? styles.actionBtnActive : ''}`}>
                      <Icons.Heart filled={post.isLiked} /> {post.likes_count || 0}
                    </button>
                    <button className={styles.actionBtn}>
                      <MessageCircle size={14} /> {post.comments_count || 0}
                    </button>
                    <button className={styles.actionBtn}><Share size={14} /></button>
                    <button className={styles.actionBtn}>
                      <Eye size={14} /> {post.views_count || 0}
                    </button>
                    <button className={`${styles.actionBtn} ${post.isSaved ? styles.actionBtnActive : ''}`}>
                      <Icons.Bookmark filled={post.isSaved} />
                    </button>
                    <button className={styles.actionBtn}><Flag size={14} /></button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                {activeTab === 'posts' && <Icons.Grid />}
                {activeTab === 'liked' && <Icons.Heart />}
                {activeTab === 'saved' && <Icons.Bookmark />}
              </div>
              <p className={styles.emptyText}>
                {activeTab === 'posts' && t('profile.noPosts', 'Aún no tienes publicaciones')}
                {activeTab === 'liked' && t('profile.noLikes', 'Aún no has dado me gusta')}
                {activeTab === 'saved' && t('profile.noSaved', 'No tienes publicaciones guardadas')}
              </p>
            </div>
          )}
        </div>
      </main>

      <WalletWidget variant="floating" />


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
