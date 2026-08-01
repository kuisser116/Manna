import React, { useState } from 'react';
import { Key, Download, AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import useStore from '../../store';
import PinKeypad, { pinHash } from '../../components/PinKeypad/PinKeypad';
import styles from './Security.module.css';

export default function Security() {
    const { token, user } = useStore();
    const [step, setStep] = useState(0); // 0=info, 1=pin, 2=showing
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
            // El backend espera el PIN en texto plano, el hash lo compara del lado del servidor
            // PERO el backend ahora usa el mismo algoritmo que el frontend
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
                setStep(2);
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

    const generatePDF = () => {
        const text = `=== CLAVE DE RESPALDO SHEKAEL ===
Fecha: ${new Date().toLocaleDateString()}
Usuario: ${user?.display_name || ''}
Email: ${user?.email || ''}

DIRECCIÓN PÚBLICA (para recibir):
${publicKey}

CLAVE PRIVADA (para enviar / recuperar):
${secretKey}

⚠️  GUARDA ESTO EN PAPEL. NO EN FOTOS. NO EN NUBE.
Si pierdes tu teléfono y no tienes esta clave, NADIE puede recuperar tu dinero.
Shekael NO puede ayudarte a recuperarla.

=== FIN ===`;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shekael-backup-${user?.email?.split('@')[0] || 'wallet'}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (step === 0) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <Key size={32} className={styles.icon} />
                    <h2>Recuperación de Cuenta</h2>
                    <p>Esta es la clave que controla tu dinero. Si pierdes tu teléfono o olvidas tu PIN, esta clave es la única forma de recuperar tu wallet.</p>
                    <div className={styles.warnings}>
                        <div className={styles.warn}><AlertTriangle size={16} /> Guárdala en papel, no en fotos</div>
                        <div className={styles.warn}><AlertTriangle size={16} /> No la guardes en la nube</div>
                        <div className={styles.warn}><AlertTriangle size={16} /> Shekael NO puede recuperarla</div>
                    </div>
                    <button className={styles.primaryBtn} onClick={() => setStep(1)}>
                        <Shield size={16} /> Ver mi clave de recuperación
                    </button>
                </div>
            </div>
        );
    }

    if (step === 1) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <Shield size={28} className={styles.icon} />
                    <h2>Verificación de identidad</h2>
                    <p>Ingresa tu PIN de seguridad para mostrar tu clave privada.</p>
                    {error && <div className={styles.error}>{error}</div>}
                    <PinKeypad
                        mode="enter"
                        onComplete={verifyPin}
                        onCancel={() => setStep(0)}
                        error={error}
                        loading={loading}
                        title="Ingresa tu PIN"
                        subtitle="Para mostrar tu clave de respaldo"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <AlertTriangle size={32} className={styles.dangerIcon} />
                <h2 style={{ color: 'var(--color-danger)' }}>Clave Privada</h2>
                <p style={{ fontSize: '0.85rem', marginBottom: 16 }}>
                    Nunca compartas esto con nadie. Cualquiera con esta clave puede mover todo tu dinero.
                </p>

                <div className={styles.secretBox}>
                    <code className={styles.secretKey}>{secretKey}</code>
                    <button className={styles.iconBtn} onClick={copyToClipboard} title="Copiar">
                        {copied ? <CheckCircle size={18} /> : <Key size={18} />}
                    </button>
                </div>

                {copied && <div className={styles.success}>Copiado al portapapeles</div>}

                <div className={styles.actionsRow}>
                    <button className={styles.downloadBtn} onClick={generatePDF}>
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
