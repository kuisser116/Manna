import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  UserPlus, UserCheck, Camera, QrCode,
  LayoutGrid, Eye, MessageCircle, Share, Flag,
  Copy, Check, ImagePlus, CalendarDays, Settings, Store, MapPin, Star, BarChart3,
  Printer, Download, X, Loader2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useStore from '../../store';
import { getBusiness, toggleFollowBusiness } from '../../api/businesses.api';
import { getBusinessQR } from '../../api/payments.api';
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
  const { user: currentUser } = useStore();

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showProducts, setShowProducts] = useState(true);
  const [showReviews, setShowReviews] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
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

  const handleOpenQR = async () => {
    setQrOpen(true);
    setQrLoading(true);
    setQrData(null);
    try {
      const { data } = await getBusinessQR(profileId);
      setQrData(data);
    } catch (e) {
      setQrData(null);
    } finally {
      setQrLoading(false);
    }
  };

  const handlePrintQR = () => {
    if (!qrData?.qrUrl) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>QR ${biz.name}</title></head><body style="text-align:center;font-family:system-ui,sans-serif;padding:40px;background:#fff;color:#111"><h2 style="margin-bottom:24px">${biz.name}</h2><img src="${qrData.qrUrl}" style="width:320px;height:320px;display:block;margin:0 auto"/><p style="color:#555;margin-top:20px">Escanea para pagar en ${biz.name}</p></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const handleDownloadQR = async () => {
    if (!qrData?.qrUrl) return;
    try {
      const resp = await fetch(qrData.qrUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${biz.name.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (_) {}
  };

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
                      <button className={profileStyles.editBtn} onClick={() => setIsSettingsOpen(true)} title="Configuración">
                        <Settings size={18} />
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
                  {isOwner && (
                    <div
                      className={`${profileStyles.chip} ${profileStyles.chipClickable}`}
                      onClick={handleOpenQR}
                      title="Mi QR para imprimir"
                    >
                      <QrCode size={12} /> Mi QR
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
        {isSettingsOpen && (
          <BusinessSettings
            business={biz}
            onClose={() => setIsSettingsOpen(false)}
            onDelete={() => navigate('/profile')}
          />
        )}
      </AnimatePresence>

      {/* Modal QR del comercio (imprimir / descargar) */}
      <AnimatePresence>
        {qrOpen && (
          <div className={profileStyles.qrOverlay} onClick={() => setQrOpen(false)}>
            <div className={profileStyles.qrModal} onClick={(e) => e.stopPropagation()}>
              <button
                className={profileStyles.qrClose}
                onClick={() => setQrOpen(false)}
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
              <div className={profileStyles.qrHeader}>
                <div className={profileStyles.qrIcon}><QrCode size={22} /></div>
                <h3>{biz.name}</h3>
                <p>QR de pago del comercio</p>
              </div>

              {qrLoading && (
                <div className={profileStyles.qrLoading}>
                  <Loader2 size={28} className={profileStyles.qrSpinner} />
                </div>
              )}

              {!qrLoading && qrData && (
                <>
                  <div className={profileStyles.qrImageWrap}>
                    <img src={qrData.qrUrl} alt={`QR de ${biz.name}`} className={profileStyles.qrImage} />
                  </div>
                  <p className={profileStyles.qrHint}>
                    Imprímelo y colócalo en tu negocio. Tus clientes lo escanean para pagarte.
                  </p>
                  <div className={profileStyles.qrActions}>
                    <button className={profileStyles.qrActionPrimary} onClick={handlePrintQR}>
                      <Printer size={16} /> Imprimir
                    </button>
                    <button className={profileStyles.qrActionSecondary} onClick={handleDownloadQR}>
                      <Download size={16} /> Descargar
                    </button>
                  </div>
                </>
              )}

              {!qrLoading && !qrData && (
                <p className={profileStyles.qrHint}>
                  No se pudo generar el QR. Verifica que el comercio tenga una llave Stellar configurada.
                </p>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

