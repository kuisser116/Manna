import { useEffect, useRef, useState } from 'react';
import { Eye, Star, MessageCircle, UserPlus, TrendingUp, ShoppingBag, BarChart3 } from 'lucide-react';
import gsap from 'gsap';
import styles from './BusinessAnalytics.module.css';

const MOCK_STATS = {
  profileViews: { total: 1250, change: '+12%', data: [180, 220, 190, 310, 280, 340, 290] },
  productViews: { total: 890, change: '+8%', data: [90, 120, 110, 200, 150, 180, 160] },
  averageRating: 4.5,
  totalReviews: 128,
  followers: { total: 342, change: '+5%', data: [10, 15, 8, 12, 20, 18, 22] },
  contacts: { calls: 45, whatsapp: 120, messages: 78 },
  topProducts: [
    { name: 'Taco al Pastor', views: 320 },
    { name: 'Torta al Pastor', views: 280 },
    { name: 'Taco de Suadero', views: 195 },
    { name: 'Agua de Horchata', views: 150 },
    { name: 'Orden de Cebollitas', views: 110 },
  ],
  weeklyInteractions: [45, 62, 38, 71, 55, 83, 67],
};

export default function BusinessAnalytics({ businessId }) {
  const [stats] = useState(MOCK_STATS);
  const cardsRef = useRef([]);
  const barRef = useRef(null);
  const pieRef = useRef(null);
  const lineRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Animate stat cards
      gsap.fromTo(
        cardsRef.current,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: 'power2.out' }
      );

      // Animate bar chart
      if (barRef.current) {
        const bars = barRef.current.querySelectorAll(`.${styles.bar}`);
        gsap.fromTo(
          bars,
          { scaleY: 0, transformOrigin: 'bottom' },
          { scaleY: 1, duration: 0.6, stagger: 0.05, ease: 'back.out(1.5)' }
        );
      }

      // Animate line chart
      if (lineRef.current) {
        const line = lineRef.current.querySelector(`.${styles.linePath}`);
        if (line) {
          const length = line.getTotalLength();
          gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
          gsap.to(line, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' });
        }
        const dots = lineRef.current.querySelectorAll(`.${styles.lineDot}`);
        gsap.fromTo(dots, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, stagger: 0.08, delay: 0.8 });
      }

      // Animate pie chart
      if (pieRef.current) {
        const segments = pieRef.current.querySelectorAll(`.${styles.pieSegment}`);
        gsap.fromTo(segments, { scale: 0, transformOrigin: 'center' }, {
          scale: 1, duration: 0.5, stagger: 0.1, ease: 'back.out(2)', delay: 0.3
        });
      }
    });

    return () => ctx.revert();
  }, []);

  const maxBar = Math.max(...stats.topProducts.map(p => p.views));
  const maxLine = Math.max(...stats.weeklyInteractions);
  const maxContact = Math.max(...Object.values(stats.contacts));

  return (
    <div className={styles.container}>
      <h2 className={styles.sectionTitle}><BarChart3 size={20} /> Estadísticas del comercio</h2>

      {/* Stat cards */}
      <div className={styles.cards}>
        {[
          { icon: <Eye size={20} />, label: 'Visitas al perfil', value: stats.profileViews.total.toLocaleString(), change: stats.profileViews.change, color: '#3b82f6' },
          { icon: <ShoppingBag size={20} />, label: 'Vistas a productos', value: stats.productViews.total.toLocaleString(), change: stats.productViews.change, color: '#8b5cf6' },
          { icon: <UserPlus size={20} />, label: 'Seguidores', value: stats.followers.total, change: stats.followers.change, color: '#10b981' },
          { icon: <Star size={20} />, label: 'Calificación', value: stats.averageRating, extra: `(${stats.totalReviews} reseñas)`, color: '#f59e0b' },
        ].map((card, i) => (
          <div key={i} className={styles.statCard} ref={el => cardsRef.current[i] = el} style={{ '--card-accent': card.color }}>
            <div className={styles.cardIcon}>{card.icon}</div>
            <div className={styles.cardInfo}>
              <span className={styles.cardLabel}>{card.label}</span>
              <span className={styles.cardValue}>{card.value}</span>
              {card.change && <span className={styles.cardChange}>{card.change}</span>}
              {card.extra && <span className={styles.cardExtra}>{card.extra}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Top products bar chart */}
      <div className={styles.chartCard} ref={barRef}>
        <h3 className={styles.chartTitle}>Productos más vistos</h3>
        <div className={styles.barChart}>
          {stats.topProducts.map((p, i) => (
            <div key={p.name} className={styles.barCol}>
              <span className={styles.barValue}>{p.views}</span>
              <div className={styles.barTrack}>
                <div
                  className={styles.bar}
                  style={{ height: `${(p.views / maxBar) * 100}%`, backgroundColor: `hsl(${220 + i * 25}, 70%, 55%)` }}
                />
              </div>
              <span className={styles.barLabel}>{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Interactions line chart */}
      <div className={styles.chartCard} ref={lineRef}>
        <h3 className={styles.chartTitle}>Interacciones esta semana</h3>
        <div className={styles.lineChart}>
          <svg viewBox="0 0 300 120" className={styles.lineSvg}>
            <path
              className={styles.linePath}
              d={stats.weeklyInteractions.map((v, i) =>
                `${i === 0 ? 'M' : 'L'} ${25 + i * 42} ${120 - (v / maxLine) * 100}`
              ).join(' ')}
              fill="none"
              stroke="var(--color-primary, #e11d48)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {stats.weeklyInteractions.map((v, i) => (
              <circle
                key={i}
                className={styles.lineDot}
                cx={25 + i * 42}
                cy={120 - (v / maxLine) * 100}
                r="3.5"
                fill="var(--color-primary, #e11d48)"
              />
            ))}
          </svg>
          <div className={styles.lineLabels}>
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, i) => (
              <span key={d} className={styles.lineLabel}>{d}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Contact methods pie chart */}
      <div className={styles.chartCard} ref={pieRef}>
        <h3 className={styles.chartTitle}>Cómo te contactan</h3>
        <div className={styles.pieChart}>
          {Object.entries(stats.contacts).map(([key, value], i) => {
            const colors = ['#3b82f6', '#25D366', '#e11d48'];
            const labels = { calls: 'Llamadas', whatsapp: 'WhatsApp', messages: 'Mensajes' };
            const pct = Math.round((value / maxContact) * 100);
            return (
              <div key={key} className={styles.pieRow}>
                <div className={styles.pieBarTrack}>
                  <div
                    className={styles.pieSegment}
                    style={{ width: `${pct}%`, backgroundColor: colors[i] }}
                  />
                </div>
                <span className={styles.pieLabel}>{labels[key]}</span>
                <span className={styles.pieValue}>{value}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
