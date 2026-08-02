import { useState } from 'react';
import { X, Lock, Trash2, Eye, EyeOff, Save, AlertTriangle, Loader2 } from 'lucide-react';
import styles from './BusinessSettings.module.css';
import { verifyBusinessPassword, updateBusinessPassword } from '../../api/businesses.api';

export default function BusinessSettings({
  business,
  onClose,
  onDelete,
  onToggleProducts,
  onToggleReviews,
  showProducts,
  showReviews,
}) {
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

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Administrar comercio</h2>
          <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {!deleteStep ? (
          <div className={styles.body}>
            {/* Privacy toggles */}
            <div className={styles.section}>
              <h3>Privacidad</h3>
              <label className={styles.toggle}>
                <span>Mostrar sección de productos</span>
                <input type="checkbox" checked={showProducts} onChange={onToggleProducts} />
                <span className={styles.toggleSlider} />
              </label>
              <label className={styles.toggle}>
                <span>Mostrar sección de reseñas</span>
                <input type="checkbox" checked={showReviews} onChange={onToggleReviews} />
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
            {deleteStep === 'pin' && (
              <div className={styles.verifyStep}>
                <Lock size={32} />
                <h3>Verificación de seguridad</h3>
                <p className={styles.verifyText}>Ingresa tu PIN para continuar</p>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="PIN"
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                  className={pinError ? styles.inputError : ''}
                  autoFocus
                />
                {pinError && <span className={styles.error}>{pinError}</span>}
                <div className={styles.verifyActions}>
                  <button className={styles.secondaryBtn} onClick={handleCancelDelete}>Cancelar</button>
                  <button className={styles.primaryBtn} onClick={handlePinSubmit}>Verificar</button>
                </div>
              </div>
            )}

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
