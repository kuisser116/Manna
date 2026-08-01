import React, { useState } from 'react';
import { Key, Download, AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import useStore from '../../store';
import PinKeypad from '../../components/PinKeypad/PinKeypad';
import styles from './Security.module.css';

export default function Security() {
    const { token, user } = useStore();
    const [step, setStep] = useState(0); // 0=pin, 1=showing
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
                setStep(1);
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

⚠️  INSTRUCCIONES:
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

    if (step === 0) {
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
                        onCancel={() => window.history.back()}
                        error={error}
                        loading={loading}
                        title="Ingresa tu PIN"
                        subtitle="Para mostrar tu clave de recuperación"
                    />
                </div>
            </div>
        );
    }

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
                    <button className={styles.secondaryBtn} onClick={() => { setStep(0); setSecretKey(''); setPublicKey(''); }}>
                        Cerrar
                    </button>
                </div>

                <div className={styles.footerNote}>
                    Dirección pública para recibir: <code>{publicKey}</code>
                </div>
            </div>
        </div>
    );
}
