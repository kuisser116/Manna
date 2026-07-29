import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import Supercluster from 'supercluster';
import { Store, MapPin, X, Star, Clock, Navigation, Image, MessageSquare } from 'lucide-react';
import { getBusinesses } from '../../api/businesses.api';
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

export default function Explorar() {
    const navigate = useNavigate();
    const location = useLocation();
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const [loaded, setLoaded] = useState(false);
    const [activeTab, setActiveTab] = useState('comercios');
    const [places, setPlaces] = useState([]);
    const [venueDetail, setVenueDetail] = useState(null);
    const [venuePosts, setVenuePosts] = useState([]);
    const [venueReviews, setVenueReviews] = useState([]);
    const [showSidebar, setShowSidebar] = useState(false);
    const [tooltip, setTooltip] = useState(null);
    const [viewState, setViewState] = useState({ center: [-99.1332, 19.4326], zoom: 12 });
    const superclusterRef = useRef(null);

    const { location: userLoc, startWatching, isWatching } = useGeolocation({ autostart: false });

    // ─── Inicializar mapa ───
    useEffect(() => {
        if (mapRef.current) return;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: MAP_STYLE,
            center: viewState.center,
            zoom: viewState.zoom,
        });

        map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

        map.on('load', () => {
            mapRef.current = map;
            setLoaded(true);

            const flyToTarget = location.state?.flyTo;
            if (flyToTarget) {
                map.flyTo({ center: [flyToTarget.lng, flyToTarget.lat], zoom: 15, duration: 2000 });
                setViewState({ center: [flyToTarget.lng, flyToTarget.lat], zoom: 15 });
            }

            loadPlaces(map, activeTab);
        });

        map.on('move', () => {
            const c = map.getCenter();
            setViewState({ center: [c.lng, c.lat], zoom: map.getZoom() });
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    // ─── Cargar lugares según tab ───
    const loadPlaces = useCallback(async (map, tab) => {
        try {
            let allPlaces = [];

            if (tab === 'comercios') {
                const { data } = await getBusinesses();
                const businesses = data?.businesses || [];
                allPlaces = businesses
                    .filter(b => b.location_lat && b.location_lng)
                    .map(b => ({
                        type: 'Feature',
                        properties: {
                            id: b.id,
                            name: b.name,
                            category: b.category || 'Comercio',
                            address: b.address || '',
                            zone: b.zone || b.city || '',
                            type: 'business',
                            icon: '🛍️',
                        },
                        geometry: { type: 'Point', coordinates: [b.location_lng, b.location_lat] },
                    }));
            } else if (tab === 'lugares') {
                if (userLoc) {
                    const { venues } = await getNearbyVenues(userLoc.lat, userLoc.lng, 0.5);
                    allPlaces = (venues || []).map(v => ({
                        type: 'Feature',
                        properties: {
                            id: v.id,
                            name: v.name,
                            category: v.category || 'Lugar',
                            address: v.address || '',
                            zone: v.zone || '',
                            type: 'venue',
                            icon: CATEGORY_ICONS[v.category] || CATEGORY_ICONS.default,
                        },
                        geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
                    }));
                }
            }

            setPlaces(allPlaces);

            // Crear cluster si hay datos
            if (allPlaces.length > 0 && map) {
                const index = new Supercluster({
                    radius: 60,
                    maxZoom: 16,
                });
                index.load(allPlaces);
                superclusterRef.current = index;

                renderClusters(map, index);
            }
        } catch (err) {
            console.error('Error loading places:', err);
        }
    }, [userLoc, activeTab]);

    // ─── Renderizar clusters ───
    const renderClusters = useCallback((map, index) => {
        // Limpiar markers anteriores
        document.querySelectorAll('.custom-marker').forEach(el => el.remove());

        const bounds = map.getBounds();
        const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
        const zoom = Math.floor(map.getZoom());
        const clusters = index.getClusters(bbox, zoom);

        clusters.forEach(cluster => {
            const [lng, lat] = cluster.geometry.coordinates;
            const el = document.createElement('div');
            el.className = 'custom-marker';

            if (cluster.properties.cluster) {
                // Cluster
                const count = cluster.properties.point_count;
                el.className = `${styles.cluster} custom-marker`;
                el.innerHTML = `<span>${count}</span>`;
                el.addEventListener('click', () => {
                    map.flyTo({
                        center: [lng, lat],
                        zoom: index.getClusterExpansionZoom(cluster.id),
                        duration: 500,
                    });
                });
            } else {
                // Punto individual
                const prop = cluster.properties;
                el.className = `${styles.marker} custom-marker`;
                el.innerHTML = `
                    <div class="${styles.markerLabel}">${prop.icon} ${prop.name}</div>
                    <div class="${styles.markerDot}" data-id="${prop.id}" data-type="${prop.type}"></div>
                `;

                // Hover
                el.addEventListener('mouseenter', (e) => {
                    const rect = el.getBoundingClientRect();
                    setTooltip({
                        id: prop.id,
                        name: prop.name,
                        category: prop.category,
                        address: prop.address,
                        zone: prop.zone,
                        type: prop.type,
                        x: rect.right + 10,
                        y: rect.top,
                    });
                });

                el.addEventListener('mouseleave', () => {
                    setTooltip(null);
                });

                // Click → sidebar
                el.addEventListener('click', () => {
                    handlePlaceClick(prop.id, prop.type);
                });
            }

            // Posicionar en el mapa
            el.style.position = 'absolute';
            const point = map.project([lng, lat]);
            el.style.left = `${point.x}px`;
            el.style.top = `${point.y}px`;
            map.getCanvasContainer().appendChild(el);
        });
    }, []);

    // ─── Re-renderizar clusters al mover/zoom ───
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !superclusterRef.current) return;

        const onMove = () => renderClusters(map, superclusterRef.current);
        map.on('move', onMove);
        map.on('zoom', onMove);

        return () => {
            map.off('move', onMove);
            map.off('zoom', onMove);
        };
    }, [loaded, activeTab]);

    // ─── Click en marker → sidebar ───
    const handlePlaceClick = async (id, type) => {
        if (type === 'venue') {
            try {
                const detail = await getVenue(id);
                setVenueDetail(detail.venue);
                setVenuePosts(detail.posts || []);
                setVenueReviews(detail.reviews || []);
                setShowSidebar(true);
                setTooltip(null);
            } catch (err) {
                console.error('Error loading venue detail:', err);
            }
        } else {
            navigate(`/business/${id}`);
        }
    };

    // ─── Cambiar tab ───
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setShowSidebar(false);
        setTooltip(null);
        if (mapRef.current) {
            document.querySelectorAll('.custom-marker').forEach(el => el.remove());
            loadPlaces(mapRef.current, tab);
        }
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

        // Remover marker anterior
        const existing = document.getElementById('user-location-marker');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.id = 'user-location-marker';
        el.className = styles.userMarker;
        el.innerHTML = `<div class="${styles.userPulse}"></div><div class="${styles.userDot}"></div>`;

        new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([userLoc.lng, userLoc.lat])
            .addTo(map);

        if (!showSidebar && activeTab === 'lugares') {
            loadPlaces(map, 'lugares');
        }
    }, [userLoc]);

    return (
        <div className={styles.page}>
            {/* Navegación flotante */}
            <nav className={styles.nav}>
                <button
                    className={`${styles.navTab} ${activeTab === 'comercios' ? styles.navTabActive : ''}`}
                    onClick={() => handleTabChange('comercios')}
                >
                    <Store size={18} /> Comercios
                </button>
                <button
                    className={`${styles.navTab} ${activeTab === 'lugares' ? styles.navTabActive : ''}`}
                    onClick={() => handleTabChange('lugares')}
                >
                    <MapPin size={18} /> Lugares
                </button>
                <button
                    className={`${styles.navTab} ${activeTab === 'transporte' ? styles.navTabActive : ''}`}
                    onClick={() => setActiveTab('transporte')}
                >
                    <Navigation size={18} /> Transporte
                    <span className={styles.badge}>Próximamente</span>
                </button>
            </nav>

            {/* Botón mi ubicación */}
            <button className={styles.myLocationBtn} onClick={goToMyLocation} title="Mi ubicación">
                <Navigation size={20} />
            </button>

            {/* Mapa */}
            <div className={styles.mapContainer} ref={mapContainerRef}>
                {!loaded && (
                    <div className={styles.loading}>
                        <MapPin size={32} />
                        <p>Cargando mapa...</p>
                    </div>
                )}
            </div>

            {/* Tooltip en hover */}
            {tooltip && !showSidebar && (
                <div
                    className={styles.tooltip}
                    style={{ left: tooltip.x, top: tooltip.y }}
                    onMouseEnter={() => setTooltip(tooltip)}
                    onMouseLeave={() => setTooltip(null)}
                >
                    <div className={styles.tooltipName}>
                        {tooltip.icon && <span>{tooltip.icon}</span>} {tooltip.name}
                    </div>
                    {tooltip.category && <div className={styles.tooltipCat}>{tooltip.category}</div>}
                    {tooltip.zone && <div className={styles.tooltipZone}>{tooltip.zone}</div>}
                    <div className={styles.tooltipHint}>Click para ver más</div>
                </div>
            )}

            {/* Sidebar izquierdo */}
            {showSidebar && venueDetail && (
                <aside className={styles.sidebar}>
                    <div className={styles.sidebarHeader}>
                        <h2>{venueDetail.name}</h2>
                        <button className={styles.sidebarClose} onClick={() => setShowSidebar(false)}>
                            <X size={20} />
                        </button>
                    </div>

                    <div className={styles.sidebarBody}>
                        {/* Info del lugar */}
                        <div className={styles.sidebarSection}>
                            {venueDetail.category && (
                                <div className={styles.sidebarTag}>
                                    {CATEGORY_ICONS[venueDetail.category] || '📍'} {venueDetail.category}
                                </div>
                            )}
                            {venueDetail.address && <p className={styles.sidebarAddr}>{venueDetail.address}</p>}
                            {venueDetail.zone && <p className={styles.sidebarZone}>{venueDetail.zone}</p>}
                        </div>

                        {/* Reseñas */}
                        {venueReviews.length > 0 && (
                            <div className={styles.sidebarSection}>
                                <h3><Star size={16} /> Reseñas ({venueReviews.length})</h3>
                                {venueReviews.slice(0, 5).map(r => (
                                    <div key={r.id} className={styles.reviewCard}>
                                        <div className={styles.reviewStars}>
                                            {Array.from({ length: 5 }, (_, i) => (
                                                <span key={i} className={i < r.rating ? styles.starFilled : styles.starEmpty}>★</span>
                                            ))}
                                        </div>
                                        <p className={styles.reviewComment}>{r.comment}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Posts relacionados */}
                        {venuePosts.length > 0 && (
                            <div className={styles.sidebarSection}>
                                <h3><Image size={16} /> Posts ({venuePosts.length})</h3>
                                {venuePosts.slice(0, 10).map(p => (
                                    <div
                                        key={p.id}
                                        className={styles.postCard}
                                        onClick={() => navigate(`/post/${p.id}`)}
                                    >
                                        <div className={styles.postPreview}>
                                            {p.type === 'image' ? '📷' : p.type === 'video' ? '🎬' : '📝'}
                                        </div>
                                        <div className={styles.postInfo}>
                                            <p className={styles.postContent}>
                                                {p.content?.substring(0, 60)}{p.content?.length > 60 ? '...' : ''}
                                            </p>
                                            <span className={styles.postDate}>
                                                {new Date(p.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {venuePosts.length === 0 && venueReviews.length === 0 && (
                            <p className={styles.sidebarEmpty}>No hay posts o reseñas aún para este lugar</p>
                        )}
                    </div>
                </aside>
            )}

            {/* Contador de lugares */}
            {places.length > 0 && (
                <div className={styles.placeCount}>
                    {places.length} {activeTab === 'comercios' ? 'comercios' : 'lugares'} en esta zona
                </div>
            )}
        </div>
    );
}
