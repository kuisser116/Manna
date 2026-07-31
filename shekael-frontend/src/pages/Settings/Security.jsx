import React, { useState, useRef } from 'react';
import { Key, Eye, EyeOff, Download, AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import useStore from '../../store';
import styles from './Security.module.css';

export default function Security() {
    const { token, user } = useStore();
    const [step, setStep] = useState(0); // 0=info, 1=pin, 2=showing
    const [pin, setPin] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const qrRef = useRef();

    const API_URL = import.meta.env.VITE_API_URL || location.origin;

    const verifyAndShow = async () => {
        if (pin.length < 4) { setError('PIN de 4 dígitos requerido'); return; }
        setLoading(true); setError('');
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
                setStep(2);
            } else {
                setError(data.message || 'PIN incorrecto');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally { setLoading(false); }
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
${user?.stellarPublicKey || ''}

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
                    <h2>Clave de Respaldo</h2>
                    <p>Esta es la clave que controla tu dinero. Si pierdes tu teléfono o olvidas tu PIN, esta clave es la única forma de recuperar tu wallet.</p>
                    <div className={styles.warnings}>
                        <div className={styles.warn}><AlertTriangle size={16} /> Guárdala en papel, no en fotos</div>
                        <div className={styles.warn}><AlertTriangle size={16} /> No la guardes en la nube</div>
                        <div className={styles.warn}><AlertTriangle size={16} /> Shekael NO puede recuperarla</div>
                    </div>
                    <button className={styles.primaryBtn} onClick={() => setStep(1)}>
                        <Shield size={16} /> Ver mi clave de respaldo
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
                    <p>Para mostrar tu clave privada, confirma tu PIN de seguridad.</p>
                    <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="PIN (4-6 dígitos)"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className={styles.pinInput}
                        autoFocus
                    />
                    {error && <div className={styles.error}>{error}</div>}
                    <div className={styles.actions}>
                        <button className={styles.secondaryBtn} onClick={() => setStep(0)}>Cancelar</button>
                        <button className={styles.primaryBtn} onClick={verifyAndShow} disabled={loading || pin.length < 4}>
                            {loading ? 'Verificando...' : 'Continuar'}
                        </button>
                    </div>
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
                        {copied ? <CheckCircle size={18} /> : <Eye size={18} />}
                    </button>
                </div>

                {copied && <div className={styles.success}>Copiado al portapapeles</div>}

                <div className={styles.actionsRow}>
                    <button className={styles.downloadBtn} onClick={generatePDF}>
                        <Download size={14} /> Descargar respaldo
                    </button>
                    <button className={styles.secondaryBtn} onClick={() => { setStep(0); setPin(''); setSecretKey(''); }}>
                        Cerrar
                    </button>
                </div>

                <div className={styles.footerNote}>
                    Dirección pública para recibir: <code>{user?.stellarPublicKey}</code>
                </div>
            </div>
        </div>
    );
}
