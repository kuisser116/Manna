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

const PRINCIPLES = [
  { label: 'Contenido que suma', text: 'Priorizamos piezas que inspiran, ensenan o hacen reir sin destruir el foco ni la paz mental.' },
  { label: 'Libertad de expresion real', text: 'Aqui no premiamos el miedo. Hay reglas claras contra lo danino, sin censura arbitraria a las ideas.' },
  { label: 'Comunidad antes que algoritmo', text: 'Disenamos para personas y familias que quieren crecer juntas, no para metricas vacias.' }
];

function LandingInner() {
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  const { modalState, showLoading, showSuccess, showError, hideModal } = useFeedbackModal();
  const { themeName, cycleTheme } = useStore();
  const recaptchaLoaded = useRef(false);

  const heroRef = useRef(null);
  const band1Ref = useRef(null);
  const band2Ref = useRef(null);
  const band3Ref = useRef(null);
  const band4Ref = useRef(null);
  const principlesRef = useRef(null);
  const closingRef = useRef(null);

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

      // Hero: stagger text reveal
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

      // Bands: fade-up reveal on scroll
      const bands = [band1Ref, band2Ref, band3Ref, band4Ref, principlesRef, closingRef];
      bands.forEach(ref => {
        const el = ref.current;
        if (!el) return;
        gsap.fromTo(el,
          { opacity: 0, y: 30 },
          {
            opacity: 1, y: 0, duration: 0.6, ease: 'power2.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 85%',
              toggleActions: 'play none none none'
            }
          }
        );
      });

      // Economy line animation
      const econLine = band3Ref.current?.querySelector(`.${styles.econLine}`);
      if (econLine) {
        gsap.fromTo(econLine,
          { scaleX: 0 },
          {
            scaleX: 1, duration: 0.7, ease: 'power3.out',
            scrollTrigger: {
              trigger: band3Ref.current,
              start: 'top 80%',
              toggleActions: 'play none none none'
            }
          }
        );
      }

    });

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

  const headlineWords = "Vuelve a crear, compartir y pertenecer".split(' ');

  return (
    <div className={styles.page} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
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
              Menos ruido, mas valor, mas libertad. Todo potenciado por una economia digital
              que empieza aqui.
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
          <span>Desplazate para conocer mas</span>
        </div>
      </section>

      {/* ═══ BAND 1: QUE ES ═══ */}
      <section className={`${styles.band} ${styles.bandLight}`} ref={band1Ref}>
        <div className={styles.bandInner}>
          <span className={styles.bandEyebrow}>Tu red, tu espacio</span>
          <h2 className={styles.bandTitle}>Lo que ya puedes hacer</h2>
          <p className={styles.bandText}>
            Shekael no es promesa, es realidad. Alimenta un feed que suma, no que distrae.
            Chatea con cifrado de extremo a extremo. Comparte fotos, videos, audio y encuestas.
            Construye tu perfil unico. Todo esto ya funciona, todo esto es tuyo.
          </p>
          <div className={styles.featureTags}>
            <span className={styles.tag}>Feed inteligente</span>
            <span className={styles.tag}>Chat cifrado</span>
            <span className={styles.tag}>Perfiles unicos</span>
            <span className={styles.tag}>Fotos y videos</span>
            <span className={styles.tag}>Audio y encuestas</span>
            <span className={styles.tag}>Comunidad real</span>
          </div>
        </div>
      </section>

      {/* ═══ BAND 2: ECONOMIA ═══ */}
      <section className={`${styles.band} ${styles.bandDark}`} ref={band2Ref}>
        <div className={styles.bandInner}>
          <span className={styles.bandEyebrow}>Economia MXNe</span>
          <h2 className={styles.bandTitle}>Gana mientras formas parte</h2>
          <p className={styles.bandText}>
            MXNe es el token digital de Shekael en la red Stellar. Creas contenido y ganas.
            Completas misiones y ganas. Apoyas a creadores directo, sin intermediarios.
            Pagas en comercios afiliados con QR y obtienes hasta 5% de descuento.
            No es una promesa, es una economia funcionando dentro de tu red social.
          </p>
          <div className={styles.econLine} />
          <div className={styles.econSteps}>
            <div className={styles.econStep}>
              <span className={styles.econNum}>01</span>
              <span className={styles.econLabel}>Ganas MXNe</span>
            </div>
            <div className={styles.econArrow}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 5l7 7-7 7"/>
              </svg>
            </div>
            <div className={styles.econStep}>
              <span className={styles.econNum}>02</span>
              <span className={styles.econLabel}>Apoyas creadores</span>
            </div>
            <div className={styles.econArrow}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 5l7 7-7 7"/>
              </svg>
            </div>
            <div className={styles.econStep}>
              <span className={styles.econNum}>03</span>
              <span className={styles.econLabel}>Pagas con QR</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ BAND 3: PROXIMAMENTE ═══ */}
      <section className={`${styles.band} ${styles.bandAccent}`} ref={band3Ref}>
        <div className={styles.bandInner}>
          <span className={styles.bandEyebright}>Proximamente</span>
          <h2 className={styles.bandTitleWhite}>Lo que viene para ti</h2>
          <p className={styles.bandTextWhite}>
            Shekael crece con su comunidad. Estamos construyendo las herramientas para que
            puedas generar ingresos reales desde la plataforma.
          </p>
          <div className={styles.futureList}>
            <div className={styles.futureItem}>
              <div className={styles.futureIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a1 1 0 00-.8-.4H5.24a2 2 0 00-1.8 1.1l-.8 1.63A6 6 0 006 18h.5"/>
                  <circle cx="4.5" cy="19.5" r="1.5"/><circle cx="15.5" cy="19.5" r="1.5"/>
                </svg>
              </div>
              <div className={styles.futureContent}>
                <span className={styles.futureBadge}>PROXIMAMENTE</span>
                <h3 className={styles.futureTitle}>Conductores</h3>
                <p className={styles.futureDesc}>Solicita o brinda transporte seguro dentro de tu comunidad. Viajes con personas de confianza, no con extraños.</p>
              </div>
            </div>
            <div className={styles.futureItem}>
              <div className={styles.futureIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"/>
                  <path d="M7 9V5c0-1.1.9-2 2-2h6a2 2 0 012 2v4"/>
                  <circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>
                </svg>
              </div>
              <div className={styles.futureContent}>
                <span className={styles.futureBadge}>PROXIMAMENTE</span>
                <h3 className={styles.futureTitle}>Repartidores</h3>
                <p className={styles.futureDesc}>Envia y recibe paquetes, comida y productos entre usuarios de la comunidad. Rapido, local y confiable.</p>
              </div>
            </div>
            <div className={styles.futureItem}>
              <div className={styles.futureIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2l3 7h7l-5.5 4 2 7L12 16.5 5.5 20l2-7L2 9h7z"/>
                  <path d="M9 12h6M12 9v6"/>
                </svg>
              </div>
              <div className={styles.futureContent}>
                <span className={styles.futureBadge}>PROXIMAMENTE</span>
                <h3 className={styles.futureTitle}>Multiples formas de ganar</h3>
                <p className={styles.futureDesc}>Conduce, reparte, crea contenido o refiere amigos. Multiples formas de generar ingresos dentro de Shekael.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ BAND 4: PRINCIPIOS ═══ */}
      <section className={`${styles.band} ${styles.bandLight}`} ref={principlesRef}>
        <div className={styles.bandInner}>
          <span className={styles.bandEyebrow}>Nuestros principios</span>
          <h2 className={styles.bandTitle}>Como construimos Shekael</h2>
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
      <section className={`${styles.band} ${styles.bandDark} ${styles.bandClosing}`} ref={closingRef}>
        <div className={styles.bandInner}>
          <h2 className={styles.bandTitle}>Shekael te espera</h2>
          <p className={styles.bandText}>
            Una red hecha para construir, no para confundir. Donde tu talento,
            tu tiempo y tu presencia valen algo real.
          </p>
          <div className={styles.closingCta}>
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
