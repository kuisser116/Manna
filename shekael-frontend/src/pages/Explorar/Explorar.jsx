import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import {
    Store, MapPin, X, Star, Navigation, Phone, Globe, ExternalLink,
} from 'lucide-react';
import { getBusinesses, getBusiness } from '../../api/businesses.api';
import useGeolocation from '../../hooks/useGeolocation';
import styles from './Explorar.module.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLE = 'mapbox://styles/kuisser/cmroeipik008m01qtdmk9ho18';

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

// Mapa activo a nivel de módulo: si Vite hace HMR (recarga en caliente) al
// editar este archivo, `hot.dispose` corre ANTES de que el módulo nuevo
// monte y destruye el mapa viejo. Sin esto, React re-monta el componente
// pero el canvas de mapbox queda huérfano → mapa gigante/negro hasta
// recargar la página completa.
let activeMap = null;
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if (activeMap) {
            activeMap.remove();
            activeMap = null;
        }
    });
}

/**
 * Explorar — mapa de comercios.
 *
 * Diseño deliberadamente SIMPLE:
 * - Un marker mapboxgl.Marker por comercio, creado UNA sola vez al cargar los
 *   datos. mapbox lo ancla a su coordenada y lo mueve con el mapa: las burbujas
 *   NUNCA se re-crean, se re-renderizan ni se animan durante gestos → no pueden
 *   parpadear, duplicarse ni "moverse solas".
 * - Sin clusters, sin supercluster, sin diff de marcadores, sin live render.
 * - Hover: tooltip CSS dentro del propio elemento del marker (pointer-events:
 *   none) → imposible el "hover fantasma".
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
    const lastCursorRef = useRef(null); // última posición del cursor (re-check hover)

    const [loaded, setLoaded] = useState(false);
    const [places, setPlaces] = useState([]);

    // Detalle de comercio (click) — columna izquierda
    const [selectedBiz, setSelectedBiz] = useState(null); // prop del listado
    const [bizDetail, setBizDetail] = useState(null);
    const [bizLoading, setBizLoading] = useState(false);

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
            <div class="${styles.bizBubbleHit}">
                <div class="${styles.bizBubblePin}">
                    <svg viewBox="0 0 44 44" aria-hidden="true">
                        <path d="M38 20 C38 32 24 42 24 42 A2 2 0 0 1 20 42 C20 42 6 32 6 20 A16 16 0 0 1 38 20 Z" />
                    </svg>
                    <div class="${styles.bizBubbleAvatar}">
                        ${biz.avatar_url
                            ? `<img src="${biz.avatar_url}" alt="" onerror="this.style.display='none'" />`
                            : `<span class="${styles.bizBubbleEmoji}">${bizIcon(biz.category)}</span>`}
                    </div>
                </div>
                <div class="${styles.bizTooltip}">
                    <strong>${biz.name}</strong>
                    <span>${biz.category || 'Comercio'}</span>
                </div>
            </div>
        `;

        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([biz.location_lng, biz.location_lat])
            .addTo(map);

        // Hover: solo si el mapa está quieto y el cursor está REALMENTE sobre
        // el rect de la burbuja (el tooltip tiene pointer-events:none → no
        // roba el hover). Se usa el rect del marker (no elementFromPoint)
        // porque el clip-path del pin recorta la forma visual, no el área
        // de interacción del marker.
        el.addEventListener('mouseenter', (e) => {
            if (map.isMoving() || map.isZooming() || map.isEasing()) return;
            const r = el.getBoundingClientRect();
            const inside = e.clientX >= r.left && e.clientX <= r.right
                && e.clientY >= r.top && e.clientY <= r.bottom;
            if (!inside) return;
            el.classList.add(styles.bizBubbleHover);
        });
        el.addEventListener('mouseleave', () => {
            el.classList.remove(styles.bizBubbleHover);
        });

        el.addEventListener('click', (e) => {
            e.stopPropagation();
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

    // ─── Cargar comercios y crear TODOS los markers ───
    const loadPlaces = useCallback(async () => {
        const map = mapRef.current;
        if (!map) return;
        try {
            clearMarkers();
            const { data } = await getBusinesses();
            const businesses = (data?.businesses || [])
                .filter(b => b.location_lat && b.location_lng);
            businesses.forEach(b => createBusinessMarker(map, b));
            setPlaces(businesses);
        } catch (err) {
            console.error('Error loading places:', err);
        }
    }, [clearMarkers, createBusinessMarker]);

    // ─── Inicializar mapa (UNA vez) ───
    useEffect(() => {
        // Si ya hay un mapa y su canvas SIGUE conectado al DOM, no recrear
        // (protege contra doble-montaje de React). Si el canvas quedó
        // huérfano (HMR), descartar el mapa viejo y crear uno nuevo.
        if (mapRef.current) {
            const canvas = mapRef.current.getCanvas();
            if (canvas && canvas.isConnected) return;
            mapRef.current.remove();
            mapRef.current = null;
        }
        if (!mapContainerRef.current) return;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: MAP_STYLE,
            center: [-99.1332, 19.4326],
            zoom: 12,
        });
        activeMap = map;

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

            loadPlaces();
        });

        // Click en zona vacía del mapa → cerrar columna
        map.on('click', () => {
            setSelectedBiz(null);
            setBizDetail(null);
        });

        // Mover/zoomear → quitar hover visual de las burbujas (por si el
        // cursor quedó sobre una mientras el mapa se movía debajo)
        const clearHover = () => {
            document.querySelectorAll('.' + styles.bizBubbleHover)
                .forEach(el => el.classList.remove(styles.bizBubbleHover));
        };
        map.on('movestart', clearHover);
        map.on('zoomstart', clearHover);

        // Al DETENERSE el mapa, si el cursor quedó sobre una burbuja
        // reactivar su hover (el mouseenter no se vuelve a disparar solo
        // porque el cursor ya está dentro del elemento).
        const recheckHover = () => {
            const m = mapRef.current;
            if (!m) return;
            const c = lastCursorRef.current;
            if (!c) return;
            const topEl = document.elementFromPoint(c.x, c.y);
            if (!topEl) return;
            const bubble = topEl.closest('.' + styles.bizBubble);
            if (bubble && !m.isMoving() && !m.isZooming() && !m.isEasing()) {
                bubble.classList.add(styles.bizBubbleHover);
            }
        };
        map.on('moveend', recheckHover);
        map.on('zoomend', recheckHover);

        // Rastrear el cursor (para re-check del hover al detenerse el mapa)
        const onMouseMove = (e) => {
            lastCursorRef.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener('mousemove', onMouseMove);

        return () => {
            ro.disconnect();
            window.removeEventListener('mousemove', onMouseMove);
            clearMarkers();
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
            if (activeMap === map) activeMap = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
            {/* Barra superior: usa variables del tema (--color-bg es más oscuro
                que --color-surface → se distingue del header en cualquier tema) */}
            <nav className={styles.nav}>
                <span className={styles.navTitle}>
                    <Store size={17} /> Comercios
                </span>
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
                        {places.length} comercios en esta zona
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
            </div>
        </div>
    );
}
