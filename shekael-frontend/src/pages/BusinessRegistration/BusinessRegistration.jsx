import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, MapPin, Upload, Store, Lock, Eye } from 'lucide-react';
import styles from './BusinessRegistration.module.css';

const CATEGORIES = [
  'Comida y Bebida',
  'Tienda / Retail',
  'Servicios Profesionales',
  'Salud y Bienestar',
  'Arte y Cultura',
  'Taller Mecánico',
  'Educación',
  'Entretenimiento',
  'Hogar y Jardín',
  'Tecnología',
  'Moda y Accesorios',
  'Otro',
];

const STEPS = ['Datos', 'Apariencia', 'Ubicación', 'Seguridad', 'Resumen'];

export default function BusinessRegistration() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    avatar: null,
    banner: null,
    location: { lat: 19.4326, lng: -99.1332, address: '' },
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);
  const fileInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const validateStep = () => {
    const errs = {};
    if (step === 0) {
      if (!form.name.trim()) errs.name = 'Nombre del comercio requerido';
      if (!form.description.trim()) errs.description = 'Descripción requerida';
      if (!form.category) errs.category = 'Selecciona una categoría';
    }
    if (step === 3) {
      if (!form.password) errs.password = 'Contraseña requerida';
      if (form.password.length < 6) errs.password = 'Mínimo 6 caracteres';
      if (form.password !== form.confirmPassword) errs.confirmPassword = 'Las contraseñas no coinciden';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validateStep()) setStep(s => Math.min(s + 1, STEPS.length - 1)); };
  const prev = () => { setStep(s => Math.max(s - 1, 0)); setErrors({}); };

  const handleAvatar = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
    update('avatar', file);
  };

  const handleBanner = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBannerPreview(URL.createObjectURL(file));
    update('banner', file);
  };

  const handleSubmit = () => {
    const business = {
      id: 'biz_' + Date.now(),
      name: form.name,
      description: form.description,
      category: form.category,
      avatarUrl: avatarPreview,
      coverUrl: bannerPreview,
      location: form.location,
      createdAt: new Date().toISOString(),
      products: [],
      reviews: [],
      followers: 0,
    };
    navigate(`/business/${business.id}`);
  };

  const handleCancel = () => navigate(-1);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Registrar comercio</h2>
            <p className={styles.subtitle}>Crea tu perfil de negocio en Shekael</p>
          </div>
          <button className={styles.cancelBtn} onClick={handleCancel}>Cancelar</button>
        </div>

        {/* Steps indicator */}
        <div className={styles.stepsRow}>
          <div className={styles.steps}>
            {STEPS.map((s, i) => (
              <div key={s} className={`${styles.stepDot} ${i <= step ? styles.active : ''} ${i < step ? styles.done : ''}`}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
            ))}
          </div>
          <div className={styles.stepLabels}>
            {STEPS.map((s, i) => (
              <span key={s} className={`${styles.stepLabel} ${i === step ? styles.activeLabel : ''}`}>{s}</span>
            ))}
          </div>
        </div>

        <div className={styles.formBody}>
          {/* STEP 0: Datos */}
          {step === 0 && (
            <div className={styles.stepContent}>
              <div className={styles.field}>
                <label>Nombre del comercio</label>
                <input
                  type="text"
                  placeholder="Ej: Taquería El Pastor"
                  value={form.name}
                  onChange={e => update('name', e.target.value)}
                  className={errors.name ? styles.inputError : ''}
                  autoFocus
                />
                {errors.name && <span className={styles.error}>{errors.name}</span>}
              </div>
              <div className={styles.field}>
                <label>Descripción</label>
                <textarea
                  placeholder="¿Qué hace tu negocio?"
                  value={form.description}
                  onChange={e => update('description', e.target.value)}
                  rows={4}
                  className={errors.description ? styles.inputError : ''}
                />
                {errors.description && <span className={styles.error}>{errors.description}</span>}
              </div>
              <div className={styles.field}>
                <label>Categoría</label>
                <select value={form.category} onChange={e => update('category', e.target.value)} className={errors.category ? styles.inputError : ''}>
                  <option value="">Selecciona una categoría</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {errors.category && <span className={styles.error}>{errors.category}</span>}
              </div>
            </div>
          )}

          {/* STEP 1: Apariencia */}
          {step === 1 && (
            <div className={styles.stepContent}>
              <div className={styles.field}>
                <label>Foto de perfil</label>
                <div className={styles.uploadArea} onClick={() => fileInputRef.current?.click()}>
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Preview" className={styles.uploadPreview} />
                  ) : (
                    <div className={styles.uploadPlaceholder}><Upload size={28} /><span>Subir imagen</span></div>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatar} hidden />
              </div>
              <div className={styles.field}>
                <label>Portada / Banner</label>
                <div className={`${styles.uploadArea} ${styles.bannerUpload}`} onClick={() => bannerInputRef.current?.click()}>
                  {bannerPreview ? (
                    <img src={bannerPreview} alt="Banner preview" className={styles.uploadPreview} />
                  ) : (
                    <div className={styles.uploadPlaceholder}><Upload size={28} /><span>Subir banner</span></div>
                  )}
                </div>
                <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBanner} hidden />
              </div>
            </div>
          )}

          {/* STEP 2: Ubicación */}
          {step === 2 && (
            <div className={styles.stepContent}>
              <div className={styles.field}>
                <label><MapPin size={16} /> Dirección del negocio</label>
                <input
                  type="text"
                  placeholder="Calle, colonia, ciudad..."
                  value={form.location.address}
                  onChange={e => update('location', { ...form.location, address: e.target.value })}
                />
              </div>
              <div className={styles.mapPlaceholder}>
                <MapPin size={32} />
                <p>Selecciona la ubicación en el mapa</p>
                <p className={styles.mapHint}>(Integración con mapa aquí — Leaflet)</p>
                <div className={styles.coords}>
                  <span>Lat: {form.location.lat.toFixed(4)}</span>
                  <span>Lng: {form.location.lng.toFixed(4)}</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Seguridad */}
          {step === 3 && (
            <div className={styles.stepContent}>
              <div className={styles.securityInfo}>
                <Lock size={20} />
                <p>Esta contraseña se usará para proteger tu comercio. La necesitarás junto con tu PIN para eliminar el comercio.</p>
              </div>
              <div className={styles.field}>
                <label>Contraseña del comercio</label>
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={e => update('password', e.target.value)}
                  className={errors.password ? styles.inputError : ''}
                />
                {errors.password && <span className={styles.error}>{errors.password}</span>}
              </div>
              <div className={styles.field}>
                <label>Confirmar contraseña</label>
                <input
                  type="password"
                  placeholder="Repite la contraseña"
                  value={form.confirmPassword}
                  onChange={e => update('confirmPassword', e.target.value)}
                  className={errors.confirmPassword ? styles.inputError : ''}
                />
                {errors.confirmPassword && <span className={styles.error}>{errors.confirmPassword}</span>}
              </div>
            </div>
          )}

          {/* STEP 4: Resumen */}
          {step === 4 && (
            <div className={styles.stepContent}>
              <h3 className={styles.summaryTitle}><Eye size={18} /> Vista previa</h3>
              <div className={styles.summaryCard}>
                {avatarPreview && <img src={avatarPreview} alt="" className={styles.summaryAvatar} />}
                <div className={styles.summaryInfo}>
                  <strong>{form.name || 'Nombre del comercio'}</strong>
                  <span className={styles.summaryCategory}>{form.category || 'Categoría'}</span>
                  <p className={styles.summaryDesc}>{form.description?.slice(0, 100)}...</p>
                  <span className={styles.summaryLocation}><MapPin size={12} /> {form.location.address || 'Ubicación'}</span>
                </div>
              </div>
              <p className={styles.summaryNote}>Al crear tu comercio aceptas que la información sea visible para todos los usuarios de Shekael.</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className={styles.navButtons}>
          {step > 0 && (
            <button className={styles.navBtn} onClick={prev}><ChevronLeft size={18} /> Atrás</button>
          )}
          <div style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <button className={styles.navBtn} onClick={next}>Siguiente <ChevronRight size={18} /></button>
          ) : (
            <button className={`${styles.navBtn} ${styles.submitBtn}`} onClick={handleSubmit}>
              <Check size={18} /> Crear comercio
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
