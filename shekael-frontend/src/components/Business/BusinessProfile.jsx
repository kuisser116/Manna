import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Store, MapPin, Star, Settings, Eye, EyeOff, ThumbsUp, MessageCircle, Share2 } from 'lucide-react';
import Avatar from '../Avatar/Avatar';
import ProductGrid from './ProductGrid';
import ReviewsSection from './ReviewsSection';
import BusinessAnalytics from './BusinessAnalytics';
import BusinessSettings from './BusinessSettings';
import styles from './BusinessProfile.module.css';

// Mock data para visualización
const MOCK_BIZ = {
  id: 'biz_1',
  name: 'Taquería El Pastor',
  description: 'Las mejores tortas y tacos al pastor de la colonia. Hacemos todo con receta tradicional, masa hecha a mano y carne marinada 24 hrs. Desde 2015 sirviendo a la comunidad.',
  category: 'Comida y Bebida',
  avatarUrl: null,
  coverUrl: null,
  location: { lat: 19.4326, lng: -99.1332, address: 'Calle Hidalgo #123, Centro, Cuernavaca, Mor.' },
  rating: 4.5,
  totalReviews: 128,
  followers: 342,
  joinedDate: '2025-03-15',
  products: [
    { id: 'p1', name: 'Taco al Pastor', price: '$25', description: 'Taco de pastor con piña, cebolla y cilantro. Salsa roja y verde incluidas.', image: null, category: 'Tacos' },
    { id: 'p2', name: 'Torta al Pastor', price: '$65', description: 'Torta de pastor con aguacate, frijoles, queso y todos los ingredients.', image: null, category: 'Tortas' },
    { id: 'p3', name: 'Taco de Suadero', price: '$30', description: 'Taco de suadero bien doradito con cebolla y cilantro.', image: null, category: 'Tacos' },
    { id: 'p4', name: 'Orden de Cebollitas', price: '$20', description: 'Cebollitas asadas con queso y crema.', image: null, category: 'Guarniciones' },
    { id: 'p5', name: 'Agua de Horchata', price: '$15', description: 'Agua de horchata hecha con canela y vainilla.', image: null, category: 'Bebidas' },
    { id: 'p6', name: 'Taco de Canasta', price: '$12', description: 'Taco de canasta de chicharrón, papa o frijoles.', image: null, category: 'Tacos' },
  ],
  reviews: [
    { id: 'r1', user: 'María G.', rating: 5, text: 'Los mejores tacos de Cuernavaca, sin duda. La salsa verde está increíble.', date: '2025-06-15' },
    { id: 'r2', user: 'Juan P.', rating: 4, text: 'Muy buenos tacos, el pastor bien sazonado. El local está limpio.', date: '2025-06-10' },
    { id: 'r3', user: 'Ana L.', rating: 5, text: 'Excelente atención, todo muy fresco. Recomiendo las tortas.', date: '2025-06-05' },
  ],
};

const TABS = ['Todo', 'Productos', 'Videos', 'Reseñas', 'Estadísticas'];

export default function BusinessProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [biz] = useState(MOCK_BIZ);
  const [activeTab, setActiveTab] = useState('Todo');
  const [showSettings, setShowSettings] = useState(false);
  const [showProducts, setShowProducts] = useState(true);
  const [showReviews, setShowReviews] = useState(true);
  const [isOwner, setIsOwner] = useState(true); // mock: dueño viendo su perfil

  // Filtra tabs según visibilidad
  const visibleTabs = ['Todo', ...(showProducts ? ['Productos'] : []), 'Videos', ...(showReviews ? ['Reseñas'] : []), 'Estadísticas'];

  return (
    <div className={styles.container}>
      {/* Banner */}
      <div className={styles.banner}>
        {biz.coverUrl ? (
          <img src={biz.coverUrl} alt="" className={styles.bannerImg} />
        ) : (
          <div className={styles.bannerPlaceholder}>
            <Store size={48} opacity={0.15} />
          </div>
        )}
      </div>

      {/* Profile header */}
      <div className={styles.header}>
        <div className={styles.avatarSection}>
          <Avatar avatarUrl={biz.avatarUrl} name={biz.name} size={80} className={styles.avatar} />
          <div className={styles.headerInfo}>
            <h1 className={styles.name}>{biz.name}</h1>
            <span className={styles.category}>{biz.category}</span>
            <div className={styles.ratingRow}>
              <Star size={16} fill="currentColor" color="#f59e0b" />
              <span className={styles.rating}>{biz.rating}</span>
              <span className={styles.reviewCount}>({biz.totalReviews} reseñas)</span>
              <span className={styles.dot}>·</span>
              <span className={styles.followers}>{biz.followers} seguidores</span>
            </div>
          </div>
        </div>
        <div className={styles.headerActions}>
          {isOwner && (
            <button className={styles.actionBtn} onClick={() => setShowSettings(true)}>
              <Settings size={18} /> Administrar
            </button>
          )}
          {!isOwner && (
            <>
              <button className={styles.actionBtn}><ThumbsUp size={18} /> Seguir</button>
              <button className={styles.actionBtn}><MessageCircle size={18} /> Contactar</button>
            </>
          )}
        </div>
      </div>

      {/* Info bar */}
      <div className={styles.infoBar}>
        <p className={styles.description}>{biz.description}</p>
        <div className={styles.metaRow}>
          <span className={styles.metaItem}><MapPin size={14} /> {biz.location.address}</span>
          <span className={styles.metaItem}><Store size={14} /> Desde 2025</span>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {visibleTabs.map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {tab === 'Productos' && !showProducts && <EyeOff size={14} />}
            {tab === 'Reseñas' && !showReviews && <EyeOff size={14} />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {activeTab === 'Todo' && (
          <div className={styles.feed}>
            <p className={styles.placeholder}>Publicaciones del comercio aparecerán aquí.</p>
          </div>
        )}

        {activeTab === 'Productos' && showProducts && (
          <ProductGrid products={biz.products} />
        )}

        {activeTab === 'Videos' && (
          <div className={styles.feed}>
            <p className={styles.placeholder}>Videos del comercio.</p>
          </div>
        )}

        {activeTab === 'Reseñas' && showReviews && (
          <ReviewsSection reviews={biz.reviews} />
        )}

        {activeTab === 'Estadísticas' && (
          <BusinessAnalytics businessId={biz.id} />
        )}
      </div>

      {showSettings && (
        <BusinessSettings
          business={biz}
          onClose={() => setShowSettings(false)}
          onDelete={() => navigate('/profile')}
          onToggleProducts={() => setShowProducts(!showProducts)}
          onToggleReviews={() => setShowReviews(!showReviews)}
          showProducts={showProducts}
          showReviews={showReviews}
        />
      )}
    </div>
  );
}
