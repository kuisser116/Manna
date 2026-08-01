import { useEffect, useRef } from 'react';
import styles from './InFeedAd.module.css';

// ─────────────────────────────────────────────
// InFeedAd — Anuncio nativo dentro del feed
// Estilo Instagram: se ve como un post más con
// etiqueta "Patrocinado". Usa Google AdSense
// Auto Ads / display. Si AdSense no está aprobado
// o no hay slot configurado, no renderiza nada.
// ─────────────────────────────────────────────

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || '';
const ADSENSE_SLOT = import.meta.env.VITE_ADSENSE_SLOT_FEED || '';

export default function InFeedAd({ variant = 'feed' }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!ADSENSE_CLIENT) return; // AdSense no configurado → nada
    if (!containerRef.current) return;

    // Cargar script AdSense una sola vez (si no está ya)
    if (!document.querySelector('script[src*="adsbygoogle.js"]')) {
      const script = document.createElement('script');
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }

    // Push del slot (patrón oficial de AdSense)
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // Slot aún no disponible — AdSense no aprobado o bloqueado
    }
  }, []);

  if (!ADSENSE_CLIENT) return null;

  return (
    <div className={styles.adCard} ref={containerRef} data-ad-test="disabled">
      <div className={styles.adLabel}>Patrocinado</div>
      <div className={styles.adSlot}>
        {ADSENSE_SLOT ? (
          <ins
            className="adsbygoogle"
            style={{ display: 'block' }}
            data-ad-client={ADSENSE_CLIENT}
            data-ad-slot={ADSENSE_SLOT}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        ) : (
          <div className={styles.adAuto}>
            {/* Sin slot: Auto Ads de AdSense coloca el anuncio automáticamente */}
          </div>
        )}
      </div>
    </div>
  );
}
