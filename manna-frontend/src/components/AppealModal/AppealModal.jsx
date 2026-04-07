import React, { useState } from 'react';
import { Send, X, AlertCircle } from 'lucide-react';
import styles from './AppealModal.module.css';

export default function AppealModal({ isOpen, onClose, onConfirm, postTitle }) {
    const [reason, setReason] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (reason.trim().length < 10) return;
        onConfirm(reason);
        setReason('');
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <header className={styles.header}>
                    <h3>Solicitar Apelación</h3>
                    <button className={styles.closeBtn} onClick={onClose}><X size={18}/></button>
                </header>

                <div className={styles.body}>
                    <div className={styles.infoBox}>
                        <AlertCircle size={20} className={styles.infoIcon} />
                        <p>Tu publicación <strong>"{postTitle || 'Sin título'}"</strong> ha sido ocultada por reportes de la comunidad.</p>
                    </div>
                    
                    <form id="appealForm" onSubmit={handleSubmit}>
                        <label className={styles.label}>¿Por qué deberíamos restaurar esta publicación?</label>
                        <textarea 
                            className={styles.textarea}
                            placeholder="Describe detalladamente por qué consideras que tu contenido cumple con las normas de Manná..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            required
                            minLength={10}
                        />
                        <p className={styles.hint}>Mínimo 10 caracteres. Un moderador humano revisará tu solicitud.</p>
                    </form>
                </div>

                <footer className={styles.footer}>
                    <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
                    <button 
                        type="submit" 
                        form="appealForm"
                        className={styles.confirmBtn}
                        disabled={reason.trim().length < 10}
                    >
                        <Send size={16} />
                        Enviar Apelación
                    </button>
                </footer>
            </div>
        </div>
    );
}
