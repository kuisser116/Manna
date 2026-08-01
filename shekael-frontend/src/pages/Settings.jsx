import { useState, useEffect } from 'react';
import { ChevronLeft, Shield, Brain, MapPin, Eye, DollarSign, Key, ChevronRight, Laptop, Church, Dumbbell, Palette, Music, UtensilsCrossed, Plane, Shirt, Gamepad2, GraduationCap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styles from './Settings.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const INTEREST_CATEGORIES = [
    { value: 'tech', label: 'Tecnología', Icon: Laptop },
    { value: 'faith', label: 'Fe / Espiritualidad', Icon: Church },
    { value: 'sports', label: 'Deportes', Icon: Dumbbell },
    { value: 'art', label: 'Arte', Icon: Palette },
    { value: 'music', label: 'Música', Icon: Music },
    { value: 'food', label: 'Comida', Icon: UtensilsCrossed },
    { value: 'travel', label: 'Viajes', Icon: Plane },
    { value: 'fashion', label: 'Moda', Icon: Shirt },
    { value: 'gaming', label: 'Gaming', Icon: Gamepad2 },
    { value: 'education', label: 'Educación', Icon: GraduationCap },
];

export default function Settings() {
    const navigate = useNavigate();
    const [token] = useState(() => localStorage.getItem('Shekael_token'));
    const [hasConsent, setHasConsent] = useState(false);
    const [interests, setInterests] = useState([]);
    const [ageRange, setAgeRange] = useState('');
    const [region, setRegion] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        loadProfile();
    }, []);

    async function loadProfile() {
        try {
            const res = await fetch(`${API_URL}/consent/profile`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setHasConsent(data.hasConsent);
                setInterests(data.interests || []);
                setAgeRange(data.ageRange || '');
                setRegion(data.region || '');
            }
        } catch { /* el perfil puede fallar si no hay registro aún */ }
    }

    async function toggleConsent(enabled) {
        setSaving(true);
        setMessage(null);
        try {
            if (enabled) {
                const res = await fetch(`${API_URL}/consent/record`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ interests, ageRange: ageRange || null, region: region || null })
                });
                const data = await res.json();
                if (data.success) {
                    setHasConsent(true);
                    setMessage({ type: 'success', text: 'Personalización activada. Tus intereses se actualizarán automáticamente.' });
                }
            } else {
                const res = await fetch(`${API_URL}/consent/revoke`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success) {
                    setHasConsent(false);
                    setMessage({ type: 'info', text: 'Personalización desactivada. Verás anuncios genéricos.' });
                }
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Error al guardar: ' + err.message });
        }
        setSaving(false);
    }

    function toggleInterest(val) {
        setInterests(prev =>
            prev.includes(val) ? prev.filter(i => i !== val) : [...prev, val]
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <button className={styles.backBtn} onClick={() => navigate(-1)}>
                    <ChevronLeft size={20} />
                </button>
                <h1>Configuración</h1>
            </div>

            <div className={styles.content}>
                {/* ─── Personalización de anuncios ─── */}
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Brain size={18} />
                        <h2>Personalización de anuncios</h2>
                    </div>

                    <div className={styles.toggleRow}>
                        <div className={styles.toggleInfo}>
                            <strong>Anuncios personalizados</strong>
                            <p>Shekael analizará tu actividad para mostrarte anuncios más relevantes. Tú ganas más porque los anunciantes pagan más por segmentación.</p>
                        </div>
                        <label className={styles.switch}>
                            <input
                                type="checkbox"
                                checked={hasConsent}
                                onChange={(e) => toggleConsent(e.target.checked)}
                                disabled={saving}
                            />
                            <span className={styles.slider}></span>
                        </label>
                    </div>

                    {message && (
                        <div className={`${styles.message} ${styles[message.type]}`}>
                            {message.text}
                        </div>
                    )}
                </section>

                {/* ─── Tus intereses detectados ─── */}
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Eye size={18} />
                        <h2>Tus intereses</h2>
                        <span className={styles.badge}>Personalizables</span>
                    </div>
                    <p className={styles.sectionDesc}>
                        Basado en tu actividad en Shekael. Si activas la personalización, estos intereses se usan para mostrarte anuncios relevantes.
                    </p>
                    <div className={styles.interestsGrid}>
                        {INTEREST_CATEGORIES.map(cat => {
                            const IconComponent = cat.Icon;
                            return (
                                <button
                                    key={cat.value}
                                    className={`${styles.interestChip} ${interests.includes(cat.value) ? styles.interestActive : ''}`}
                                    onClick={() => hasConsent && toggleInterest(cat.value)}
                                    disabled={!hasConsent}
                                >
                                    <IconComponent size={14} />
                                    {cat.label}
                                </button>
                            );
                        })}
                    </div>
                    {hasConsent && (
                        <p className={styles.chipHint}>Puedes editar manualmente tus intereses haciendo clic en ellos</p>
                    )}
                </section>

                {/* ─── Ubicación ─── */}
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <MapPin size={18} />
                        <h2>Ubicación</h2>
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Estado / Región</label>
                        <input
                            type="text"
                            placeholder="Ej: CDMX, EdoMex..."
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                            className={styles.input}
                            disabled={!hasConsent}
                        />
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Rango de edad</label>
                        <select
                            value={ageRange}
                            onChange={(e) => setAgeRange(e.target.value)}
                            className={styles.select}
                            disabled={!hasConsent}
                        >
                            <option value="">Prefiero no decirlo</option>
                            <option value="13-17">13 - 17</option>
                            <option value="18-24">18 - 24</option>
                            <option value="25-34">25 - 34</option>
                            <option value="35-44">35 - 44</option>
                            <option value="45-54">45 - 54</option>
                            <option value="55+">55+</option>
                        </select>
                    </div>
                </section>

                {/* ─── Recuperación de Cuenta ─── */}
                <section className={styles.section} style={{ cursor: 'pointer' }} onClick={() => navigate('/security-tutorial')}>
                    <div className={styles.sectionHeader}>
                        <Key size={18} />
                        <h2>Recuperación de Cuenta</h2>
                        <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--color-text-muted)' }} />
                    </div>
                    <p className={styles.sectionDesc}>
                        Configura cómo recuperar tu cuenta si olvidas tu PIN o pierdes tu teléfono.
                    </p>
                </section>

                {/* ─── Privacidad ─── */}
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <Shield size={18} />
                        <h2>Privacidad</h2>
                    </div>
                    <p className={styles.sectionDesc}>
                        Shekael no vende tus datos personales. La personalización de anuncios es 
                        completamente opcional. Tus intereses se detectan automáticamente de tu 
                        actividad en la plataforma y nunca se comparten con terceros.
                    </p>

                    <div className={styles.infoCards}>
                        <div className={styles.infoCard}>
                            <DollarSign size={16} />
                            <div>
                                <strong>Más ganancias</strong>
                                <p>Los anuncios personalizados pagan más CPM, lo que significa más MXNe para ti.</p>
                            </div>
                        </div>
                        <div className={styles.infoCard}>
                            <Shield size={16} />
                            <div>
                                <strong>Tú controlas</strong>
                                <p>Puedes activar o desactivar en cualquier momento. Tus datos son tuyos.</p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
