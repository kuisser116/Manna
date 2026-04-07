import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Check, ChevronRight } from 'lucide-react';
import styles from './SelectStateModal.module.css';

const STATES = [
    'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 
    'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 
    'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 
    'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 
    'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'
];

export default function SelectStateModal({ isOpen, onSelect, loading }) {
    const [selected, setSelected] = useState('');

    const handleConfirm = () => {
        if (selected) onSelect(selected);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div 
                        className={styles.overlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div 
                            className={styles.modal}
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className={styles.header}>
                                <MapPin className={styles.icon} size={32} />
                                <h2 className={styles.title}>Selecciona tu Estado</h2>
                                <p className={styles.subtitle}>Para participar en el Fondo Regional y votar por causas locales.</p>
                            </div>

                            <div className={styles.scrollArea}>
                                <div className={styles.grid}>
                                    {STATES.map((state) => (
                                        <button
                                            key={state}
                                            className={`${styles.stateBtn} ${selected === state ? styles.active : ''}`}
                                            onClick={() => setSelected(state)}
                                        >
                                            <span>{state}</span>
                                            {selected === state && <Check size={16} />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.footer}>
                                <motion.button 
                                    className={styles.confirmBtn} 
                                    disabled={!selected || loading}
                                    onClick={handleConfirm}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    {loading ? 'Guardando...' : (
                                        <>
                                            Confirmar Estado <ChevronRight size={18} />
                                        </>
                                    )}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
