import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Save, Lock, Trash2, Eye, EyeOff, Loader2, Check, AlertTriangle,
  MapPin, Store, Phone, Globe, Mail, RotateCcw, X
} from 'lucide-react';
import { getBusiness, updateBusiness, checkBusinessName, updateBusinessPassword, verifyBusinessPassword, deleteBusiness, reactivateBusiness } from '../../api/businesses.api';
import { verifyPin } from '../../api/auth.api';
import { computePinHash } from '../../crypto/pinHash';
import useStore from '../../store';
import styles from '../../components/Business/BusinessSettings.module.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLE = 'mapbox://styles/kuisser/cmroeipik008m01qtdmk9ho18';

const CATEGORIES = [
  'Comida y Bebida', 'Tienda / Retail', 'Servicios Profesionales',
  'Salud y Bienestar', 'Arte y Cultura', 'Taller Mecánico', 'Educación',
  'Entretenimiento', 'Hogar y Jardín', 'Tecnología', 'Moda y Accesorios', 'Otro',
];

export default function BusinessSettingsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast, setActiveProfile } = useStore();

  const [biz, setBiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // Campos del perfil
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(19.4326);
  const [lng, setLng] = useState(-99.1332);
  const [nameStatus, setNameStatus] = useState(null);

  // Contraseña
  const [changePassword, setChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // Desactivar (doble verificación)
  const [deleting, setDeleting] = useState(false);
  const [delStep, setDelStep] = useState('pass'); // 'pass' | 'pin' | 'confirm'
  const [delPass, setDelPass] = useState('');
  const [delPin, setDelPin] = useState('');
  const [delError, setDelError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Reactivar
  const [reactivating, setReactivating] = useState(false);
  const [rePass, setRePass] = useState('');

  // Mapa
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    load();
  }, [id]);

  async function load() {
    try {
      setLoading(true);
      const { data } = await getBusiness(id);
      const b = data.business;
      if (!b.isOwner) {
        addToast('error', 'No autorizado', 'No eres el dueño de este comercio.');
        navigate(`/business/${id}`);
        return;
      }
      setBiz(b);
      setName(b.name || '');
      setCategory(b.category || 'Otro');
      setDescription(b.description || '');
      setEmail(b.email || '');
      setPhone(b.phone || '');
      setWebsite(b.website || '');
      setAddress(b.address || '');
      if (b.location_lat) setLat(b.location_lat);
      if (b.location_lng) setLng(b.location_lng);
    } catch (err) {
      addToast('error', 'Error', err?.response?.data?.message || 'No se pudo cargar el comercio');
      navigate('/profile');
    } finally {
      setLoading(false);
    }
  }

  // Mapa para seleccionar ubicación
  useEffect(() => {
    if (!biz || mapRef.current || !mapContainerRef.current) return;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [lng, lat],
      zoom: 12,
    });
    mapRef.current = map;
    const onClick = (e) => {
      setLat(e.lngLat.lat);
      setLng(e.lngLat.lng);
      if (markerRef.current) markerRef.current.setLngLat([e.lngLat.lng, e.lngLat.lat]);
      else markerRef.current = new mapboxgl.Marker({ color: '#e11d48' }).setLngLat([e.lngLat.lng, e.lngLat.lat]).addTo(map);
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [biz]);

  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    }
  }, [lat, lng]);

  const handleNameChange = async (e) => {
    const val = e.target.value;
    setName(val);
    if (!val || val.toLowerCase() === (biz?.name || '').toLowerCase()) { setNameStatus(null); return; }
    if (val.trim().length < 2) { setNameStatus('taken'); return; }
    setNameStatus('checking');
    try {
      const { data } = await checkBusinessName(val.trim());
      setNameStatus(data?.available ? 'available' : 'taken');
    } catch { setNameStatus(null); }
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const body = {
        name: name.trim(),
        category,
        description: description.trim(),
        email: email.trim(),
        phone: phone.trim(),
        website: website.trim(),
        address: address.trim(),
        lat,
        lng,
      };
      const { data } = await updateBusiness(id, body);
      setBiz(prev => ({ ...prev, ...data.business }));
      setActiveProfile({ type: 'business', business: { ...biz, ...data.business } });
      addToast('success', 'Comercio actualizado', 'Los cambios se guardaron correctamente.');
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      await updateBusinessPassword(id, { currentPassword: currentPassword || undefined, newPassword });
      setPasswordMsg({ type: 'success', text: 'Contraseña actualizada' });
      setNewPassword(''); setCurrentPassword(''); setChangePassword(false);
    } catch (err) {
      setPasswordMsg({ type: 'error', text: err?.response?.data?.message || 'Error al cambiar contraseña' });
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Desactivar con doble verificación: contraseña comercio → PIN cuenta ──
  const handleDeactivateStart = async () => {
    setDelError('');
    setVerifying(true);
    try {
      await verifyBusinessPassword(id, delPass);
      setDelStep('pin');
    } catch (err) {
      setDelError(err?.response?.data?.message || 'Contraseña incorrecta');
    } finally {
      setVerifying(false);
    }
  };

  const handleDeactivatePin = async () => {
    setDelError('');
    setVerifying(true);
    try {
      // Verificar PIN de la cuenta (mismo hash que LockScreen/Seguridad)
      const pinHash = computePinHash(delPin);
      const res = await verifyPin({ pinHash });
      if (!res.data?.success) throw new Error('PIN incorrecto');
      setDelStep('confirm');
    } catch (err) {
      setDelError(err?.response?.data?.message || 'PIN incorrecto');
    } finally {
      setVerifying(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    setDelError('');
    setVerifying(true);
    try {
      const pinHash = computePinHash(delPin);
      await deleteBusiness(id, { password: delPass, pinHash });
      addToast('success', 'Comercio desactivado', 'Puedes reactivarlo cuando quieras desde Configuración.');
      setDeleting(false);
      setDelStep('pass');
      setDelPass(''); setDelPin('');
      setActiveProfile({ type: 'user' });
      navigate('/profile');
    } catch (err) {
      setDelError(err?.response?.data?.message || 'Error al desactivar');
      setVerifying(false);
    }
  };

  // ── Reactivar ──
  const handleReactivate = async () => {
    setReactivating(true);
    setMsg(null);
    try {
      await reactivateBusiness(id, rePass);
      addToast('success', 'Comercio reactivado', 'Tu comercio ya está visible para todos.');
      setRePass('');
      await load();
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.message || 'Error al reactivar' });
    } finally {
      setReactivating(false);
    }
  };

  if (loading || !biz) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 20px' }}>
        <Loader2 size={28} className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className={styles.pageWrap}>
      <div className={styles.pageHeader}>
        <button className={styles.backBtn} onClick={() => navigate(`/business/${id}`)}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>Configuración del comercio</h1>
          <p className={styles.pageSubtitle}>{biz.name}</p>
        </div>
        {!biz.is_active && (
          <span className={styles.inactiveBadge}>Desactivado</span>
        )}
      </div>

      {!biz.is_active && (
        <div className={styles.reactivateCard}>
          <RotateCcw size={18} />
          <div className={styles.reactivateText}>
            <strong>Tu comercio está desactivado</strong>
            <span>No aparece en el mapa ni puede recibir pagos. Puedes reactivarlo cuando quieras.</span>
          </div>
          <div className={styles.reactivateForm}>
            <input
              type="password"
              placeholder="Contraseña del comercio"
              value={rePass}
              onChange={e => setRePass(e.target.value)}
            />
            <button className={styles.primaryBtn} onClick={handleReactivate} disabled={!rePass || reactivating}>
              {reactivating ? <Loader2 size={14} className={styles.spinner} /> : <RotateCcw size={14} />} Reactivar
            </button>
          </div>
        </div>
      )}

      <div className={styles.pageBody}>
        {/* ── Perfil del comercio ── */}
        <div className={styles.section}>
          <h3><Store size={16} /> Perfil</h3>
          <div className={styles.field}>
            <label>Nombre del comercio (único en Shekael)</label>
            <div className={styles.nameRow}>
              <input type="text" value={name} onChange={handleNameChange} maxLength={60} />
              {nameStatus === 'checking' && <Loader2 size={16} className={styles.spinner} />}
              {nameStatus === 'available' && <Check size={16} style={{ color: 'var(--color-success)' }} />}
              {nameStatus === 'taken' && <span className={styles.error}>Nombre en uso o inválido</span>}
            </div>
          </div>
          <div className={styles.field}>
            <label>Tipo de servicio (categoría)</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={styles.select}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>Descripción</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={300} className={styles.textarea} />
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label><Mail size={13} /> Correo de contacto</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={120} />
            </div>
            <div className={styles.field}>
              <label><Phone size={13} /> Teléfono</label>
              <input type="text" value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} />
            </div>
          </div>
          <div className={styles.field}>
            <label><Globe size={13} /> Sitio web</label>
            <input type="text" value={website} onChange={e => setWebsite(e.target.value)} maxLength={120} placeholder="https://..." />
          </div>
          <div className={styles.field}>
            <label>Dirección</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} maxLength={200} />
          </div>
          <div className={styles.field}>
            <label><MapPin size={13} /> Ubicación en el mapa</label>
            <div className={styles.mapWrap}>
              <div ref={mapContainerRef} className={styles.mapBox} />
            </div>
            <div className={styles.coords}>
              <span>Lat: {lat.toFixed(4)}</span>
              <span>Lng: {lng.toFixed(4)}</span>
            </div>
          </div>
          <button className={styles.primaryBtn} onClick={handleSave} disabled={saving || nameStatus === 'taken'}>
            {saving ? <Loader2 size={14} className={styles.spinner} /> : <Save size={14} />} Guardar cambios
          </button>
          {msg && <span className={msg.type === 'success' ? styles.success : styles.error}>{msg.text}</span>}
        </div>

        {/* ── Contraseña ── */}
        <div className={styles.section}>
          <h3><Lock size={16} /> Contraseña del comercio</h3>
          {!changePassword ? (
            <button className={styles.secondaryBtn} onClick={() => setChangePassword(true)}>
              <Lock size={16} /> Cambiar contraseña
            </button>
          ) : (
            <div className={styles.passwordChange}>
              <input type="password" placeholder="Contraseña actual" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              <input type="text" placeholder="Nueva contraseña (mín. 6)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              <div className={styles.verifyActions}>
                <button className={styles.secondaryBtn} onClick={() => setChangePassword(false)}>Cancelar</button>
                <button className={styles.primaryBtn} onClick={handleChangePassword} disabled={newPassword.length < 6 || savingPassword}>
                  {savingPassword ? <Loader2 size={14} className={styles.spinner} /> : <Save size={14} />} Guardar
                </button>
              </div>
              {passwordMsg && <span className={passwordMsg.type === 'success' ? styles.success : styles.error}>{passwordMsg.text}</span>}
            </div>
          )}
        </div>

        {/* ── Zona peligrosa: desactivar ── */}
        <div className={styles.section}>
          <h3><AlertTriangle size={16} style={{ color: 'var(--color-danger)' }} /> Zona peligrosa</h3>
          <p className={styles.dangerNote}>
            Desactivar oculta el comercio del mapa y detiene pagos. No se borra nada: tu billetera y datos quedan intactos y puedes reactivarlo.
            Requiere contraseña del comercio <strong>y</strong> tu PIN de cuenta.
          </p>
          {!deleting ? (
            <button className={styles.dangerBtn} onClick={() => { setDeleting(true); setDelStep('pass'); setDelError(''); }}>
              <Trash2 size={16} /> Desactivar comercio
            </button>
          ) : (
            <div className={styles.verifyStep}>
              {delStep === 'pass' && (
                <>
                  <h4>Paso 1/2 · Contraseña del comercio</h4>
                  <div className={styles.passwordField}>
                    <input
                      type={showPass ? 'text' : 'password'}
                      placeholder="Contraseña del comercio"
                      value={delPass}
                      onChange={e => setDelPass(e.target.value)}
                      autoFocus
                    />
                    <button className={styles.togglePassword} onClick={() => setShowPass(!showPass)}>
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </>
              )}
              {delStep === 'pin' && (
                <>
                  <h4>Paso 2/2 · PIN de tu cuenta</h4>
                  <p className={styles.verifyText}>Por seguridad, confirma con el PIN de tu cuenta de Shekael.</p>
                  <div className={styles.passwordField}>
                    <input
                      type={showPin ? 'text' : 'password'}
                      placeholder="PIN de tu cuenta"
                      value={delPin}
                      onChange={e => setDelPin(e.target.value)}
                      inputMode="numeric"
                      autoFocus
                    />
                    <button className={styles.togglePassword} onClick={() => setShowPin(!showPin)}>
                      {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </>
              )}
              {delStep === 'confirm' && (
                <>
                  <h4>¿Desactivar "{biz.name}"?</h4>
                  <p className={styles.verifyText}>El comercio dejará de ser visible y no podrá recibir pagos. Podrás reactivarlo después con la contraseña del comercio.</p>
                </>
              )}
              {delError && <span className={styles.error}>{delError}</span>}
              <div className={styles.verifyActions}>
                <button className={styles.secondaryBtn} onClick={() => { setDeleting(false); setDelPass(''); setDelPin(''); setDelError(''); }}>
                  Cancelar
                </button>
                {delStep === 'pass' && (
                  <button className={styles.primaryBtn} onClick={handleDeactivateStart} disabled={!delPass || verifying}>
                    {verifying ? <Loader2 size={16} className={styles.spinner} /> : null} Continuar
                  </button>
                )}
                {delStep === 'pin' && (
                  <button className={styles.primaryBtn} onClick={handleDeactivatePin} disabled={!delPin || verifying}>
                    {verifying ? <Loader2 size={16} className={styles.spinner} /> : null} Verificar
                  </button>
                )}
                {delStep === 'confirm' && (
                  <button className={styles.deleteBtn} onClick={handleConfirmDeactivate} disabled={verifying}>
                    {verifying ? <Loader2 size={16} className={styles.spinner} /> : <Trash2 size={16} />} Sí, desactivar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
