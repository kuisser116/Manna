import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Palette } from 'lucide-react';
import useAuth from '../hooks/useAuth';
import useStore from '../store';
import FeedbackModal from '../components/FeedbackModal/FeedbackModal';
import useFeedbackModal from '../components/FeedbackModal/useFeedbackModal';
import styles from '../styles/pages/Landing.module.css';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';

gsap.registerPlugin(ScrollTrigger);

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

const FEATURES_NOW = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/>
        <path d="M8 10h8M8 14h5"/>
      </svg>
    ),
    title: 'Feed inteligente',
    desc: 'Contenido que suma, no que distrae. Publicaciones, imagenes, videos y encuestas en un solo lugar.',
    tag: 'ACTIVO'
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
    title: 'Chat cifrado',
    desc: 'Mensajes privados con cifrado de extremo a extremo. Audio, imagenes y mensajes que desaparecen.',
    tag: 'ACTIVO'
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
      </svg>
    ),
    title: 'Perfiles unicos',
    desc: 'Tu identidad, tu espacio. Personaliza tu perfil, muestra tu contenido y conecta con tu comunidad.',
    tag: 'ACTIVO'
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
      </svg>
    ),
    title: 'Crea y comparte',
    desc: 'Sube fotos, videos, audio. Organiza encuestas, escribe textos. Tu contenido, tus reglas.',
    tag: 'ACTIVO'
  }
];

const ECONOMY_STEPS = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    title: 'Gana MXNe',
    desc: 'Crea contenido, completa misiones y participa en la comunidad para ganar tokens MXNe.'
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2l3 7h7l-5.5 4 2 7L12 16.5 5.5 20l2-7L2 9h7z"/>
      </svg>
    ),
    title: 'Apoya creadores',
    desc: 'Usa MXNe para apoyar a los creadores que mas te gustan. Tu apoyo llega directo, sin intermediarios.'
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>
    ),
    title: 'Paga con QR',
    desc: 'En comercios afiliados, paga con MXNe via QR y obtén hasta 5% de descuento.'
  }
];

const FUTURE_FEATURES = [
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a1 1 0 00-.8-.4H5.24a2 2 0 00-1.8 1.1l-.8 1.63A6 6 0 006 18h.5"/>
        <circle cx="4.5" cy="19.5" r="1.5"/><circle cx="15.5" cy="19.5" r="1.5"/>
      </svg>
    ),
    title: 'Conductores',
    desc: 'Solicita o brinda transporte seguro dentro de tu comunidad. Viajes con personas de confianza, no extraños.',
    note: 'PROXIMAMENTE'
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"/>
        <path d="M7 9V5c0-1.1.9-2 2-2h6a2 2 0 012 2v4"/>
        <circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>
      </svg>
    ),
    title: 'Repartidores',
    desc: 'Envia y recibe paquetes, comida y productos entre usuarios de la comunidad. Rapido, local y confiable.',
    note: 'PROXIMAMENTE'
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2l3 7h7l-5.5 4 2 7L12 16.5 5.5 20l2-7L2 9h7z"/>
        <path d="M9 12h6M12 9v6"/>
      </svg>
    ),
    title: 'Gana con tu tiempo',
    desc: 'Conduce, reparte, crea contenido o refiere amigos. Multiples formas de generar ingresos dentro de Shekael.',
    note: 'PROXIMAMENTE'
  }
];

const PRINCIPLES = [
  { label: 'Contenido que suma', text: 'Priorizamos piezas que inspiran, ensenan o hacen reir sin destruir el foco ni la paz mental.' },
  { label: 'Libertad de expresion real', text: 'Aqui no premiamos el miedo. Hay reglas claras contra lo danino, sin censura arbitraria a las ideas.' },
  { label: 'Comunidad antes que algoritmo', text: 'Disenamos para personas y familias que quieren crecer juntas, no para metricas vacias.' }
];

function LandingInner() {
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  const { modalState, showLoading, showSuccess, showError, hideModal, showInfo } = useFeedbackModal();
  const { themeName, cycleTheme } = useStore();
  const recaptchaLoaded = useRef(false);
  const [counts, setCounts] = useState({ users: 0, creators: 0, mxneEarned: 0 });

  const heroRef = useRef(null);
  const featuresRef = useRef(null);
  const economyRef = useRef(null);
  const futureRef = useRef(null);
  const principlesRef = useRef(null);
  const closingRef = useRef(null);
  const mainRef = useRef(null);

  // Redirect if already logged in
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('landing') === '1') return;
    const token = localStorage.getItem('Shekael_token');
    if (token && !window.location.pathname.startsWith('/terminos')) {
      navigate('/terminos');
    }
  }, [navigate]);

  // Load reCAPTCHA
  useEffect(() => {
    if (document.querySelector('script[src*="recaptcha/api.js"]')) return;
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    script.onload = () => { recaptchaLoaded.current = true; };
    document.head.appendChild(script);
  }, []);

  // Apply theme
  useEffect(() => {
    if (themeName === 'light') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', themeName);
    }
  }, [themeName]);

  // GSAP animations
  useEffect(() => {
    if (!heroRef.current) return;
    const ctx = gsap.context(() => {

      // ── Hero: stagger text reveal ──
      const heroWords = heroRef.current.querySelectorAll(`.${styles.heroWord}`);
      if (heroWords.length) {
        gsap.fromTo(heroWords,
          { opacity: 0, y: 40, rotateX: -20 },
          { opacity: 1, y: 0, rotateX: 0, stagger: 0.08, duration: 0.7, ease: 'power3.out', delay: 0.3 }
        );
      }

      const heroSub = heroRef.current.querySelector(`.${styles.heroSub}`);
      if (heroSub) {
        gsap.fromTo(heroSub,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6, delay: 0.9, ease: 'power2.out' }
        );
      }

      const heroCta = heroRef.current.querySelector(`.${styles.heroCta}`);
      if (heroCta) {
        gsap.fromTo(heroCta,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6, delay: 1.2, ease: 'power2.out' }
        );
      }

      const scrollHint = heroRef.current.querySelector(`.${styles.scrollHint}`);
      if (scrollHint) {
        gsap.fromTo(scrollHint,
          { opacity: 0 },
          { opacity: 1, duration: 0.5, delay: 1.8, ease: 'power2.out' }
        );
      }

      // ── Features: staggered cards ──
      const featureCards = featuresRef.current?.querySelectorAll(`.${styles.featureCard}`);
      if (featureCards?.length) {
        gsap.fromTo(featureCards,
          { opacity: 0, y: 40 },
          {
            opacity: 1, y: 0, stagger: 0.12, duration: 0.6, ease: 'power2.out',
            scrollTrigger: {
              trigger: featuresRef.current,
              start: 'top 82%',
              toggleActions: 'play none none none'
            }
          }
        );
      }

      // ── Economy: step cards ──
      const economyCards = economyRef.current?.querySelectorAll(`.${styles.economyCard}`);
      if (economyCards?.length) {
        gsap.fromTo(economyCards,
          { opacity: 0, x: -30 },
          {
            opacity: 1, x: 0, stagger: 0.15, duration: 0.5, ease: 'power2.out',
            scrollTrigger: {
              trigger: economyRef.current,
              start: 'top 80%',
              toggleActions: 'play none none none'
            }
          }
        );
      }

      // ── Future: staggered cards ──
      const futureCards = futureRef.current?.querySelectorAll(`.${styles.futureCard}`);
      if (futureCards?.length) {
        gsap.fromTo(futureCards,
          { opacity: 0, scale: 0.92, y: 30 },
          {
            opacity: 1, scale: 1, y: 0, stagger: 0.13, duration: 0.5, ease: 'back.out(1.7)',
            scrollTrigger: {
              trigger: futureRef.current,
              start: 'top 82%',
              toggleActions: 'play none none none'
            }
          }
        );
      }

      // ── Principles ──
      const principleItems = principlesRef.current?.querySelectorAll(`.${styles.principleItem}`);
      if (principleItems?.length) {
        gsap.fromTo(principleItems,
          { opacity: 0, y: 20 },
          {
            opacity: 1, y: 0, stagger: 0.1, duration: 0.4, ease: 'power2.out',
            scrollTrigger: {
              trigger: principlesRef.current,
              start: 'top 85%',
              toggleActions: 'play none none none'
            }
          }
        );
      }

      // ── Closing ──
      const closingContent = closingRef.current?.querySelectorAll(`.${styles.closingAnimate}`);
      if (closingContent?.length) {
        gsap.fromTo(closingContent,
          { opacity: 0, y: 30 },
          {
            opacity: 1, y: 0, stagger: 0.15, duration: 0.5, ease: 'power2.out',
            scrollTrigger: {
              trigger: closingRef.current,
              start: 'top 80%',
              toggleActions: 'play none none none'
            }
          }
        );
      }

      // ── Economy eyebrow line ──
      const econLine = economyRef.current?.querySelector(`.${styles.econLine}`);
      if (econLine) {
        gsap.fromTo(econLine,
          { scaleX: 0 },
          {
            scaleX: 1, duration: 0.8, ease: 'power3.out',
            scrollTrigger: {
              trigger: economyRef.current,
              start: 'top 75%',
              toggleActions: 'play none none none'
            }
          }
        );
      }

    }, mainRef);

    return () => ctx.revert();
  }, []);

  const handleGoogleSuccess = async (credentialResponse) => {
    showLoading('Entrando a Shekael...', 'Verificando seguridad');
    try {
      let recaptchaToken = '';
      if (typeof grecaptcha !== 'undefined') {
        recaptchaToken = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'login' });
      }
      const data = await loginWithGoogle(credentialResponse.credential, recaptchaToken);
      hideModal();
      showSuccess('Ya estas dentro!', 'Bienvenido. Aqui si hay algo real.', true);
      if (!data.user?.terms_accepted_at || data.user?.terms_version !== 'v1.1') {
        navigate('/terminos');
      } else {
        navigate('/feed');
      }
    } catch (err) {
      hideModal();
      showError('Error de Google', err.message);
    }
  };

  // Split headline into words for animation
  const headlineWords = "Vuelve a crear, compartir y pertenecer".split(' ');

  return (
    <div className={styles.page} style={{ '--pattern-url': `url(${bgPatternUrl})` }} ref={mainRef}>
      {/* Theme Toggle */}
      <button className={styles.themeToggle} onClick={cycleTheme} aria-label="Cambiar tema" title={`Tema: ${themeName}`}>
        <Palette size={18} />
      </button>

      {/* ═══ HERO ═══ */}
      <section className={styles.hero} ref={heroRef}>
        <div className={styles.heroBg} />
        <div className={styles.heroOverlay} />

        <div className={styles.heroInner}>
          <div className={styles.heroContent}>
            <div className={styles.logoArea}>
              <span className={styles.logoWordmark}>Shekael</span>
              <span className={styles.logoTag}>Porque la luz no deberia estar escondida</span>
            </div>

            <h1 className={styles.headline}>
              {headlineWords.map((word, i) => (
                <span key={i} className={styles.heroWord}>
                  {word}{i < headlineWords.length - 1 ? '\u00A0' : ''}
                </span>
              ))}
              <span className={styles.headlinePeriod}>.</span>
            </h1>

            <p className={styles.heroSub}>
              Una red social con proposito donde el contenido vuelve a sentirse humano.
              Menos ruido, mas valor, mas libertad y mas cercania. Todo potenciado por
              una economia digital que empieza aqui.
            </p>

            <div className={styles.heroCta}>
              <div className={styles.googleWrap}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => showError('Error', 'No se pudo conectar con Google')}
                  shape="pill"
                  theme="outline"
                  text="continue_with"
                  width={320}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.scrollHint}>
          <div className={styles.scrollMouse}>
            <div className={styles.scrollDot} />
          </div>
          <span>Descubre mas</span>
        </div>
      </section>

      {/* ═══ FEATURES: LO QUE EXISTE ═══ */}
      <section className={styles.section} ref={featuresRef}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.eyebrow}>Tu red, tu espacio</span>
            <h2 className={styles.sectionTitle}>Lo que ya puedes hacer</h2>
            <p className={styles.sectionDesc}>
              Shekael no es promesa, es realidad. Estas funciones ya estan activas para ti.
            </p>
          </div>

          <div className={styles.featureGrid}>
            {FEATURES_NOW.map((feat, i) => (
              <article key={i} className={styles.featureCard}>
                <div className={styles.featureIcon}>{feat.icon}</div>
                <div className={styles.featureTag}>{feat.tag}</div>
                <h3 className={styles.featureTitle}>{feat.title}</h3>
                <p className={styles.featureDesc}>{feat.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ECONOMY: MXNe ═══ */}
      <section className={`${styles.section} ${styles.sectionDark}`} ref={economyRef}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.eyebrow}>Economia MXNe</span>
            <h2 className={styles.sectionTitle}>Gana mientras formas parte</h2>
            <p className={styles.sectionDesc}>
              MXNe es el token digital de Shekael. Crealo con tu contenido, gastalo en la comunidad.
              Una economia real dentro de tu red social.
            </p>
            <div className={styles.econLine} />
          </div>

          <div className={styles.economyGrid}>
            {ECONOMY_STEPS.map((step, i) => (
              <div key={i} className={styles.economyCard}>
                <div className={styles.economyIcon}>{step.icon}</div>
                <div className={styles.economyStep}>0{i + 1}</div>
                <h3 className={styles.economyTitle}>{step.title}</h3>
                <p className={styles.economyDesc}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FUTURE: LO QUE VIENE ═══ */}
      <section className={styles.section} ref={futureRef}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.eyebrow}>Proximamente</span>
            <h2 className={styles.sectionTitle}>Lo que viene para ti</h2>
            <p className={styles.sectionDesc}>
              Shekael crece con su comunidad. Estas son las siguientes funcionalidades
              que estaremos lanzando.
            </p>
          </div>

          <div className={styles.futureGrid}>
            {FUTURE_FEATURES.map((item, i) => (
              <article key={i} className={styles.futureCard}>
                <div className={styles.futureBadge}>{item.note}</div>
                <div className={styles.futureIcon}>{item.icon}</div>
                <h3 className={styles.futureTitle}>{item.title}</h3>
                <p className={styles.futureDesc}>{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRINCIPLES ═══ */}
      <section className={`${styles.section} ${styles.sectionAlt}`} ref={principlesRef}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.eyebrow}>Nuestros principios</span>
            <h2 className={styles.sectionTitle}>Como construimos Shekael</h2>
          </div>

          <div className={styles.principlesList}>
            {PRINCIPLES.map((item, i) => (
              <article key={i} className={styles.principleItem}>
                <div className={styles.principleNum}>0{i + 1}</div>
                <div className={styles.principleContent}>
                  <h3 className={styles.principleLabel}>{item.label}</h3>
                  <p className={styles.principleText}>{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CLOSING ═══ */}
      <section className={styles.closing} ref={closingRef}>
        <div className={styles.closingInner}>
          <span className={`${styles.eyebrow} ${styles.eyebrowLight}`}>Unete</span>
          <h2 className={`${styles.sectionTitle} ${styles.closingAnimate}`}>
            Shekael te espera
          </h2>
          <p className={`${styles.closingText} ${styles.closingAnimate}`}>
            Una red hecha para construir, no para confundir. Donde tu talento,
            tu tiempo y tu presencia valen algo real.
          </p>
          <div className={`${styles.closingCta} ${styles.closingAnimate}`}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => showError('Error', 'No se pudo conectar con Google')}
              shape="pill"
              theme="outline"
              text="continue_with"
              width={320}
            />
          </div>
        </div>
      </section>

      <p className={styles.recaptcha}>
        Este sitio esta protegido por reCAPTCHA de Google.{' '}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Politica de Privacidad</a>{' '}
        y{' '}
        <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Terminos del Servicio</a>.
      </p>

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
