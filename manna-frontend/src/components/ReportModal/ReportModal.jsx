import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import styles from './ReportModal.module.css';

const REASONS = [
    { id: 'spam', label: 'Spam / Contenido no deseado' },
    { id: 'inappropriate', label: 'Contenido inapropiado / Sensible' },
    { id: 'harassment', label: 'Acoso o Bullying' },
    { id: 'hate_speech', label: 'Discurso de odio' },
    { id: 'scam', label: 'Estafa o Fraude' },
    { id: 'other', label: 'Otro motivo...' },
];

export default function ReportModal({ isOpen, onClose, onConfirm, isSubmitting }) {
    const [selectedReason, setSelectedReason] = useState('');
    const [customReason, setCustomReason] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        const finalReason = selectedReason === 'other' ? customReason : REASONS.find(r => r.id === selectedReason)?.label;
        if (!finalReason) return;
        onConfirm(finalReason);
    };

    return createPortal(
        <div className={styles.overlay} onMouseDown={e => e.stopPropagation()}>
            <div className={styles.modal} onMouseDown={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3>Reportar</h3>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className={styles.body}>
                    <p className={styles.description}>¿Por qué quieres reportar esta publicación? Tu reporte es anónimo y nos ayuda a mantener Ehise seguro.</p>
                    <div className={styles.options}>
                        {REASONS.map(reason => (
                            <button 
                                key={reason.id} 
                                type="button"
                                className={`${styles.option} ${selectedReason === reason.id ? styles.selected : ''}`}
                                onClick={() => setSelectedReason(reason.id)}
                            >
                                {reason.label}
                            </button>
                        ))}
                    </div>

                    {selectedReason === 'other' && (
                        <textarea
                            className={styles.textarea}
                            placeholder="Escribe el motivo..."
                            value={customReason}
                            onChange={(e) => setCustomReason(e.target.value)}
                            autoFocus
                        />
                    )}

                    <div className={styles.footer}>
                        <button 
                            className={styles.submitBtn}
                            onClick={handleSubmit}
                            disabled={isSubmitting || !selectedReason || (selectedReason === 'other' && !customReason.trim())}
                        >
                            {isSubmitting ? 'Enviando...' : 'Enviar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')
    );
}
