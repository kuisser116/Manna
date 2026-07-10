import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, TrendingUp, Percent, HelpCircle, Store } from 'lucide-react';
import { getRegionalFund, updateUserState } from '../api/transactions.api';
import FeedbackModal from '../components/FeedbackModal/FeedbackModal';
import useFeedbackModal from '../components/FeedbackModal/useFeedbackModal';
import SelectStateModal from '../components/SelectStateModal/SelectStateModal';
import useStore from '../store';
import styles from '../styles/pages/FondoRegional.module.css';

export default function FondoRegional() {
    const [regionalTotal, setRegionalTotal] = useState('0.00');
    const [userState, setUserState] = useState(null);
    const [showStateModal, setShowStateModal] = useState(false);
    const [loadingState, setLoadingState] = useState(false);

    const { modalState, showError, hideModal } = useFeedbackModal();

    const fetchData = async () => {
        try {
            const { data } = await getRegionalFund();
            if (data.needsState) {
                setShowStateModal(true);
            } else {
                setRegionalTotal(data.total || '0.00');
                setUserState(data.state);
                setShowStateModal(false);
            }
        } catch (err) {
            console.error('Error fetching regional fund data:', err);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSelectState = async (state) => {
        setLoadingState(true);
        try {
            await updateUserState(state);
            await fetchData();
        } catch (err) {
            showError('Error', 'No se pudo guardar el estado');
        } finally {
            setLoadingState(false);
        }
    };

    return (
        <div className={styles.layout}>
            <main className={styles.main}>

                <div className={styles.header}>
                    <div className={styles.titleRow}>
                        <MapPin size={28} color="var(--color-primary)" />
                        <div>
                            <h2 className={styles.title}>Fondo Regional {userState ? `· ${userState}` : ''}</h2>
                            <p className={styles.subtitle}>Descuentos automáticos en comercios de tu estado</p>
                        </div>
                    </div>

                    {/* Fondo acumulado */}
                    <motion.div
                        className={styles.fundCard}
                        animate={{ boxShadow: ['0 0 10px rgba(201,168,76,0.2)', '0 0 30px rgba(201,168,76,0.4)', '0 0 10px rgba(201,168,76,0.2)'] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                    >
                        <div className={styles.fundLabel}>
                            <TrendingUp size={16} />
                            Fondo disponible para descuentos
                        </div>
                        <div className={styles.fundAmount}>${regionalTotal} MXNe</div>
                        <div className={styles.fundSub}>Transparencia total en la red Stellar</div>
                    </motion.div>
                </div>

                {/* Modelo de descuento */}
                <div className={styles.discountSection}>
                    <div className={styles.sectionHeader}>
                        <Percent size={18} color="var(--color-accent)" />
                        <h3 className={styles.sectionTitle}>¿Cómo funciona el descuento?</h3>
                    </div>

                    <div className={styles.discountCard}>
                        <div className={styles.discountIcon}>
                            <Store size={32} />
                        </div>
                        <div className={styles.discountContent}>
                            <h4>5% de descuento automático</h4>
                            <p>Cuando pagues en comercios de {userState || 'tu estado'}, recibirás un 5% de descuento automáticamente.</p>
                            <p className={styles.discountNote}>Tope máximo: $50 MXNe por transacción</p>
                        </div>
                    </div>

                    <div className={styles.examplesSection}>
                        <h4>Ejemplos:</h4>
                        <ul className={styles.examplesList}>
                            <li>
                                <span>Compra de $800</span>
                                <span className={styles.exampleDiscount}>→ $40 de descuento</span>
                            </li>
                            <li>
                                <span>Compra de $2,000</span>
                                <span className={styles.exampleDiscount}>→ $50 de descuento (tope aplicado)</span>
                            </li>
                            <li>
                                <span>Compra de $100</span>
                                <span className={styles.exampleDiscount}>→ $5 de descuento</span>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Estado vacío si no hay fondo */}
                {parseFloat(regionalTotal) === 0 && (
                    <div className={styles.emptyState}>
                        <HelpCircle size={48} />
                        <p>El fondo de {userState || 'tu estado'} aún no tiene saldo. ¡Pronto habrá descuentos disponibles!</p>
                    </div>
                )}

            </main>


            <SelectStateModal
                isOpen={showStateModal}
                onSelect={handleSelectState}
                loading={loadingState}
            />

            <FeedbackModal
                isOpen={modalState.isOpen}
                onClose={hideModal}
                type={modalState.type}
                title={modalState.title}
                message={modalState.message}
                showCloseButton={modalState.showCloseButton}
                autoClose={modalState.autoClose}
                autoCloseDelay={modalState.autoCloseDelay}
            />
        </div>
    );
}
