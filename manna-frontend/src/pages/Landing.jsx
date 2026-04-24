import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Sun, Moon, Sparkles, ShieldCheck, Compass } from 'lucide-react';
import useAuth from '../hooks/useAuth';
import FeedbackModal from '../components/FeedbackModal/FeedbackModal';
import useFeedbackModal from '../components/FeedbackModal/useFeedbackModal';
import styles from '../styles/pages/Landing.module.css';
import logoImg from '../assets/personaje_1.12.png';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';

const PRINCIPLES = [
    {
        icon: <Sparkles size={18} />,
        label: 'Contenido que sí suma',
        text: 'Priorizamos piezas que inspiran, enseñan o hacen reír sin destruir el foco ni la paz mental.'
    },
    {
        icon: <ShieldCheck size={18} />,
        label: 'Libertad de expresión real',
        text: 'Aquí no premiamos el miedo. Hay reglas claras contra lo dañino, sin censura arbitraria a las ideas.'
    },
    {
        icon: <Compass size={18} />,
        label: 'Comunidad antes que algoritmo',
        text: 'Diseñamos para personas y familias que quieren crecer juntas, no para métricas vacías.'
    }
];

function LandingInner() {
    const navigate = useNavigate();
    const { loginWithGoogle } = useAuth();
    const { modalState, showLoading, showSuccess, showError, hideModal } = useFeedbackModal();
    const [theme, setTheme] = useState('dark');
    const [termsAccepted, setTermsAccepted] = useState(false);
    const { scrollYProgress } = useScroll();
    const smoothProgress = useSpring(scrollYProgress, { stiffness: 70, damping: 20, mass: 0.2 });

    const patternY = useTransform(smoothProgress, [0, 1], [0, -180]);
    const glowY = useTransform(smoothProgress, [0, 1], [0, 260]);
    const heroScale = useTransform(smoothProgress, [0, 0.2], [1, 0.985]);
    const dividerScale = useTransform(smoothProgress, [0, 0.25], [0.25, 1]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const handleGoogleSuccess = async (credentialResponse) => {
        showLoading('Entrando a Ehise...', 'Autenticando con Google ✨');
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
        <div id="top" className={styles.page} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
            {/* Theme Toggle Button */}
            <button
                className={styles.themeToggle}
                onClick={toggleTheme}
                aria-label="Toggle theme"
            >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <motion.div className={styles.patternLayer} style={{ y: patternY }} />
            <motion.div className={styles.bgGlow} style={{ y: glowY }} />

            <section className={styles.heroSection}>
                <motion.div
                    className={styles.container}
                    style={{ scale: heroScale }}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                >
                    <div className={styles.heroCover}>
                        <div className={styles.heroCopy}>
                            <div className={styles.logoMark}>
                                <img src={logoImg} alt="Ehise Logo" className={styles.logoImg} />
                                <div className={styles.logoText}>
                                    <span className={styles.logoName}>Ehise</span>
                                    <p className={styles.logoTagline}>Porqué la luz no debería estar escondida</p>
                                </div>
                            </div>

                            <span className={styles.heroKicker}>Comunidad · Familia · México</span>

                            <h1 className={styles.heroHeadline}>
                                Una red para volver a
                                <span className={styles.accent}> crear</span>,
                                <span className={styles.accentSecondary}> compartir</span>
                                y <span className={styles.accent}> pertenecer.</span>
                            </h1>

                            <p className={styles.heroDesc}>
                                Ehise nace como un espacio con alma: menos ruido, más valor, más libertad y más cercanía.
                                Una red social pensada para que el contenido vuelva a sentirse humano.
                            </p>

                            <div className={styles.heroTapes}>
                                <span>Contenido con sentido</span>
                                <span>Libertad responsable</span>
                                <span>Comunidad real</span>
                            </div>
                        </div>

                        <motion.div
                            className={styles.heroPoster}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.08, duration: 0.6, ease: 'easeOut' }}
                        >
                            <div className={styles.posterTopline}>
                                <span>Red social mexicana</span>
                                <span>Familia primero</span>
                            </div>

                            <div className={styles.posterWordmark}>EHISE</div>

                            <div className={styles.posterManifesto}>
                                <p>Conectamos personas que quieren algo más que entretenimiento vacío.</p>
                                <p>Construimos un espacio donde la libertad convive con el respeto.</p>
                            </div>

                            <div className={styles.authPanel}>
                                <div className={styles.authHeader}>
                                    <h2 className={styles.authTitle}>Entrar</h2>
                                    <p className={styles.authDesc}>Usa Google para comenzar.</p>
                                </div>

                                <div className={`${styles.googleBtnWrap} ${!termsAccepted ? styles.disabledBtn : ''}`}>
                                    <GoogleLogin
                                        onSuccess={handleGoogleSuccess}
                                        onError={() => showError('Error', 'No se pudo conectar con Google')}
                                        shape="pill"
                                        theme="outline"
                                        text="continue_with"
                                        width={320}
                                    />
                                    {!termsAccepted && <div className={styles.btnBlocker} />}
                                </div>

                                <div className={styles.termsContainer}>
                                    <label className={styles.termsLabel}>
                                        <input
                                            type="checkbox"
                                            className={styles.termsCheckbox}
                                            checked={termsAccepted}
                                            onChange={(e) => setTermsAccepted(e.target.checked)}
                                        />
                                        <span className={styles.termsText}>
                                            Acepto los <Link to="/terminos" target="_blank" className={styles.termsLink}>Términos de Servicio</Link>.
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </motion.div>

                <motion.div className={styles.heroDivider} style={{ scaleX: dividerScale }}>
                    <span>Desliza para conocer más</span>
                </motion.div>
            </section>

            <main className={styles.longScrollContent}>
                <motion.section
                    className={`${styles.narrativeBand} ${styles.bandLight}`}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    viewport={{ once: true, amount: 0.28 }}
                >
                    <div className={styles.bandHeader}>
                        <span className={styles.bandEyebrow}>¿Qué es Ehise?</span>
                        <h3 className={styles.bandTitle}>Una red social para volver a respirar</h3>
                        <p className={styles.bandText}>
                            En Ehise queremos que entrar a una red te deje algo bueno: claridad, ideas y conexión humana.
                            No se trata de retenerte a toda costa, se trata de construir una comunidad que te impulse.
                        </p>
                    </div>

                    <p className={styles.bandQuote}>
                        “Menos ruido. Más verdad. Más familia.”
                    </p>
                </motion.section>

                <motion.section
                    className={`${styles.narrativeBand} ${styles.bandRed}`}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.62, ease: 'easeOut' }}
                    viewport={{ once: true, amount: 0.28 }}
                >
                    <div className={styles.bandHeader}>
                        <span className={styles.bandEyebrow}>Nuestra diferencia</span>
                        <h3 className={styles.bandTitle}>Aquí la libertad no es un eslogan</h3>
                        <p className={styles.bandText}>
                            Venimos de plataformas donde una idea incómoda se castiga y lo superficial se premia.
                            En Ehise apostamos por la libertad de expresión responsable y por contenido que haga crecer,
                            no por tendencias vacías que desgastan.
                        </p>
                    </div>
                </motion.section>

                <motion.section
                    className={`${styles.narrativeBand} ${styles.bandDark}`}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.62, ease: 'easeOut' }}
                    viewport={{ once: true, amount: 0.28 }}
                >
                    <div className={styles.bandHeader}>
                        <span className={styles.bandEyebrow}>Comunidad</span>
                        <h3 className={styles.bandTitle}>Creadores y audiencia del mismo lado</h3>
                        <p className={styles.bandText}>
                            Diseñamos la experiencia para que personas y familias puedan compartir contenido con intención,
                            apoyarse y crecer juntas. Una red más humana, más cercana y más nuestra.
                        </p>
                    </div>
                </motion.section>

                <motion.section
                    className={styles.principlesSection}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.62, ease: 'easeOut' }}
                    viewport={{ once: true, amount: 0.28 }}
                >
                    <h3 className={styles.sectionTitle}>Nuestros principios</h3>
                    <div className={styles.principlesList}>
                        {PRINCIPLES.map((item) => (
                            <article key={item.label} className={styles.principleRow}>
                                <div className={styles.principleLabel}>
                                    {item.icon}
                                    <strong>{item.label}</strong>
                                </div>
                                <p className={styles.principleText}>{item.text}</p>
                            </article>
                        ))}
                    </div>
                </motion.section>

                <motion.section
                    className={styles.closingSection}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.62, ease: 'easeOut' }}
                    viewport={{ once: true, amount: 0.3 }}
                >
                    <h3>Una red hecha para construir, no para confundir</h3>
                    <p>Si buscas un espacio con más propósito, más libertad y más comunidad, este es tu lugar.</p>
                    <a href="#top" className={styles.backToTop}>Volver arriba</a>
                </motion.section>
            </main>

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
