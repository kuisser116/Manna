import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ShieldCheck, Compass, Moon, Sun } from 'lucide-react';
import useAuth from '../hooks/useAuth';
import useStore from '../store';
import FeedbackModal from '../components/FeedbackModal/FeedbackModal';
import useFeedbackModal from '../components/FeedbackModal/useFeedbackModal';
import styles from '../styles/pages/Landing.module.css';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';

const PRINCIPLES = [
  { icon: <Sparkles size={16} />, label: 'Contenido que suma', text: 'Priorizamos piezas que inspiran, ensenan o hacen reir sin destruir el foco ni la paz mental.' },
  { icon: <ShieldCheck size={16} />, label: 'Libertad de expresion real', text: 'Aqui no premiamos el miedo. Hay reglas claras contra lo danino, sin censura arbitraria a las ideas.' },
  { icon: <Compass size={16} />, label: 'Comunidad antes que algoritmo', text: 'Disenamos para personas y familias que quieren crecer juntas, no para metricas vacias.' }
];

function LandingInner() {
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  const { modalState, showLoading, showSuccess, showError, hideModal } = useFeedbackModal();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const { isDarkMode, toggleDarkMode } = useStore();

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [isDarkMode]);

  const handleGoogleSuccess = async (credentialResponse) => {
    showLoading('Entrando a Shekael...', 'Autenticando con Google');
    try {
      const data = await loginWithGoogle(credentialResponse.credential);
      hideModal();
      showSuccess('Ya estas dentro!', 'Bienvenido. Aqui si hay algo real.', true);
      if (!data.user?.terms_accepted_at) {
        navigate('/terminos');
      } else {
        navigate('/feed');
      }
    } catch (err) {
      hideModal();
      showError('Error de Google', err.message);
    }
  };

  return (
    <div className={styles.page} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
      {/* ─── Theme Toggle ─── */}
      <button className={styles.themeToggle} onClick={toggleDarkMode} aria-label="Cambiar tema">
        {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* ─── HERO ─── */}
      <section className={styles.hero}>

        <div className={styles.heroInner}>
          <motion.div
            className={styles.heroContent}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <div className={styles.logoArea}>
              <span className={styles.logoWordmark}>Shekael</span>
              <span className={styles.logoTag}>Porque la luz no deberia estar escondida</span>
            </div>

            <h1 className={styles.headline}>
              Una red para<br />
              <span className={styles.hlAccent}>volver a</span>{' '}
              <span className={styles.hlAccentWord}>crear</span>,{' '}
              <span className={styles.hlAccentWord}>compartir</span>
              <br />y{' '}
              <span className={styles.hlAccentWord}>pertenecer</span>.
            </h1>

            <p className={styles.desc}>
              Un espacio con alma donde el contenido vuelve a sentirse humano.
              Menos ruido, mas valor, mas libertad y mas cercania.
            </p>

            <div className={styles.ctaBlock}>
              <div className={`${styles.googleWrap} ${!termsAccepted ? styles.googleDisabled : ''}`}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => showError('Error', 'No se pudo conectar con Google')}
                  shape="pill"
                  theme="outline"
                  text="continue_with"
                  width={320}
                />
                {!termsAccepted && <div className={styles.btnBlock} />}
              </div>

              <label className={styles.terms}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span>
                  Acepto los <Link to="/terminos" target="_blank" className={styles.termsLink}>Terminos de Servicio</Link>.
                </span>
              </label>
            </div>
          </motion.div>
        </div>

        <div className={styles.scrollHint}>
          <motion.span
            animate={{ y: [0, 3, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            Descubre mas
          </motion.span>
        </div>
      </section>

      {/* ─── SCROLL ─── */}
      <main className={styles.content}>
        <motion.section
          className={styles.band}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true, amount: 0.25 }}
        >
          <div className={styles.bandInner}>
            <span className={styles.bandEyebrow}>Que es Shekael?</span>
            <h2 className={styles.bandTitle}>Una red social para volver a respirar</h2>
            <p className={styles.bandText}>
              En Shekael queremos que entrar a una red te deje algo bueno:
              claridad, ideas y conexion humana.
            </p>
            <p className={styles.bandQuote}>Menos ruido. Mas verdad. Mas familia.</p>
          </div>
        </motion.section>

        <motion.section
          className={`${styles.band} ${styles.bandRed}`}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true, amount: 0.25 }}
        >
          <div className={styles.bandInner}>
            <span className={styles.bandEyebrow}>Nuestra diferencia</span>
            <h2 className={styles.bandTitle}>Aqui la libertad no es un eslogan</h2>
            <p className={styles.bandText}>
              Apostamos por la libertad de expresion responsable y por contenido que haga crecer.
            </p>
          </div>
        </motion.section>

        <motion.section
          className={`${styles.band} ${styles.bandGray}`}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true, amount: 0.25 }}
        >
          <div className={styles.bandInner}>
            <span className={styles.bandEyebrow}>Comunidad</span>
            <h2 className={styles.bandTitle}>Creadores y audiencia del mismo lado</h2>
            <p className={styles.bandText}>
              Una red mas humana, mas cercana y mas nuestra.
            </p>
          </div>
        </motion.section>

        <section className={styles.principles}>
          <div className={styles.bandInner}>
            <h2 className={styles.bandTitle}>Nuestros principios</h2>
            <div className={styles.principlesList}>
              {PRINCIPLES.map((item) => (
                <article key={item.label} className={styles.principleItem}>
                  <div className={styles.principleLabel}>
                    {item.icon} <strong>{item.label}</strong>
                  </div>
                  <p className={styles.principleText}>{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.closing}>
          <h2 className={styles.bandTitle}>Una red hecha para construir, no para confundir</h2>
          <p className={styles.closingText}>
            Si buscas un espacio con mas proposito, mas libertad y mas comunidad, este es tu lugar.
          </p>
          <a href="#top" className={styles.btnTop}>Volver arriba</a>
        </section>
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
    </div>
  );
}

export default function Landing() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <LandingInner />
    </GoogleOAuthProvider>
  );
}
