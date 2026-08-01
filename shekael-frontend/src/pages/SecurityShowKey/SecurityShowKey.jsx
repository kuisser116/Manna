import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, Download, AlertTriangle, CheckCircle } from 'lucide-react';
import useStore from '../../store';
import logoImg from '../../assets/personaje_1.12.png';
import styles from './SecurityShowKey.module.css';

export default function SecurityShowKey() {
  const navigate = useNavigate();
  const { token, user } = useStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [verified, setVerified] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  const API_URL = import.meta.env.VITE_API_URL || location.origin;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard support — MISMO que LockScreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (processing) return;
      const digit = e.code?.startsWith('Digit') ? e.code.slice(-1)
        : e.code?.startsWith('Numpad') ? e.code.slice(-1)
        : null;
      if (digit !== null && digit >= '0' && digit <= '9') {
        e.preventDefault();
        handleDigit(digit);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleDelete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processing, pin]);

  function computePinHash(p) {
    let hash = 0;
    for (let i = 0; i < p.length; i++) {
      hash = ((hash << 5) - hash) + p.charCodeAt(i);
      hash |= 0;
    }
    return 'pin_' + hash;
  }

  const handleDigit = (d) => {
    if (processing || verified) return;
    setError('');
    const newPin = pin + d;
    if (newPin.length <= 6) {
      setPin(newPin);
      if (newPin.length === 6) {
        setTimeout(() => verifyAndShow(newPin), 100);
      }
    }
  };

  const handleDelete = () => {
    if (verified) return;
    setPin(p => p.slice(0, -1));
    setError('');
  };

  const verifyAndShow = async (enteredPin) => {
    const pinHash = computePinHash(enteredPin);
    setProcessing(true);
    try {
      const res = await fetch(`${API_URL}/users/backup-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ pin: enteredPin })
      });
      const data = await res.json();
      if (res.ok) {
        setSecretKey(data.secretKey);
        setPublicKey(data.publicKey);
        setVerified(true);
      } else {
        setError(data.message || 'PIN incorrecto');
        setPin('');
      }
    } catch {
      setError('Error de conexión');
      setPin('');
    } finally {
      setProcessing(false);
      inputRef.current?.focus();
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

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <img src={logoImg} alt="Shekael" className={styles.logo} />

        {!verified ? (
          <>
            <h2 className={styles.title}>Verificar identidad</h2>
            <p className={styles.subtitle}>Ingresa tu PIN para mostrar tu clave de recuperación</p>

            <div className={styles.pinDisplay}>
              {pin.split('').map((_, i) => (
                <div key={i} className={styles.pinDot} />
              ))}
              {Array.from({ length: 6 - pin.length }).map((_, i) => (
                <div key={`e${i}`} className={styles.pinDotEmpty} />
              ))}
            </div>

            {processing && <p className={styles.processing}>Verificando...</p>}
            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.keypad}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button key={n} className={styles.key} onClick={() => handleDigit(String(n))}>
                  {n}
                </button>
              ))}
              <div className={styles.key} />
              <button className={styles.key} onClick={() => handleDigit('0')}>0</button>
              <button className={styles.keyDelete} onClick={handleDelete}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                  <line x1="18" y1="9" x2="12" y2="15"/>
                  <line x1="12" y1="9" x2="18" y2="15"/>
                </svg>
              </button>
            </div>

            <span className={styles.cancelLink} onClick={() => navigate(-1)}>
              Cancelar
            </span>
          </>
        ) : (
          <>
            <h2 className={styles.title} style={{ color: 'var(--color-danger)' }}>Clave de Recuperación</h2>
            <p className={styles.subtitle}>Escribe esto en papel físico. NO en fotos.</p>

            <div className={styles.secretBox}>
              <code className={styles.secretKey}>{secretKey}</code>
              <button className={styles.iconBtn} onClick={copyToClipboard} title="Copiar">
                {copied ? <CheckCircle size={18} /> : <Key size={18} />}
              </button>
            </div>

            {copied && <p className={styles.successMsg}>Copiado al portapapeles</p>}

            <div className={styles.actionsRow}>
              <button className={styles.downloadBtn} onClick={downloadBackup}>
                <Download size={14} /> Descargar respaldo
              </button>
              <button className={styles.secondaryBtn} onClick={() => navigate('/settings')}>
                Cerrar
              </button>
            </div>

            <div className={styles.warningBox}>
              <AlertTriangle size={14} />
              <span>NO compartas esta clave. Cualquiera con acceso puede mover tu dinero.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
