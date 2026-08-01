import React, { useState } from 'react';
import { Key, Download, AlertTriangle, CheckCircle } from 'lucide-react';
import useStore from '../../store';
import LockScreen from '../../components/LockScreen/LockScreen';
import styles from './Security.module.css';

export default function Security() {
    const { token, user, sessionLocked, recoveryKey, setRecoveryKey } = useStore();
    const [localKey, setLocalKey] = useState(null);
    const [copied, setCopied] = useState(false);

    const API_URL = import.meta.env.VITE_API_URL || location.origin;

    const secretKey = recoveryKey?.secretKey || localKey?.secretKey;
    const publicKey = recoveryKey?.publicKey || localKey?.publicKey;

    const handleVerified = async (secret, pub) => {
        setLocalKey({ secretKey: secret, publicKey: pub });
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

    // Si el AppLayout ya está mostrando el LockScreen (session lock activo),
    // NO montar otro — solo uno a la vez.
    if (sessionLocked && !secretKey) {
        return null;
    }

    // Sin clave verificada → mostrar el MISMO LockScreen de la app
    if (!secretKey) {
        return (
            <LockScreen
                mode="verify"
                onVerify={handleVerified}
            />
        );
    }

    // ─── VERIFICADO: mostrar clave ───
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
                    <button
                        className={styles.secondaryBtn}
                        onClick={() => {
                            setRecoveryKey(null);
                            setLocalKey(null);
                            window.history.back();
                        }}
                    >
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
