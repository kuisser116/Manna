import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, X, Camera, CheckCircle2, Loader2, User, Check, AlertCircle } from 'lucide-react';
import { checkUsername, setUsername } from '../../api/users.api';
import useStore from '../../store';
import styles from './ProfileEditModal.module.css';

export default function ProfileEditModal({ user, isOpen, onClose, onSave }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [preview, setPreview] = useState(user?.avatarUrl || null);
    const [bio, setBio] = useState(user?.bio || '');
    const [username, setUsernameLocal] = useState(user?.username || '');
    const [usernameStatus, setUsernameStatus] = useState(null); // null | 'checking' | 'available' | 'taken' | 'invalid'
    const [isSaving, setIsSaving] = useState(false);
    const usernameTimer = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen && user) {
            setUsernameLocal(user.username || '');
            setBio(user.bio || '');
            setPreview(user.avatarUrl || null);
            setSelectedFile(null);
            setUsernameStatus(null);
        }
    }, [isOpen, user]);

    // Verificar disponibilidad de username con debounce
    const handleUsernameChange = (e) => {
        const val = e.target.value;
        setUsernameLocal(val);

        if (usernameTimer.current) clearTimeout(usernameTimer.current);

        if (!val || val === user?.username) {
            setUsernameStatus(null);
            return;
        }

        if (val.length < 2) {
            setUsernameStatus('invalid');
            return;
        }

        setUsernameStatus('checking');
        usernameTimer.current = setTimeout(async () => {
            try {
                const { data } = await checkUsername(val);
                setUsernameStatus(data.available ? 'available' : 'taken');
            } catch {
                setUsernameStatus(null);
            }
        }, 500);
    };

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
        setIsSaving(true);
        try {
            // Guardar username (actualiza username + display_name en backend)
            let newDisplayName = null;
            if (username !== user?.username && usernameStatus === 'available') {
                const { data } = await setUsername(username);
                newDisplayName = data.displayName;
                if (newDisplayName) {
                    useStore.getState().setUser({
                        ...useStore.getState().user,
                        username: data.username,
                        displayName: newDisplayName
                    });
                }
            }

            await onSave({
                displayName: newDisplayName || undefined,
                bio: bio !== user.bio ? bio : undefined,
                avatarFile: selectedFile
            });
            onClose();
        } catch (err) {
            alert(err.message || 'Error al actualizar el perfil');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveFile = () => {
        setSelectedFile(null);
        setPreview(user?.avatarUrl || null);
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
                        <h2 className={styles.title}>Editar Perfil</h2>
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.body}>
                    <div className={styles.avatarSection}>
                        <div className={styles.avatarPreview}>
                            {preview ? (
                                <img src={preview} alt="Avatar preview" className={styles.previewImage} />
                            ) : (
                                <div className={styles.previewPlaceholder}>
                                    <User size={40} />
                                </div>
                            )}
                            <button 
                                className={styles.avatarEditBtn}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Camera size={16} />
                            </button>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            hidden
                        />
                        {selectedFile && (
                            <button onClick={handleRemoveFile} className={styles.removeBtn}>
                                <X size={14} /> Deshacer cambio de foto
                            </button>
                        )}
                        <p className={styles.uploadHint}>JPG, PNG o WebP · Máximo 5MB</p>
                    </div>

                    {!user?.username && (
                        <div className={styles.usernameAlert}>
                            <AlertCircle size={14} />
                            Elige un nombre único para tu perfil
                        </div>
                    )}

                    <div className={styles.formGroup}>
                        <label>Nombre único</label>
                        <p className={styles.fieldDesc}>Este será tu nombre en toda la app. Debe ser único.</p>
                        <div className={styles.usernameInputWrap}>
                            <span className={styles.usernamePrefix}>@</span>
                            <input
                                type="text"
                                value={username}
                                onChange={handleUsernameChange}
                                placeholder="Tu nombre"
                                maxLength={30}
                                className={`${styles.usernameInput} ${
                                    usernameStatus === 'available' ? styles.usernameOk :
                                    usernameStatus === 'taken' ? styles.usernameTaken :
                                    usernameStatus === 'invalid' ? styles.usernameInvalid : ''
                                }`}
                            />
                            {usernameStatus === 'checking' && <Loader2 size={14} className={styles.spin} />}
                            {usernameStatus === 'available' && <Check size={14} className={styles.usernameCheckIcon} />}
                            {usernameStatus === 'taken' && <X size={14} className={styles.usernameXIcon} />}
                        </div>
                        {usernameStatus === 'available' && <span className={styles.usernameHintOk}>Disponible</span>}
                        {usernameStatus === 'taken' && <span className={styles.usernameHintTaken}>Ya está en uso</span>}
                        {usernameStatus === 'invalid' && <span className={styles.usernameHintInvalid}>Mínimo 2 caracteres</span>}
                        <span className={styles.usernameHelp}>Letras, números, espacios, puntos y guiones</span>
                    </div>

                    <div className={styles.formGroup}>
                        <label>Descripción / Bio</label>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Cuéntanos un poco sobre ti..."
                            rows={3}
                            maxLength={160}
                        />
                        <span className={styles.charCount}>{bio.length}/160</span>
                    </div>
                </div>

                <div className={styles.actions}>
                    <button onClick={onClose} className={styles.btnSecondary} disabled={isSaving}>
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || (!username.trim() && !bio.trim() && !selectedFile)}
                        className={styles.btnPrimary}
                    >
                        {isSaving ? (
                            <>
                                <Loader2 size={16} className={styles.spin} />
                                Guardando...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={16} />
                                Guardar cambios
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
