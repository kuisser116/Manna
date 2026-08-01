import { useState } from 'react';
import { X, Lock, Trash2, Eye, EyeOff, Save, AlertTriangle } from 'lucide-react';
import styles from './BusinessSettings.module.css';

export default function BusinessSettings({
  business,
  onClose,
  onDelete,
  onToggleProducts,
  onToggleReviews,
  showProducts,
  showReviews,
}) {
  const [deleteStep, setDeleteStep] = useState(null); // null | 'pin' | 'password' | 'confirm'
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [pinError, setPinError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);

  const handleDeleteStart = () => setDeleteStep('pin');
  const handleCancelDelete = () => { setDeleteStep(null); setPin(''); setPassword(''); setPinError(''); setPasswordError(''); };

  const handlePinSubmit = () => {
    if (pin === '1234') { // mock: PIN correcto
      setPinError('');
      setDeleteStep('password');
    } else {
      setPinError('PIN incorrecto');
    }
  };

  const handlePasswordSubmit = () => {
    if (password === 'comercio123') { // mock
      setPasswordError('');
      setDeleteStep('confirm');
    } else {
      setPasswordError('Contraseña incorrecta');
    }
  };

  const handleConfirmDelete = () => {
    onDelete?.();
    onClose?.();
  };

  const handleChangePassword = () => {
    setPasswordChanged(true);
    setTimeout(() => setPasswordChanged(false), 2000);
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
                      type="text"
                      placeholder="Nueva contraseña"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                    />
                    <button
                      className={styles.primaryBtn}
                      onClick={handleChangePassword}
                      disabled={newPassword.length < 6}
                    >
                      <Save size={14} /> Guardar
                    </button>
                  </div>
                  {passwordChanged && <span className={styles.success}>Contraseña actualizada</span>}
                </div>
              )}
            </div>

            {/* Delete */}
            <div className={styles.section}>
              <h3>Zona peligrosa</h3>
              <p className={styles.dangerNote}>Esta acción requiere doble verificación: PIN + contraseña del comercio.</p>
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
                <p className={styles.verifyText}>Ingresa la contraseña de este comercio</p>
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
                  <button className={styles.primaryBtn} onClick={handlePasswordSubmit}>Verificar</button>
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
