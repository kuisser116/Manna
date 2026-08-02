import { useState } from 'react';
import { X, Lock, Trash2, Eye, EyeOff, Save, AlertTriangle, Loader2, Check } from 'lucide-react';
import styles from './BusinessSettings.module.css';
import { verifyBusinessPassword, updateBusinessPassword, updateBusiness, checkBusinessName, updateBusinessPrivacy } from '../../api/businesses.api';

export default function BusinessSettings({
  business,
  onClose,
  onDelete,
  onSaved,
}) {
  // ── Editar perfil del comercio ──
  const [name, setName] = useState(business?.name || '');
  const [description, setDescription] = useState(business?.description || '');
  const [email, setEmail] = useState(business?.email || '');
  const [nameStatus, setNameStatus] = useState(null); // null | 'checking' | 'available' | 'taken'
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  // ── Privacidad ──
  const [showProducts, setShowProducts] = useState(business?.show_products !== false);
  const [showReviews, setShowReviews] = useState(business?.show_reviews !== false);

  // ── Contraseña ──
  const [deleteStep, setDeleteStep] = useState(null); // null | 'password' | 'confirm'
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleDeleteStart = () => setDeleteStep('password');
  const handleCancelDelete = () => { setDeleteStep(null); setPassword(''); setPasswordError(''); };

  const handlePasswordSubmit = async () => {
    if (!business?.id) return;
    setVerifying(true);
    setPasswordError('');
    try {
      await verifyBusinessPassword(business.id, password);
      setPasswordError('');
      setDeleteStep('confirm');
    } catch (err) {
      setPasswordError(err?.response?.data?.message || 'Contraseña incorrecta');
    } finally {
      setVerifying(false);
    }
  };

  const handleConfirmDelete = () => {
    onDelete?.();
    onClose?.();
  };

  const handleChangePassword = async () => {
    if (!business?.id) return;
    setSavingPassword(true);
    try {
      await updateBusinessPassword(business.id, {
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      setPasswordChanged(true);
      setNewPassword('');
      setCurrentPassword('');
      setTimeout(() => setPasswordChanged(false), 2500);
    } catch (err) {
      setPasswordError(err?.response?.data?.message || 'Error al cambiar la contraseña');
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Verificar disponibilidad del nombre del comercio (único en Shekael) ──
  const handleNameChange = async (e) => {
    const val = e.target.value;
    setName(val);
    if (!val || val.toLowerCase() === (business?.name || '').toLowerCase()) {
      setNameStatus(null);
      return;
    }
    if (val.trim().length < 2) { setNameStatus('taken'); return; }
    setNameStatus('checking');
    try {
      const { data } = await checkBusinessName(val.trim());
      setNameStatus(data?.available ? 'available' : 'taken');
    } catch {
      setNameStatus(null);
    }
  };

  // ── Guardar perfil del comercio ──
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      if (description !== undefined) formData.append('description', description.trim());
      if (email !== undefined) formData.append('email', email.trim());
      const { data } = await updateBusiness(business.id, formData);
      setProfileMsg({ type: 'success', text: 'Comercio actualizado correctamente.' });
      onSaved?.(data.business);
    } catch (err) {
      setProfileMsg({ type: 'error', text: err?.response?.data?.message || 'Error al guardar' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleProducts = async () => {
    const next = !showProducts;
    setShowProducts(next);
    try {
      const { data } = await updateBusinessPrivacy(business.id, { showProducts: next });
      if (data?.business) onSaved?.(data.business);
    } catch { setShowProducts(!next); }
  };

  const handleToggleReviews = async () => {
    const next = !showReviews;
    setShowReviews(next);
    try {
      const { data } = await updateBusinessPrivacy(business.id, { showReviews: next });
      if (data?.business) onSaved?.(data.business);
    } catch { setShowReviews(!next); }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Configuración del comercio</h2>
          <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {!deleteStep ? (
          <div className={styles.body}>
            {/* Perfil del comercio */}
            <div className={styles.section}>
              <h3>Perfil</h3>
              <div className={styles.field}>
                <label>Nombre del comercio (único en Shekael)</label>
                <div className={styles.nameRow}>
                  <input
                    type="text"
                    value={name}
                    onChange={handleNameChange}
                    maxLength={60}
                    placeholder="Nombre del comercio"
                  />
                  {nameStatus === 'checking' && <Loader2 size={16} className={styles.spinner} />}
                  {nameStatus === 'available' && <Check size={16} style={{ color: 'var(--color-success)' }} />}
                  {nameStatus === 'taken' && <span className={styles.error}>Nombre en uso o inválido</span>}
                </div>
              </div>
              <div className={styles.field}>
                <label>Descripción</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="Describe tu comercio..."
                  className={styles.textarea}
                />
              </div>
              <div className={styles.field}>
                <label>Correo de contacto</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  maxLength={120}
                  placeholder="contacto@comercio.com"
                />
              </div>
              <button className={styles.primaryBtn} onClick={handleSaveProfile} disabled={savingProfile || nameStatus === 'taken'}>
                {savingProfile ? <Loader2 size={14} className={styles.spinner} /> : <Save size={14} />} Guardar cambios
              </button>
              {profileMsg && <span className={profileMsg.type === 'success' ? styles.success : styles.error}>{profileMsg.text}</span>}
            </div>

            {/* Privacy toggles */}
            <div className={styles.section}>
              <h3>Privacidad</h3>
              <label className={styles.toggle}>
                <span>Mostrar sección de productos</span>
                <input type="checkbox" checked={showProducts} onChange={handleToggleProducts} />
                <span className={styles.toggleSlider} />
              </label>
              <label className={styles.toggle}>
                <span>Mostrar sección de reseñas</span>
                <input type="checkbox" checked={showReviews} onChange={handleToggleReviews} />
                <span className={styles.toggleSlider} />
              </label>
            </div>

            {/* Password change */}
            <div className={styles.section}>
              <h3>Contraseña del comercio</h3>
              {!changePassword ? (
                <button className={styles.secondaryBtn} onClick={() => setChangePassword(true)}>
                  <Lock size={16} /> Cambiar contraseña
                </button>
              ) : (
                <div className={styles.passwordChange}>
                  <div className={styles.field}>
                    <input
                      type="password"
                      placeholder="Contraseña actual"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <input
                      type="text"
                      placeholder="Nueva contraseña (mín. 6)"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                    />
                    <button
                      className={styles.primaryBtn}
                      onClick={handleChangePassword}
                      disabled={newPassword.length < 6 || savingPassword}
                    >
                      {savingPassword ? <Loader2 size={14} className={styles.spinner} /> : <Save size={14} />} Guardar
                    </button>
                  </div>
                  {passwordError && <span className={styles.error}>{passwordError}</span>}
                  {passwordChanged && <span className={styles.success}>Contraseña actualizada</span>}
                </div>
              )}
            </div>

            {/* Delete */}
            <div className={styles.section}>
              <h3>Zona peligrosa</h3>
              <p className={styles.dangerNote}>Esta acción requiere la contraseña del comercio.</p>
              <button className={styles.dangerBtn} onClick={handleDeleteStart}>
                <Trash2 size={16} /> Eliminar comercio
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.body}>
            {deleteStep === 'password' && (
              <div className={styles.verifyStep}>
                <Lock size={32} />
                <h3>Contraseña del comercio</h3>
                <p className={styles.verifyText}>Ingresa la contraseña de este comercio para confirmar</p>
                <div className={styles.passwordField}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Contraseña"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={passwordError ? styles.inputError : ''}
                    autoFocus
                  />
                  <button className={styles.togglePassword} onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {passwordError && <span className={styles.error}>{passwordError}</span>}
                <div className={styles.verifyActions}>
                  <button className={styles.secondaryBtn} onClick={handleCancelDelete}>Cancelar</button>
                  <button className={styles.primaryBtn} onClick={handlePasswordSubmit} disabled={verifying}>
                    {verifying ? <Loader2 size={16} className={styles.spinner} /> : null} Verificar
                  </button>
                </div>
              </div>
            )}

            {deleteStep === 'confirm' && (
              <div className={styles.verifyStep}>
                <AlertTriangle size={40} color="#ef4444" />
                <h3>¿Eliminar comercio?</h3>
                <p className={styles.verifyText}>Esta acción no se puede deshacer. Se eliminarán todos los productos, reseñas y datos de este comercio.</p>
                <div className={styles.verifyActions}>
                  <button className={styles.secondaryBtn} onClick={handleCancelDelete}>No, cancelar</button>
                  <button className={styles.deleteBtn} onClick={handleConfirmDelete}>
                    <Trash2 size={16} /> Sí, eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
