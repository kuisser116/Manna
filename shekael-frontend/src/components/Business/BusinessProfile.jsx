import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  UserPlus, UserCheck, Camera, QrCode,
  LayoutGrid, Eye, MessageCircle, Share, Flag,
  Copy, Check, ImagePlus, CalendarDays, Settings, Store, MapPin, Star, BarChart3
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ProfileEditModal from '../ProfileEditModal/ProfileEditModal';
import useStore from '../../store';
import { getUserProfile, updateAvatar, updateProfile, updateCover } from '../../api/users.api';
import { getBusiness, toggleFollowBusiness, updateBusinessPrivacy } from '../../api/businesses.api';
import { getUserPosts } from '../../api/posts.api';
import PostCard from '../PostCard/PostCard';
import ProductGrid from './ProductGrid';
import ReviewsSection from './ReviewsSection';
import BusinessSettings from './BusinessSettings';
import profileStyles from '../../styles/pages/Profile.module.css';
import bgPatternUrl from '../../assets/patterns/profile-bg-pattern.svg';

const Icons = {
  Grid: () => <LayoutGrid size={14} />,
  Heart: ({ filled = false }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  Bookmark: ({ filled = false }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ),
};


export default function BusinessProfile() {
  const { t } = useTranslation();
  const { id: profileId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, privacy } = useStore();

  const [biz, setBiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userPosts, setUserPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [coverUrl, setCoverUrl] = useState(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const coverInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showProducts, setShowProducts] = useState(true);
  const [showReviews, setShowReviews] = useState(true);
  const isOwner = currentUser && biz?.isOwner;

  useEffect(() => {
    window.scrollTo(0, 0);
    loadBusiness();
  }, [profileId]);

  async function loadBusiness() {
    try {
      setLoading(true);
      const { data } = await getBusiness(profileId);
      setBiz(data.business);
      setIsFollowing(false);
      setShowProducts(data.business.show_products !== false);
      setShowReviews(data.business.show_reviews !== false);
      if (data.business.coverUrl) setCoverUrl(data.business.coverUrl);
    } catch (err) {
      console.error('Error loading business:', err);
    } finally {
      setLoading(false);
    }
  }

  // Simular posts del comercio
  useEffect(() => {
    setPostsLoading(true);
    setTimeout(() => {
      setUserPosts([]);
      setPostsLoading(false);
    }, 300);
  }, [activeTab]);

  const handleCopyWallet = () => {
    if (!biz?.stellarPublicKey) return;
    navigator.clipboard.writeText(biz.stellarPublicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCoverChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setCoverUrl(preview);
    setCoverUploading(true);
    try {
      // Mock upload
      await new Promise(r => setTimeout(r, 500));
      setCoverUrl(preview);
    } catch {} finally {
      setCoverUploading(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setBiz(prev => prev ? { ...prev, avatarUrl: preview } : prev);
    setAvatarUploading(true);
    try {
      await new Promise(r => setTimeout(r, 500));
    } catch {} finally {
      setAvatarUploading(false);
    }
  };

  const handleProfileUpdate = async ({ displayName, bio }) => {
    setBiz(prev => prev ? { ...prev, name: displayName || prev.name, description: bio !== undefined ? bio : prev.description } : prev);
  };

  if (loading || !biz) {
    return (
      <div className={profileStyles.layout} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
        <main className={profileStyles.main}>
          <div className={profileStyles.loadingContainer}>{t('common.loading', 'Loading...')}</div>
        </main>
      </div>
    );
  }

  const memberSince = biz.created_at ? new Date(biz.created_at).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) : 'March 21, 2026';

  const tabs = [
    { id: 'posts', label: t('profile.tabs.all', 'All'), icon: <LayoutGrid size={14} /> },
    ...(showProducts ? [{ id: 'productos', label: 'Productos', icon: <Store size={14} /> }] : []),
    { id: 'videos', label: t('profile.tabs.videos', 'Videos'), icon: <Icons.Heart /> },
    { id: 'images', label: t('profile.tabs.images', 'Images'), icon: <Icons.Bookmark /> },
    { id: 'text', label: t('profile.tabs.text', 'Text'), icon: <LayoutGrid size={14} /> },
    ...(showReviews ? [{ id: 'reseñas', label: 'Reseñas', icon: <Star size={14} /> }] : []),
  ];

  const emptyStates = {
    posts: { icon: <Icons.Grid size={24} />, text: t('profile.noPosts', 'No posts yet in this profile.') },
    videos: { icon: <Icons.Heart size={24} />, text: t('profile.noVideos', 'No videos found here yet.') },
    images: { icon: <Icons.Bookmark size={24} />, text: t('profile.noImages', 'No images have been shared yet.') },
    text: { icon: <LayoutGrid size={24} />, text: t('profile.noText', 'This text section is still empty.') },
  };

  return (
    <div className={profileStyles.layout} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
      <main className={profileStyles.main}>
        <section className={profileStyles.profileCard}>
          {/* Cover */}
          <div
            className={profileStyles.cover}
            style={coverUrl ? { backgroundImage: `url(${coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            {!coverUrl && (
              <div className={profileStyles.coverGlow}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Store size={64} opacity={0.08} />
                </div>
              </div>
            )}
            {isOwner && (
              <>
                <button
                  className={`${profileStyles.coverEditBtn} ${coverUploading ? profileStyles.coverEditBtnLoading : ''}`}
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

          {/* Header */}
          <div className={profileStyles.header}>
            <div className={profileStyles.avatarArea}>
              <div className={profileStyles.avatarWrapper}>
                <div className={profileStyles.avatarFrame}>
                  <div className={profileStyles.avatar} style={{ backgroundImage: biz.avatarUrl ? `url(${biz.avatarUrl})` : undefined }}>
                    {!biz.avatarUrl && <span className={profileStyles.avatarEmpty}><Store size={32} /></span>}
                    {isOwner && (
                      <div
                        className={`${profileStyles.avatarOverlay} ${avatarUploading ? profileStyles.avatarOverlayDisabled : ''}`}
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
              <div className={profileStyles.info}>
                <div className={profileStyles.nameRow}>
                  <h1 className={profileStyles.name}>{biz.name}</h1>
                  {isOwner ? (
                    <>
                      <button className={profileStyles.editBtn} onClick={() => navigate('/studio')} title="Shekael Studio">
                        <BarChart3 size={18} />
                      </button>
                      <button className={profileStyles.editBtn} onClick={() => setIsProfileModalOpen(true)} title="Editar perfil">
                        <Settings size={18} />
                      </button>
                      <button className={profileStyles.editBtn} onClick={() => setIsPrivacyModalOpen(true)} title="Privacidad">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </button>
                    </>
                  ) : (
                    <button className={profileStyles.msgBtn} title="Enviar mensaje">
                      <MessageCircle size={16} /> Contactar
                    </button>
                  )}
                </div>

                <span className={profileStyles.handle} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Store size={14} /> {biz.category}
                </span>

                {biz.description && <p className={profileStyles.bio}>{biz.description}</p>}

                <div className={profileStyles.metaLine}>
                  <CalendarDays size={16} /> Miembro desde {memberSince}
                </div>

                <div className={profileStyles.statsRow}>
                  <span><b>{biz.products?.length || 0}</b> Productos</span>
                  <span><b>{biz.followersCount || 0}</b> Seguidores</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Star size={14} fill="#f59e0b" color="#f59e0b" />
                    <b>{biz.rating}</b> ({biz.reviewsCount} reseñas)
                  </span>
                </div>

                <div className={profileStyles.chips}>
                  {biz.location?.address && (
                    <div
                      className={`${profileStyles.chip} ${profileStyles.chipClickable}`}
                      onClick={() => navigate('/explorar', { state: { flyTo: { lng: biz.location.lng, lat: biz.location.lat, name: biz.name } } })}
                      title="Ver en el mapa"
                    >
                      <MapPin size={12} /> {biz.location.address}
                    </div>
                  )}
                  {biz.stellarPublicKey && (
                    <div
                      className={`${profileStyles.chip} ${profileStyles.chipClickable} ${profileStyles.chipAddress} ${copied ? profileStyles.chipCopied : ''}`}
                      onClick={handleCopyWallet}
                      title={t('profile.copyAddress', 'Copy address')}
                    >
                      {biz.stellarPublicKey.slice(0, 10)}...{biz.stellarPublicKey.slice(-7)}
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <div className={profileStyles.tabsWrap}>
          <div className={profileStyles.tabs}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`${profileStyles.tab} ${activeTab === tab.id ? profileStyles.tabOn : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={profileStyles.tabIcon}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className={profileStyles.posts}>
          {activeTab === 'posts' && (
            postsLoading ? (
              <div className={profileStyles.loadingContainer}>{t('common.loading')}</div>
            ) : userPosts.length > 0 ? (
              <div className={profileStyles.postList}>
                {userPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <div className={profileStyles.empty}>
                <div className={profileStyles.emptyIcon}>{emptyStates.posts.icon}</div>
                <p className={profileStyles.emptyText}>{emptyStates.posts.text}</p>
              </div>
            )
          )}

          {['videos', 'images', 'text'].includes(activeTab) && (
            <div className={profileStyles.empty}>
              <div className={profileStyles.emptyIcon}>{emptyStates[activeTab]?.icon}</div>
              <p className={profileStyles.emptyText}>{emptyStates[activeTab]?.text}</p>
            </div>
          )}

          {activeTab === 'productos' && (
            <div className={profileStyles.postList}>
              <ProductGrid products={biz.products} isOwner={isOwner} />
            </div>
          )}

          {activeTab === 'reseñas' && (
            <div className={profileStyles.postList}>
              <ReviewsSection reviews={biz.reviews} />
            </div>
          )}


        </div>
      </main>

      <AnimatePresence>
        {isProfileModalOpen && (
          <ProfileEditModal
            user={{
              displayName: biz.name,
              bio: biz.description,
              avatarUrl: biz.avatarUrl,
            }}
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            onSave={handleProfileUpdate}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPrivacyModalOpen && (
          <PrivacyModal
            isOpen={isPrivacyModalOpen}
            onClose={() => setIsPrivacyModalOpen(false)}
            showProducts={showProducts}
            showReviews={showReviews}
            onToggleProducts={async () => {
              const next = !showProducts;
              setShowProducts(next);
              try { await updateBusinessPrivacy(profileId, { showProducts: next }); } catch (e) { setShowProducts(!next); }
            }}
            onToggleReviews={async () => {
              const next = !showReviews;
              setShowReviews(next);
              try { await updateBusinessPrivacy(profileId, { showReviews: next }); } catch (e) { setShowReviews(!next); }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSettingsOpen && (
          <BusinessSettings
            business={biz}
            onClose={() => setIsSettingsOpen(false)}
            onDelete={() => navigate('/profile')}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PrivacyModal({ isOpen, onClose, showProducts, showReviews, onToggleProducts, onToggleReviews }) {
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
    <div className={profileStyles.modalOverlay} onClick={handleOverlayClick}>
      <div className={profileStyles.modalContent}>
        <div className={profileStyles.modalHeader}>
          <h2>Privacidad</h2>
          <button className={profileStyles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={profileStyles.modalBody}>
          <p className={profileStyles.profileAboutText}>
            Controla qué información se muestra en tu perfil público.
          </p>
          <p className={profileStyles.profileAboutMuted}>
            Los mensajes directos siempre están cifrados E2EE y nadie puede leerlos, ni Shekael.
          </p>
          <div className={profileStyles.privacySection}>
            <PrivacyToggle
              label="Mostrar correo electrónico"
              desc="Si está apagado, otros usuarios verán @usuario en lugar de tu correo"
              enabled={privacy.showEmail}
              onToggle={() => toggle('showEmail')}
            />
            <PrivacyToggle
              label="Mostrar llave Stellar"
              desc="Necesaria para recibir pagos MXNe de otros usuarios"
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
              label="Mostrar MXNe"
              desc="Muestra tu saldo de puntos de lealtad"
              enabled={privacy.showMXNe !== false}
              onToggle={() => toggle('showMXNe')}
            />
            <PrivacyToggle
              label="Mostrar biografía"
              desc="Tu bio se muestra en tu perfil público"
              enabled={privacy.showBio !== false}
              onToggle={() => toggle('showBio')}
            />
            {showProducts !== undefined && (
              <PrivacyToggle
              label="Mostrar productos"
              desc="Controla si la sección de productos aparece en tu perfil"
              enabled={showProducts}
              onToggle={onToggleProducts}
            />
            )}
            {showReviews !== undefined && (
              <PrivacyToggle
              label="Mostrar reseñas"
              desc="Controla si la sección de reseñas aparece en tu perfil"
              enabled={showReviews}
              onToggle={onToggleReviews}
            />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivacyToggle({ label, desc, enabled, onToggle }) {
  return (
    <div className={profileStyles.privacyItem}>
      <div style={{ flex: 1 }}>
        <strong>{label}</strong>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.4 }}>
          {desc}
        </p>
      </div>
      <button
        className={`${profileStyles.toggleSwitch} ${enabled ? profileStyles.toggleOn : ''}`}
        onClick={onToggle}
        role="switch"
        aria-checked={enabled}
      >
        <span className={profileStyles.toggleKnob} />
      </button>
    </div>
  );
}
