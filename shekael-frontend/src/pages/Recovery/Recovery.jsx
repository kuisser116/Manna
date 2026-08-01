import React, { useState } from 'react';
import { ArrowLeft, Key, Shield, AlertTriangle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PinKeypad from '../../components/PinKeypad/PinKeypad';
import styles from './Recovery.module.css';

export default function Recovery() {
    const navigate = useNavigate();
    const [step, setStep] = useState(0); // 0=intro, 1=verify, 2=newpin, 3=success
    const [secretKey, setSecretKey] = useState('');
    const [email, setEmail] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [recoveryToken, setRecoveryToken] = useState('');
    const [userData, setUserData] = useState(null);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

    const verifyKey = async () => {
        if (!secretKey || !email) { setError('Ingresa tu clave privada y email'); return; }
        if (!secretKey.startsWith('S')) { setError('La clave privada Stellar empieza con S...'); return; }

        setLoading(true); setError('');
        try {
            const res = await fetch(`${API_URL}/recovery/verify-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secretKey, email })
            });
            const data = await res.json();
            if (res.ok) {
                setRecoveryToken(data.recoveryToken);
                setUserData(data.user);
                setStep(2);
            } else {
                setError(data.message || 'Verificación fallida');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally { setLoading(false); }
    };

    const resetPin = async (pin) => {
        setLoading(true); setError('');
        try {
            const res = await fetch(`${API_URL}/recovery/reset-pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recoveryToken, pin })
            });
            const data = await res.json();
            if (res.ok) {
                setStep(3);
            } else {
                setError(data.message || 'Error al cambiar PIN');
                throw new Error(data.message);
            }
        } catch (err) {
            setError(err.message || 'Error de conexión');
            throw err;
        } finally { setLoading(false); }
    };

    if (step === 0) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <button className={styles.backBtn} onClick={() => navigate('/login')}>
                        <ArrowLeft size={20} />
                    </button>
                    <Key size={40} className={styles.icon} />
                    <h1>Recuperar cuenta</h1>
                    <p>¿Olvidaste tu PIN? No puedes recuperarlo directamente, pero si guardaste tu <strong>clave de respaldo</strong> en papel, puedes verificar tu identidad y crear uno nuevo.</p>

                    <div className={styles.steps}>
                        <div className={styles.step}><b>1</b> Ingresa tu clave privada + email</div>
                        <div className={styles.step}><b>2</b> Verificamos que coincidan</div>
                        <div className={styles.step}><b>3</b> Creas un PIN nuevo</div>
                    </div>

                    <div className={styles.warnings}>
                        <div className={styles.warn}><AlertTriangle size={16} /> Necesitas tu clave de respaldo guardada en papel</div>
                        <div className={styles.warn}><AlertTriangle size={16} /> Si no la tienes, nadie puede recuperar tu cuenta</div>
                    </div>

                    <button className={styles.primaryBtn} onClick={() => setStep(1)}>
                        <Shield size={16} /> Continuar con recuperación
                    </button>
                </div>
            </div>
        );
    }

    if (step === 1) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <button className={styles.backBtn} onClick={() => setStep(0)}>
                        <ArrowLeft size={20} />
                    </button>
                    <h2>Verificar identidad</h2>
                    <p>Ingresa la clave privada que guardaste en papel y tu email registrado.</p>

                    <div className={styles.inputGroup}>
                        <label>Email registrado</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="tu@email.com"
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Clave privada (empieza con S...)</label>
                        <div className={styles.secretInputWrapper}>
                            <input
                                type={showKey ? 'text' : 'password'}
                                value={secretKey}
                                onChange={(e) => setSecretKey(e.target.value)}
                                placeholder="SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                                className={styles.input}
                            />
                            <button className={styles.eyeBtn} onClick={() => setShowKey(!showKey)}>
                                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {error && <div className={styles.error}>{error}</div>}

                    <button
                        className={styles.primaryBtn}
                        onClick={verifyKey}
                        disabled={loading || !email || !secretKey}
                    >
                        {loading ? 'Verificando...' : 'Verificar y continuar'}
                    </button>
                </div>
            </div>
        );
    }

    if (step === 2) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <h2>Crear PIN nuevo</h2>
                    <p>Cuenta verificada: <strong>{userData?.displayName || userData?.email}</strong></p>
                    <p style={{ fontSize: '0.85rem', marginBottom: 16 }}>
                        Ingresa un PIN de 6 dígitos. Este reemplazará tu PIN anterior.
                    </p>
                    {error && <div className={styles.error}>{error}</div>}
                    <PinKeypad
                        mode="create"
                        onComplete={resetPin}
                        onCancel={() => setStep(1)}
                        error={error}
                        loading={loading}
                        title="Nuevo PIN"
                        subtitle="6 dígitos numéricos"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <CheckCircle size={48} className={styles.successIcon} />
                <h2>¡PIN actualizado!</h2>
                <p>Tu PIN ha sido cambiado exitosamente. Ya puedes iniciar sesión con tu nuevo PIN.</p>
                <button className={styles.primaryBtn} onClick={() => navigate('/')}>
                    Ir al inicio
                </button>
            </div>
        </div>
    );
}
