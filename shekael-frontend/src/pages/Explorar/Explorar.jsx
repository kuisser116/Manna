import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import {
    Store, MapPin, X, Star, Navigation, Phone, Globe, ExternalLink,
} from 'lucide-react';
import { getBusinesses, getBusiness } from '../../api/businesses.api';
import { getNearbyVenues, getVenue } from '../../api/venues.api';
import useGeolocation from '../../hooks/useGeolocation';
import styles from './Explorar.module.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLE = 'mapbox://styles/kuisser/cmroeipik008m01qtdmk9ho18';

const CATEGORY_ICONS = {
    restaurant: '🍽️',
    cafe: '☕',
    park: '🌳',
    museum: '🏛️',
    store: '🛍️',
    default: '📍',
};

const BIZ_CATEGORY_ICONS = {
    'Comida y Bebida': '🍽️',
    'Tienda / Retail': '🛍️',
    'Servicios Profesionales': '💼',
    'Salud y Bienestar': '💚',
    'Arte y Cultura': '🎨',
    'Taller Mecánico': '🔧',
    'Educación': '📚',
    'Entretenimiento': '🎬',
    'Hogar y Jardín': '🏡',
    'Tecnología': '💻',
    'Moda y Accesorios': '👗',
    'Otro': '🏪',
};

const bizIcon = (cat) => BIZ_CATEGORY_ICONS[cat] || '🏪';

/**
 * Explorar — mapa de comercios y lugares.
 *
 * Diseño deliberadamente SIMPLE:
 * - Un marker mapboxgl.Marker por comercio/lugar, creado UNA sola vez al cargar
 *   los datos. mapbox se encarga de anclarlo a su coordenada y moverlo con el
 *   mapa: las burbujas NUNCA se re-crean, se re-renderizan ni se animan durante
 *   gestos → no pueden parpadear, duplicarse ni "moverse solas".
 * - Sin supercluster, sin diff de marcadores, sin live render en zoom.
 * - Hover: tooltip CSS dentro del propio elemento del marker (pointer-events:
 *   none) → imposible el "hover fantasma" (no hay tarjeta flotante separada).
 * - Click en burbuja → columna izquierda pegada justo debajo de la barra.
 * - Click en el mapa (zona vacía) → cierra la columna.
 */
export default function Explorar() {
    const navigate = useNavigate();
    const location = useLocation();

    const mapWrapRef = useRef(null);
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]); // { id, marker, lngLat }
    const bizCacheRef = useRef(new Map());

    const [loaded, setLoaded] = useState(false);
    const [activeTab, setActiveTab] = useState('comercios');
    const [places, setPlaces] = useState([]);

    // Detalle de comercio (click) — columna izquierda
    const [selectedBiz, setSelectedBiz] = useState(null); // prop del listado
    const [bizDetail, setBizDetail] = useState(null);
    const [bizLoading, setBizLoading] = useState(false);

    // Venue (tab Lugares) — panel lateral
    const [venueDetail, setVenueDetail] = useState(null);
    const [venuePosts, setVenuePosts] = useState([]);
    const [venueReviews, setVenueReviews] = useState([]);
    const [showVenue, setShowVenue] = useState(false);

    const { location: userLoc, startWatching, isWatching } = useGeolocation({ autostart: false });

    // ─── Detalle de comercio (cacheado) ───
    const ensureDetail = useCallback(async (id) => {
        if (bizCacheRef.current.has(id)) return bizCacheRef.current.get(id);
        try {
            const { data } = await getBusiness(id);
            const biz = data?.business;
            if (biz) bizCacheRef.current.set(id, biz);
            return biz || null;
        } catch (err) {
            console.error('Error cargando detalle:', err);
            return null;
        }
    }, []);

    const clearMarkers = useCallback(() => {
        markersRef.current.forEach(m => m.marker.remove());
        markersRef.current = [];
    }, []);

    // Reproyectar todos los marcadores (tras resize del contenedor)
    const repositionMarkers = useCallback(() => {
        markersRef.current.forEach(m => m.marker.setLngLat(m.lngLat));
    }, []);

    // ─── Crear un marker de comercio ───
    const createBusinessMarker = useCallback((map, biz) => {
        const el = document.createElement('div');
        el.className = styles.bizBubble;
        el.innerHTML = `
            <div class="${styles.bizTooltip}">
                <strong>${biz.name}</strong>
                <span>${biz.category || 'Comercio'}</span>
            </div>
            <div class="${styles.bizBubbleAvatar}">
                ${biz.avatar_url
                    ? `<img src="${biz.avatar_url}" alt="" onerror="this.style.display='none'" />`
                    : `<span class="${styles.bizBubbleEmoji}">${bizIcon(biz.category)}</span>`}
            </div>
            <div class="${styles.bizBubbleTail}"></div>
        `;

        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([biz.location_lng, biz.location_lat])
            .addTo(map);

        // Hover: solo si el mapa está quieto y el cursor está REALMENTE sobre
        // la burbuja (el tooltip tiene pointer-events:none → no roba el hover)
        el.addEventListener('mouseenter', (e) => {
            if (map.isMoving() || map.isZooming() || map.isEasing()) return;
            const topEl = document.elementFromPoint(e.clientX, e.clientY);
            if (topEl !== el && !el.contains(topEl)) return;
            el.classList.add(styles.bizBubbleHover);
        });
        el.addEventListener('mouseleave', () => {
            el.classList.remove(styles.bizBubbleHover);
        });

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            setShowVenue(false);
            setSelectedBiz({
                id: biz.id,
                name: biz.name,
                category: biz.category || 'Comercio',
                address: biz.address || '',
                avatar: biz.avatar_url || '',
            });
            setBizLoading(true);
            setBizDetail(null);
            ensureDetail(biz.id).then(detail => {
                setBizDetail(detail);
                setBizLoading(false);
            });
        });

        markersRef.current.push({
            id: 'biz-' + biz.id,
            marker,
            lngLat: [biz.location_lng, biz.location_lat],
        });
    }, [ensureDetail]);

    // ─── Crear un marker de venue ───
    const createVenueMarker = useCallback((map, v) => {
        const el = document.createElement('div');
        el.className = styles.venueBubble;
        el.innerHTML = `
            <div class="${styles.bizTooltip}">
                <strong>${v.name}</strong>
                <span>${v.category || 'Lugar'}</span>
            </div>
            <div class="${styles.venueBubbleDot}">${CATEGORY_ICONS[v.category] || CATEGORY_ICONS.default}</div>
        `;

        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([v.lng, v.lat])
            .addTo(map);

        el.addEventListener('mouseenter', (e) => {
            if (map.isMoving() || map.isZooming() || map.isEasing()) return;
            const topEl = document.elementFromPoint(e.clientX, e.clientY);
            if (topEl !== el && !el.contains(topEl)) return;
            el.classList.add(styles.bizBubbleHover);
        });
        el.addEventListener('mouseleave', () => {
            el.classList.remove(styles.bizBubbleHover);
        });

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            setSelectedBiz(null);
            setBizDetail(null);
            handleVenueClick(v.id);
        });

        markersRef.current.push({ id: 'venue-' + v.id, marker, lngLat: [v.lng, v.lat] });
    }, []);

    // ─── Cargar datos del tab activo y crear TODOS los markers ───
    const loadPlaces = useCallback(async (tab) => {
        const map = mapRef.current;
        if (!map) return;
        try {
            clearMarkers();

            if (tab === 'comercios') {
                const { data } = await getBusinesses();
                const businesses = (data?.businesses || [])
                    .filter(b => b.location_lat && b.location_lng);
                businesses.forEach(b => createBusinessMarker(map, b));
                setPlaces(businesses);
            } else if (tab === 'lugares') {
                let venues = [];
                if (userLoc) {
                    const { venues: v } = await getNearbyVenues(userLoc.lat, userLoc.lng, 0.5);
                    venues = v || [];
                }
                venues.forEach(v => createVenueMarker(map, v));
                setPlaces(venues);
            }
        } catch (err) {
            console.error('Error loading places:', err);
        }
    }, [userLoc, clearMarkers, createBusinessMarker, createVenueMarker]);

    const handleVenueClick = useCallback(async (id) => {
        try {
            const detail = await getVenue(id);
            setVenueDetail(detail.venue);
            setVenuePosts(detail.posts || []);
            setVenueReviews(detail.reviews || []);
            setShowVenue(true);
        } catch (err) {
            console.error('Error loading venue detail:', err);
        }
    }, []);

    // ─── Inicializar mapa (UNA vez) ───
    useEffect(() => {
        if (mapRef.current || !mapContainerRef.current) return;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: MAP_STYLE,
            center: [-99.1332, 19.4326],
            zoom: 12,
        });

        map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

        // Cualquier cambio de tamaño del contenedor (ventana, sidebar,
        // split-screen) → redimensionar canvas + reproyectar los markers.
        const ro = new ResizeObserver(() => {
            const m = mapRef.current;
            if (!m) return;
            m.resize();
            repositionMarkers();
        });
        ro.observe(mapWrapRef.current);

        map.on('load', () => {
            mapRef.current = map;
            setLoaded(true);

            const flyToTarget = location.state?.flyTo;
            if (flyToTarget) {
                map.flyTo({ center: [flyToTarget.lng, flyToTarget.lat], zoom: 15, duration: 2000 });
            }

            loadPlaces(activeTab);
        });

        // Click en zona vacía del mapa → cerrar columna/panel
        map.on('click', () => {
            setSelectedBiz(null);
            setBizDetail(null);
            setShowVenue(false);
        });

        // Mover/zoomear → quitar hover visual de las burbujas (por si el
        // cursor quedó sobre una mientras el mapa se movía debajo)
        const clearHover = () => {
            document.querySelectorAll('.' + styles.bizBubbleHover)
                .forEach(el => el.classList.remove(styles.bizBubbleHover));
        };
        map.on('movestart', clearHover);
        map.on('zoomstart', clearHover);

        return () => {
            ro.disconnect();
            clearMarkers();
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Cambiar tab ───
    const handleTabChange = (tab) => {
        if (tab === activeTab) return;
        setActiveTab(tab);
        setSelectedBiz(null);
        setBizDetail(null);
        setShowVenue(false);
        loadPlaces(tab);
        if (tab === 'lugares' && !isWatching) {
            startWatching();
        }
    };

    // ─── Ir a mi ubicación ───
    const goToMyLocation = () => {
        if (userLoc && mapRef.current) {
            mapRef.current.flyTo({
                center: [userLoc.lng, userLoc.lat],
                zoom: 15,
                duration: 1000,
            });
        } else if (!isWatching) {
            startWatching();
        }
    };

    // ─── Marker de ubicación actual ───
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !userLoc) return;

        const existing = document.getElementById('user-location-marker');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.id = 'user-location-marker';
        el.className = styles.userMarker;
        el.innerHTML = `<div class="${styles.userPulse}"></div><div class="${styles.userDot}"></div>`;

        new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([userLoc.lng, userLoc.lat])
            .addTo(map);

        if (activeTab === 'lugares') {
            loadPlaces('lugares');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userLoc]);

    const selected = bizDetail;

    const openInMaps = () => {
        if (!selected) return;
        const lat = selected.location?.lat ?? selected.location_lat;
        const lng = selected.location?.lng ?? selected.location_lng;
        if (lat && lng) {
            window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
        }
    };

    const products = selected?.products || [];
    const reviews = selected?.reviews || [];

    return (
        <div className={styles.page}>
            {/* Barra superior OSCURA (contrasta con el header claro de la app) */}
            <nav className={styles.nav}>
                <button
                    className={`${styles.navTab} ${activeTab === 'comercios' ? styles.navTabActive : ''}`}
                    onClick={() => handleTabChange('comercios')}
                >
                    <Store size={17} /> Comercios
                </button>
                <button
                    className={`${styles.navTab} ${activeTab === 'lugares' ? styles.navTabActive : ''}`}
                    onClick={() => handleTabChange('lugares')}
                >
                    <MapPin size={17} /> Lugares
                </button>
            </nav>

            {/* Contenedor del mapa: la columna vive DENTRO, pegada a la barra */}
            <div className={styles.mapWrap} ref={mapWrapRef}>
                <div className={styles.mapContainer} ref={mapContainerRef}>
                    {!loaded && (
                        <div className={styles.loading}>
                            <MapPin size={30} />
                            <p>Cargando mapa...</p>
                        </div>
                    )}
                </div>

                <button className={styles.myLocationBtn} onClick={goToMyLocation} title="Mi ubicación">
                    <Navigation size={19} />
                </button>

                {places.length > 0 && (
                    <div className={styles.placeCount}>
                        {places.length} {activeTab === 'comercios' ? 'comercios' : 'lugares'} en esta zona
                    </div>
                )}

                {/* ── Columna izquierda: detalle de comercio ── */}
                <AnimatePresence>
                    {selectedBiz && (
                        <motion.aside
                            className={styles.bizPanel}
                            initial={{ x: -380, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -380, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                        >
                            <div className={styles.bizPanelInner}>
                                {bizLoading && !selected && (
                                    <div className={styles.bizPanelLoading}>
                                        <MapPin size={26} />
                                        <p>Cargando comercio...</p>
                                    </div>
                                )}

                                {selected && (
                                    <>
                                        {selected.coverUrl && (
                                            <div className={styles.bizPanelCover}>
                                                <img src={selected.coverUrl} alt="" />
                                            </div>
                                        )}

                                        <div className={styles.bizPanelBody}>
                                            <button
                                                className={styles.bizPanelClose}
                                                onClick={() => { setSelectedBiz(null); setBizDetail(null); }}
                                                aria-label="Cerrar"
                                            >
                                                <X size={20} />
                                            </button>

                                            <div className={styles.bizPanelHead}>
                                                <div className={styles.bizPanelAvatar}>
                                                    {selected.avatarUrl
                                                        ? <img src={selected.avatarUrl} alt="" />
                                                        : <span>{bizIcon(selected.category)}</span>}
                                                </div>
                                                <div className={styles.bizPanelTitleRow}>
                                                    <h2 className={styles.bizPanelName}>{selected.name}</h2>
                                                    <span className={styles.bizPanelCat}>{selected.category}</span>
                                                </div>
                                            </div>

                                            <div className={styles.bizPanelStats}>
                                                <div className={styles.bizPanelStat}>
                                                    <Star size={14} fill="#f59e0b" color="#f59e0b" />
                                                    <strong>{selected.rating ? selected.rating.toFixed(1) : '—'}</strong>
                                                    <span>({selected.reviewsCount || 0} reseñas)</span>
                                                </div>
                                                <div className={styles.bizPanelStat}>
                                                    <Store size={14} />
                                                    <strong>{selected.followersCount || 0}</strong>
                                                    <span>seguidores</span>
                                                </div>
                                            </div>

                                            {selected.address && (
                                                <div className={styles.bizPanelInfoRow}>
                                                    <MapPin size={15} />
                                                    <span>{selected.address}</span>
                                                </div>
                                            )}
                                            {selected.phone && (
                                                <div className={styles.bizPanelInfoRow}>
                                                    <Phone size={15} />
                                                    <span>{selected.phone}</span>
                                                </div>
                                            )}
                                            {selected.website && (
                                                <div className={styles.bizPanelInfoRow}>
                                                    <Globe size={15} />
                                                    <a href={selected.website} target="_blank" rel="noreferrer">{selected.website}</a>
                                                </div>
                                            )}

                                            {selected.description && (
                                                <div className={styles.bizPanelSection}>
                                                    <h3>Descripción</h3>
                                                    <p className={styles.bizPanelDesc}>{selected.description}</p>
                                                </div>
                                            )}

                                            {products.length > 0 && (
                                                <div className={styles.bizPanelSection}>
                                                    <h3>Productos / Menú ({products.length})</h3>
                                                    <div className={styles.bizPanelProducts}>
                                                        {products.map(p => (
                                                            <div key={p.id} className={styles.bizPanelProduct}>
                                                                {p.image_url && (
                                                                    <div className={styles.bizPanelProductImg}>
                                                                        <img src={p.image_url} alt={p.name} />
                                                                    </div>
                                                                )}
                                                                <div className={styles.bizPanelProductInfo}>
                                                                    <strong>{p.name}</strong>
                                                                    {p.description && <p>{p.description}</p>}
                                                                    <span className={styles.bizPanelProductPrice}>
                                                                        {p.price ? `$${p.price}` : ''}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {reviews.length > 0 && (
                                                <div className={styles.bizPanelSection}>
                                                    <h3>Reseñas ({reviews.length})</h3>
                                                    {reviews.slice(0, 5).map(r => (
                                                        <div key={r.id} className={styles.bizPanelReview}>
                                                            <div className={styles.bizPanelReviewStars}>
                                                                {Array.from({ length: 5 }, (_, i) => (
                                                                    <span key={i} className={i < r.rating ? styles.starFilled : styles.starEmpty}>★</span>
                                                                ))}
                                                            </div>
                                                            {r.comment && <p>{r.comment}</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <div className={styles.bizPanelActions}>
                                                <button
                                                    className={styles.bizPanelPrimary}
                                                    onClick={() => navigate(`/business/${selected.id}`)}
                                                >
                                                    Ver perfil completo <ExternalLink size={15} />
                                                </button>
                                                <button className={styles.bizPanelSecondary} onClick={openInMaps}>
                                                    Cómo llegar
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </motion.aside>
                    )}
                </AnimatePresence>

                {/* ── Panel de lugar (venue) ── */}
                {showVenue && venueDetail && (
                    <aside className={styles.bizPanel}>
                        <div className={styles.bizPanelInner}>
                            <div className={styles.bizPanelBody}>
                                <button
                                    className={styles.bizPanelClose}
                                    onClick={() => setShowVenue(false)}
                                    aria-label="Cerrar"
                                >
                                    <X size={20} />
                                </button>

                                <div className={styles.bizPanelHead}>
                                    <div className={styles.bizPanelAvatar}>
                                        <span style={{ fontSize: 24 }}>
                                            {CATEGORY_ICONS[venueDetail.category] || CATEGORY_ICONS.default}
                                        </span>
                                    </div>
                                    <div className={styles.bizPanelTitleRow}>
                                        <h2 className={styles.bizPanelName}>{venueDetail.name}</h2>
                                        <span className={styles.bizPanelCat}>{venueDetail.category}</span>
                                    </div>
                                </div>

                                {venueDetail.address && (
                                    <div className={styles.bizPanelInfoRow}>
                                        <MapPin size={15} />
                                        <span>{venueDetail.address}</span>
                                    </div>
                                )}

                                {venueReviews.length > 0 && (
                                    <div className={styles.bizPanelSection}>
                                        <h3>Reseñas ({venueReviews.length})</h3>
                                        {venueReviews.slice(0, 5).map(r => (
                                            <div key={r.id} className={styles.bizPanelReview}>
                                                <div className={styles.bizPanelReviewStars}>
                                                    {Array.from({ length: 5 }, (_, i) => (
                                                        <span key={i} className={i < r.rating ? styles.starFilled : styles.starEmpty}>★</span>
                                                    ))}
                                                </div>
                                                {r.comment && <p>{r.comment}</p>}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {venuePosts.length > 0 && (
                                    <div className={styles.bizPanelSection}>
                                        <h3>Posts ({venuePosts.length})</h3>
                                        {venuePosts.slice(0, 10).map(p => (
                                            <div
                                                key={p.id}
                                                className={styles.venuePostCard}
                                                onClick={() => navigate(`/post/${p.id}`)}
                                            >
                                                <div className={styles.venuePostPreview}>
                                                    {p.type === 'image' ? '📷' : p.type === 'video' ? '🎬' : '📝'}
                                                </div>
                                                <div className={styles.venuePostInfo}>
                                                    <p className={styles.venuePostContent}>
                                                        {p.content?.substring(0, 60)}{p.content?.length > 60 ? '...' : ''}
                                                    </p>
                                                    <span className={styles.venuePostDate}>
                                                        {new Date(p.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {venuePosts.length === 0 && venueReviews.length === 0 && (
                                    <p className={styles.bizPanelEmpty}>No hay posts o reseñas aún para este lugar</p>
                                )}
                            </div>
                        </div>
                    </aside>
                )}
            </div>
        </div>
    );
}
