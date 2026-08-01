import React, { useState } from 'react';
import { Shield, Key, AlertTriangle, CheckCircle, ChevronRight, ChevronLeft, Eye, Download, Smartphone, FileText } from 'lucide-react';
import useStore from '../../store';
import PinKeypad from '../../components/PinKeypad/PinKeypad';
import styles from './Security.module.css';

const TUTORIAL_STEPS = [
    {
        icon: Shield,
        title: 'Recuperación de Cuenta',
        description: 'Antes de mostrar tu clave, entiende cómo funciona la recuperación. Son 3 pasos simples.',
        highlight: null,
    },
    {
        icon: Key,
        title: 'Paso 1: Tu Clave Secreta',
        description: 'Tu cuenta tiene una clave secreta única (empieza con S...). Esta clave ES tu wallet. Sin ella, nadie puede recuperar tu dinero.',
        highlight: 'Ni siquiera Shekael puede recuperar tu cuenta si pierdes esta clave.',
    },
    {
        icon: Smartphone,
        title: 'Paso 2: Tu PIN de Seguridad',
        description: 'Tu PIN de 6 dígitos solo desbloquea la app. Si lo olvidas, necesitas tu clave secreta para crear uno nuevo.',
        highlight: 'El PIN protege la app. La clave secreta recupera la cuenta.',
    },
    {
        icon: FileText,
        title: 'Paso 3: Respaldo en Papel',
        description: 'Escribe tu clave secreta en papel físico. Guárdala en un lugar seguro. NO en fotos. NO en la nube.',
        highlight: 'Papel físico = único respaldo válido. Todo lo demás puede hackearse.',
    },
];

export default function Security() {
    const { token, user } = useStore();
    const [step, setStep] = useState('tutorial'); // tutorial | pin | showing
    const [tutorialStep, setTutorialStep] = useState(0);
    const [secretKey, setSecretKey] = useState('');
    const [publicKey, setPublicKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    const API_URL = import.meta.env.VITE_API_URL || location.origin;

    const verifyPin = async (pin) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_URL}/users/backup-key`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ pin })
            });
            const data = await res.json();
            if (res.ok) {
                setSecretKey(data.secretKey);
                setPublicKey(data.publicKey);
                setStep('showing');
            } else {
                setError(data.message || 'PIN incorrecto');
                throw new Error(data.message);
            }
        } catch (err) {
            setError(err.message || 'Error de conexión');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(secretKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    };

    const downloadBackup = () => {
        const text = `=== RECUPERACIÓN DE CUENTA SHEKAEL ===
Fecha: ${new Date().toLocaleDateString()}
Usuario: ${user?.display_name || ''}
Email: ${user?.email || ''}

DIRECCIÓN PÚBLICA (para recibir):
${publicKey}

CLAVE SECRETA (para enviar / recuperar cuenta):
${secretKey}

⚠️  INSTRUCCIONES DE RECUPERACIÓN:
1. Si olvidas tu PIN: usa esta clave en shekael.app/recovery
2. Si pierdes tu teléfono: instala Shekael e ingresa esta clave
3. NO compartas esta clave con NADIE

Shekael NO puede recuperar tu cuenta por ti.
Guarda este papel en un lugar seguro.

=== FIN ===`;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shekael-recuperacion-${user?.email?.split('@')[0] || 'cuenta'}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ─── TUTORIAL ───
    if (step === 'tutorial') {
        const tStep = TUTORIAL_STEPS[tutorialStep];
        const Icon = tStep.icon;
        const isLast = tutorialStep === TUTORIAL_STEPS.length - 1;

        return (
            <div className={styles.tutorialOverlay}>
                <div className={styles.tutorialModal}>
                    {/* Progress */}
                    <div className={styles.tutorialProgress}>
                        {TUTORIAL_STEPS.map((_, i) => (
                            <div key={i} className={`${styles.tutorialDot} ${i <= tutorialStep ? styles.tutorialDotActive : ''}`} />
                        ))}
                    </div>

                    <div className={styles.tutorialContent}>
                        <Icon size={48} className={styles.tutorialIcon} />
                        <h2>{tStep.title}</h2>
                        <p>{tStep.description}</p>
                        {tStep.highlight && (
                            <div className={styles.tutorialHighlight}>
                                <AlertTriangle size={16} />
                                <span>{tStep.highlight}</span>
                            </div>
                        )}
                    </div>

                    <div className={styles.tutorialActions}>
                        {tutorialStep > 0 && (
                            <button className={styles.tutorialSecondary} onClick={() => setTutorialStep(c => c - 1)}>
                                <ChevronLeft size={16} /> Anterior
                            </button>
                        )}
                        <button 
                            className={styles.tutorialPrimary} 
                            onClick={() => {
                                if (isLast) setStep('pin');
                                else setTutorialStep(c => c + 1);
                            }}
                        >
                            {isLast ? 'Ver mi clave' : 'Siguiente'} <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ─── PIN VERIFICATION ───
    if (step === 'pin') {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <Shield size={28} className={styles.icon} />
                    <h2>Verificación de identidad</h2>
                    <p>Ingresa tu PIN para mostrar tu clave de recuperación.</p>
                    {error && <div className={styles.error}>{error}</div>}
                    <PinKeypad
                        mode="enter"
                        onComplete={verifyPin}
                        onCancel={() => setStep('tutorial')}
                        error={error}
                        loading={loading}
                        title="Ingresa tu PIN"
                        subtitle="Para mostrar tu clave de recuperación"
                    />
                </div>
            </div>
        );
    }

    // ─── SHOWING SECRET KEY ───
    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <AlertTriangle size={32} className={styles.dangerIcon} />
                <h2 style={{ color: 'var(--color-danger)' }}>Clave de Recuperación</h2>
                <p style={{ fontSize: '0.85rem', marginBottom: 16 }}>
                    Con esta clave puedes recuperar tu cuenta si olvidas tu PIN o pierdes tu teléfono.
                </p>

                <div className={styles.secretBox}>
                    <code className={styles.secretKey}>{secretKey}</code>
                    <button className={styles.iconBtn} onClick={copyToClipboard} title="Copiar">
                        {copied ? <CheckCircle size={18} /> : <Key size={18} />}
                    </button>
                </div>

                {copied && <div className={styles.success}>Copiado al portapapeles</div>}

                <div className={styles.actionsRow}>
                    <button className={styles.downloadBtn} onClick={downloadBackup}>
                        <Download size={14} /> Descargar respaldo
                    </button>
                    <button className={styles.secondaryBtn} onClick={() => { setStep('tutorial'); setSecretKey(''); setPublicKey(''); }}>
                        Cerrar
                    </button>
                </div>

                <div className={styles.footerNote}>
                    Dirección pública para recibir: <code>{publicKey}</code>
                </div>

                <div className={styles.warningBox}>
                    <AlertTriangle size={14} />
                    <span>NO compartas esta clave. Cualquiera con acceso puede mover tu dinero.</span>
                </div>
            </div>
        </div>
    );
}
