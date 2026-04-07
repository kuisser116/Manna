import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from '../../styles/pages/AdsDashboard.module.css';
import useFeedbackModal from '../../components/FeedbackModal/useFeedbackModal';
import FeedbackModal from '../../components/FeedbackModal/FeedbackModal';
import api from '../../api/posts.api';
import useStore from '../../store';

export default function AdsDashboard() {
  const [stats, setStats] = useState(null);
  const { user } = useStore();
  const { modalState, showLoading, hideModal, showError } = useFeedbackModal();

  useEffect(() => {
    async function fetchDashboard() {
        showLoading('Cargando métricas', 'Conectando con Ads Studio...');
        try {
            const { data } = await api.get('/ads/my-campaigns');
            const totalC = data.campaigns?.length || 0;
            const activeC = data.campaigns?.filter(c => c.status === 'active').length || 0;
            const spent = (data.campaigns || []).reduce((acc, c) => acc + (c.spent_usdc || 0), 0);
            
            setStats({ totalC, activeC, spent });
            hideModal();
        } catch (error) {
            hideModal();
            showError('Error', 'No se pudieron cargar las métricas');
        }
    }
    fetchDashboard();
  }, [showLoading, hideModal, showError]);

  return (
    <div className={styles.container}>
      <div className={styles.actions}>
        <Link to="/ads-studio/create" className={styles.btnPrimary}>+ Crear Anuncio</Link>
      </div>
      <div className={styles.header}>
        <h1 className={styles.title}>Ads Studio</h1>
        <p>Bienvenido, {user?.displayName}. Este es el resumen de tus anuncios.</p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Campañas Totales</div>
          <div className={styles.statValue}>{stats?.totalC || 0}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Campañas Activas</div>
          <div className={styles.statValue}>{stats?.activeC || 0}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>MXNe Gastado</div>
          <div className={styles.statValue}>${(stats?.spent || 0).toFixed(2)}</div>
        </div>
      </div>
      <FeedbackModal {...modalState} onClose={hideModal} />
    </div>
  );
}
