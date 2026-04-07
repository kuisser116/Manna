import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Camera, CheckCircle2, Loader2, User } from 'lucide-react';
import styles from './AvatarEditModal.module.css';

export default function AvatarEditModal({ currentAvatar, isOpen, onClose, onSave }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [preview, setPreview] = useState(currentAvatar || null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Solo se permiten imágenes');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('La imagen no puede superar 5MB');
            return;
        }

        setSelectedFile(file);
        setPreview(URL.createObjectURL(file));
    };

    const handleSave = async () => {
        if (!selectedFile) {
            onClose();
            return;
        }

        setIsUploading(true);
        try {
            await onSave(selectedFile);
            onClose();
        } catch (err) {
            alert(err.message || 'Error al actualizar el avatar');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemove = () => {
        setSelectedFile(null);
        setPreview(currentAvatar || null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay}>
            <motion.div
                className={styles.modal}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
            >
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <Camera size={20} className={styles.headerIcon} />
                        <h2 className={styles.title}>Cambiar foto de perfil</h2>
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.previewSection}>
                    <div className={styles.avatarPreview}>
                        {preview ? (
                            <img src={preview} alt="Avatar preview" className={styles.previewImage} />
                        ) : (
                            <div className={styles.previewPlaceholder}>
                                <User size={40} />
                            </div>
                        )}
                    </div>
                    {selectedFile && (
                        <button onClick={handleRemove} className={styles.removeBtn}>
                            <X size={14} /> Eliminar
                        </button>
                    )}
                </div>

                <div className={styles.uploadSection}>
                    <label className={styles.uploadZone}>
                        <Upload size={24} />
                        <span>Subir nueva imagen</span>
                        <span className={styles.uploadHint}>JPG, PNG o WebP · Máximo 5MB · Recomendado 400×400</span>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            hidden
                        />
                    </label>
                </div>

                <div className={styles.actions}>
                    <button onClick={onClose} className={styles.btnSecondary}>
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!selectedFile || isUploading}
                        className={styles.btnPrimary}
                    >
                        {isUploading ? (
                            <>
                                <Loader2 size={16} className={styles.spin} />
                                Guardando...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={16} />
                                Guardar
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
