import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import useAuth from '../hooks/useAuth';
import FeedbackModal from '../components/FeedbackModal/FeedbackModal';
import useFeedbackModal from '../components/FeedbackModal/useFeedbackModal';
import styles from '../styles/pages/Landing.module.css';
import logoImg from '../assets/personaje_1.12.png';

function LandingInner() {
    const navigate = useNavigate();
    const { loginWithGoogle } = useAuth();
    const { modalState, showLoading, showSuccess, showError, hideModal } = useFeedbackModal();
    const [theme, setTheme] = useState('dark');
    const [termsAccepted, setTermsAccepted] = useState(false);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const handleGoogleSuccess = async (credentialResponse) => {
        showLoading('Entrando a Aseria...', 'Autenticando con Google ✨');
        try {
            await loginWithGoogle(credentialResponse.credential);
            showSuccess('¡Ya estás dentro!', 'Bienvenido. Aquí sí hay algo real.', true);
            setTimeout(() => navigate('/feed'), 1000);
        } catch (err) {
            hideModal();
            showError('Error de Google', err.message);
        }
    };

    return (
        <div className={styles.page}>
            {/* Theme Toggle Button */}
            <button
                className={styles.themeToggle}
                onClick={toggleTheme}
                aria-label="Toggle theme"
            >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Glow de fondo */}
            <div className={styles.bgGlow} />

            <div className={styles.container}>
                {/* ── Hero izquierdo ── */}
                <motion.div
                    className={styles.hero}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                >
                    {/* Logo mark */}
                    <div className={styles.logoMark}>
                        <img src={logoImg} alt="Aseria Logo" className={styles.logoImg} />
                        <div className={styles.logoText}>
                            <span className={styles.logoName}>Aseria</span>
                            <p className={styles.logoTagline}>Porque la luz no deberia estar escondida</p>
                        </div>
                    </div>

                    {/* Headline */}
                    <h1 className={styles.heroHeadline}>
                        Comunicar no es impresionar {' '}
                        <span className={styles.accent}>es conectar.</span>
                    </h1>

                    <p className={styles.heroDesc}>
                        Contenido que no manipula, creadores que traen paz y descanso,
                        y una comunidad donde seriedad no significa aburrido.
                    </p>

                </motion.div>

                {/* ── Panel de auth ── */}
                <motion.div
                    className={styles.authPanel}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.12, ease: 'easeOut' }}
                >
                    {/* Botón de Auth */}
                    <div className={styles.authHeader}>
                        <h2 className={styles.authTitle}>Esto es para ti</h2>
                        <p className={styles.authDesc}>Entra en un clic con tu cuenta de Google.</p>
                    </div>

                    <div className={`${styles.googleBtnWrap} ${!termsAccepted ? styles.disabledBtn : ''}`}>
                        <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={() => showError('Error', 'No se pudo conectar con Google')}
                            shape="pill"
                            theme="outline"
                            text="continue_with"
                            width="100%"
                        />
                        {!termsAccepted && <div className={styles.btnBlocker} />}
                    </div>

                    {/* Contenedor de Términos (Clickwrap) */}
                    <div className={styles.termsContainer}>
                        <label className={styles.termsLabel}>
                            <input
                                type="checkbox"
                                className={styles.termsCheckbox}
                                checked={termsAccepted}
                                onChange={(e) => setTermsAccepted(e.target.checked)}
                            />
                            <span className={styles.termsText}>
                                He leído y acepto los <Link to="/terminos" target="_blank" className={styles.termsLink}>Términos de Servicio</Link>,
                                incluyendo la política de confiscación de depósito por comportamiento tóxico.
                            </span>
                        </label>
                    </div>
                </motion.div>
            </div>

            <FeedbackModal
                isOpen={modalState.isOpen}
                onClose={hideModal}
                type={modalState.type}
                title={modalState.title}
                message={modalState.message}
                showCloseButton={modalState.showCloseButton}
                autoClose={modalState.autoClose}
                autoCloseDelay={modalState.autoCloseDelay}
            />
        </div >
    );
}

export default function Landing() {
    return (
        <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
            <LandingInner />
        </GoogleOAuthProvider>
    );
}
