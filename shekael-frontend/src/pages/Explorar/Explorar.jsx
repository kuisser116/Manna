import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { Store, Bus, MapPin } from 'lucide-react';
import { getBusinesses } from '../../api/businesses.api';
import styles from './Explorar.module.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const MAP_STYLE = 'mapbox://styles/kuisser/cmroeipik008m01qtdmk9ho18';

export default function Explorar() {
  const navigate = useNavigate();
  const location = useLocation();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [activeTab, setActiveTab] = useState('comercios');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [-99.1332, 19.4326],
      zoom: 12,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

    map.on('load', async () => {
      mapRef.current = map;
      setLoaded(true);

      // Fly to location if coming from profile
      const flyToTarget = location.state?.flyTo;
      if (flyToTarget) {
        map.flyTo({ center: [flyToTarget.lng, flyToTarget.lat], zoom: 15, duration: 2000 });
      }

      // Fetch real businesses from API
      try {
        const { data } = await getBusinesses();
        const businesses = data.businesses || [];

        businesses.forEach((biz) => {
          if (!biz.location_lat || !biz.location_lng) return;

          const el = document.createElement('div');
          el.className = styles.marker;
          el.innerHTML = `<div class="${styles.markerLabel}">${biz.name}</div><div class="${styles.markerDot}"></div>`;
          el.title = biz.name;

          const popup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(`
            <div class="${styles.popupContent}">
              <strong>${biz.name}</strong>
              <span>${biz.category || ''}</span>
            </div>
          `);

          const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([biz.location_lng, biz.location_lat])
            .setPopup(popup)
            .addTo(map);

          el.addEventListener('click', () => {
            navigate(`/business/${biz.id}`);
          });

          markersRef.current.push(marker);
        });
      } catch (err) {
        console.error('Error loading businesses for map:', err);
      }
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className={styles.page}>
      {/* Nav flotante */}
      <nav className={styles.nav}>
        <button
          className={`${styles.navTab} ${activeTab === 'comercios' ? styles.navTabActive : ''}`}
          onClick={() => setActiveTab('comercios')}
        >
          <Store size={18} /> Comercios
        </button>
        <button
          className={`${styles.navTab} ${activeTab === 'transporte' ? styles.navTabActive : ''}`}
          onClick={() => setActiveTab('transporte')}
        >
          <Bus size={18} /> Transporte
          <span className={styles.badge}>Próximamente</span>
        </button>
      </nav>

      {/* Mapa de fondo */}
      <div className={styles.mapContainer} ref={mapContainerRef}>
        {!loaded && (
          <div className={styles.loading}>
            <MapPin size={32} />
            <p>Cargando mapa...</p>
          </div>
        )}
      </div>
    </div>
  );
}
