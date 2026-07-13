import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin.js';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin.js';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin.js';
import { CustomEase } from 'gsap/CustomEase.js';
import { Palette } from 'lucide-react';
import useAuth from '../hooks/useAuth';
import useStore from '../store';
import FeedbackModal from '../components/FeedbackModal/FeedbackModal';
import useFeedbackModal from '../components/FeedbackModal/useFeedbackModal';
import styles from '../styles/pages/Landing.module.css';
import bgPatternUrl from '../assets/patterns/profile-bg-pattern.svg';

gsap.registerPlugin(ScrollTrigger, MorphSVGPlugin, ScrambleTextPlugin, DrawSVGPlugin, CustomEase);

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

// ── Blob shapes for morphing background ──
const BLOBS = {
  hero: 'M200,34.5Q177,69,189,113Q201,157,168.5,191Q136,225,104.5,208Q73,191,53.5,161.5Q34,132,29.5,92.5Q25,53,65,35Q105,17,149.5,20.5Q194,24,200,34.5Z',
  features: 'M192,33Q168,66,185,113Q202,160,163,187Q124,214,86,197Q48,180,47,139Q46,98,69,61Q92,24,144,27Q196,30,192,33Z',
  economy: 'M187,28Q142,56,154,97Q166,138,130,177Q94,216,63,180.5Q32,145,43,101.5Q54,58,107,44.5Q160,31,187,28Z',
  future: 'M205,40Q189,80,175,119Q161,158,131.5,188Q102,218,61.5,194.5Q21,171,30.5,126.5Q40,82,83,52.5Q126,23,164,21.5Q202,20,205,40Z',
  principles: 'M195,37Q157,74,156,117Q155,160,119,189Q83,218,56,184.5Q29,151,33,106Q37,61,97.5,40.5Q158,20,195,37Z',
  closing: 'M178,32Q149,64,144,105Q139,146,102,173Q65,200,45.5,165Q26,130,50,89Q74,48,119,30.5Q164,13,178,32Z'
};

const BLEND_MODES = ['hero', 'features', 'economy', 'future', 'principles', 'closing'];

const PRINCIPLES = [
  'Contenido que suma',
  'Libertad de expresion',
  'Comunidad > algoritmo'
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
  const closingRef = useRef(null);
  const blobRef = useRef(null);
  const mainRef = useRef(null);
  const tagsRef = useRef(null);
  const econStepsRef = useRef(null);
  const futureListRef = useRef(null);
  const principleListRef = useRef(null);
  const tl = useRef(null);

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

  // Redirect logged-in users
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('landing') === '1') return;
    const token = localStorage.getItem('Shekael_token');
    if (token && !window.location.pathname.startsWith('/terminos')) {
      navigate('/terminos');
    }
  }, [navigate]);

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

  // ─── GSAP: The crazy stuff ───
  useEffect(() => {
    CustomEase.create('shekael-bounce', 'M0,0 C0.3,0.9 0.4,1.2 0.5,1 C0.6,0.8 0.7,1.1 1,1');
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      // Only run on desktop (too wild for mobile)
      mm.add('(min-width: 701px)', () => {

        // ── 1. MORPHING BLOB ──
        const blobPath = blobRef.current?.querySelector('path');
        if (blobPath) {
          // Create a timeline that morphs through all blob shapes on scroll
          const sections = [heroRef, band1Ref, band2Ref, band3Ref, band4Ref, closingRef];
          const st = ScrollTrigger.create({
            trigger: mainRef.current,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1.5,
            onUpdate: (self) => {
              const progress = self.progress;
              // Map progress to blob shapes
              const totalShapes = BLEND_MODES.length - 1;
              const rawIdx = progress * totalShapes;
              const idx = Math.min(Math.floor(rawIdx), totalShapes - 1);
              const frac = rawIdx - idx;
              const fromId = BLEND_MODES[idx];
              const toId = BLEND_MODES[Math.min(idx + 1, totalShapes)];
              if (fromId && toId && BLOBS[fromId] !== BLOBS[toId]) {
                gsap.set(blobPath, {
                  morphSVG: { shape: BLOBS[toId], progress: frac }
                });
              }
            }
          });
        }

        // ── 2. HERO: 3D word stagger including period ──
        const heroWords = heroRef.current?.querySelectorAll(`.${styles.heroWord}, .${styles.headlinePeriod}`);
        if (heroWords?.length) {
          gsap.fromTo(heroWords,
            { opacity: 0, y: 60, rotateX: -40, scale: 0.8, filter: 'blur(8px)' },
            {
              opacity: 1, y: 0, rotateX: 0, scale: 1, filter: 'blur(0px)',
              stagger: 0.1, duration: 0.8, ease: 'shekael-bounce', delay: 0.4
            }
          );
        }

        const heroSub = heroRef.current?.querySelector(`.${styles.heroSub}`);
        if (heroSub) {
          gsap.fromTo(heroSub,
            { opacity: 0, y: 30 },
            { opacity: 1, y: 0, duration: 0.6, delay: 1.1, ease: 'power2.out' }
          );
        }

        const heroCta = heroRef.current?.querySelector(`.${styles.heroCta}`);
        if (heroCta) {
          gsap.fromTo(heroCta,
            { opacity: 0, y: 30 },
            { opacity: 1, y: 0, duration: 0.6, delay: 1.4, ease: 'power2.out' }
          );
        }

        // ── 3. SCRAMBLE TEXT on section headlines ──
        const bandTitles = mainRef.current?.querySelectorAll(`.${styles.bandTitle}, .${styles.bandTitleWhite}`);
        if (bandTitles?.length) {
          bandTitles.forEach(title => {
            const originalText = title.textContent || '';
            if (title.closest(`.${styles.bandAccent}`)) return; // Skip accent band (it has white title that looks weird scrambling)

            ScrollTrigger.create({
              trigger: title.closest(`.${styles.band}`) || title.parentElement,
              start: 'top 75%',
              onEnter: () => {
                gsap.to(title, {
                  duration: 1.2,
                  scrambleText: {
                    text: originalText,
                    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                    revealDelay: 0.2,
                    tweenLength: true,
                    speed: 0.6
                  },
                  ease: 'none'
                });
              },
              once: true
            });
          });
        }

        // ── 4. DRAW LINE on economy section ──
        const econLine = band2Ref.current?.querySelector(`.${styles.econLine}`);
        if (econLine?.tagName === 'path' || econLine?.tagName === 'svg') {
          gsap.fromTo(econLine,
            { drawSVG: '0%' },
            {
              drawSVG: '100%', duration: 1.2, ease: 'power3.inOut',
              scrollTrigger: {
                trigger: band2Ref.current,
                start: 'top 70%',
                toggleActions: 'play none none none'
              }
            }
          );
        }

        // ── 5. FEATURES: scatter from grid → assemble ──
        const featGrid = tagsRef.current;
        const featItems = featGrid?.querySelectorAll(`.${styles.featItem}`);

        if (featItems?.length) {
          // Wait one frame so grid positions settle, then scatter
          requestAnimationFrame(() => {
            featItems.forEach((el) => {
              const angle = Math.random() * Math.PI * 2;
              const dist = 120 + Math.random() * 180;
              gsap.set(el, {
                opacity: 0,
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist,
                scale: 0.3,
                rotation: gsap.utils.random(-35, 35)
              });
            });
          });

          // Assemble on scroll
          ScrollTrigger.create({
            trigger: featGrid,
            start: 'top 82%',
            onEnter: () => {
              featItems.forEach((el, i) => {
                gsap.to(el, {
                  x: 0, y: 0, opacity: 1, scale: 1, rotation: 0,
                  duration: 0.7,
                  delay: i * 0.1,
                  ease: 'back.out(2.5)',
                  overwrite: 'auto'
                });
              });
            },
            once: true
          });
        }

        // ── 6. ECONOMY STEPS: staggered arrows with custom bounce ──
        const econSteps = econStepsRef.current?.querySelectorAll(`.${styles.econStep}, .${styles.econArrow}`);
        if (econSteps?.length) {
          gsap.fromTo(econSteps,
            { opacity: 0, x: -40, rotate: -10 },
            {
              opacity: 1, x: 0, rotate: 0,
              stagger: 0.15, duration: 0.5, ease: 'shekael-bounce',
              scrollTrigger: {
                trigger: econStepsRef.current,
                start: 'top 80%',
                toggleActions: 'play none none none'
              }
            }
          );
        }

        // ── 7. FUTURE ITEMS: staggered from right ──
        const futureItems = futureListRef.current?.querySelectorAll(`.${styles.futureItem}`);
        if (futureItems?.length) {
          gsap.fromTo(futureItems,
            { opacity: 0, x: 60, rotate: 2 },
            {
              opacity: 1, x: 0, rotate: 0,
              stagger: 0.15, duration: 0.55, ease: 'power3.out',
              scrollTrigger: {
                trigger: futureListRef.current,
                start: 'top 80%',
                toggleActions: 'play none none none'
              }
            }
          );
        }

        // ── 8. PRINCIPLES: staggered with 3D effect ──
        const principles = principleListRef.current?.querySelectorAll(`.${styles.principleItem}`);
        if (principles?.length) {
          gsap.fromTo(principles,
            { opacity: 0, y: 40, rotateY: -15, transformOrigin: 'left center' },
            {
              opacity: 1, y: 0, rotateY: 0,
              stagger: 0.12, duration: 0.5, ease: 'power3.out',
              scrollTrigger: {
                trigger: principleListRef.current,
                start: 'top 82%',
                toggleActions: 'play none none none'
              }
            }
          );
        }

        // ── 9. CLOSING: float up with overshoot ──
        const closingInner = closingRef.current?.querySelector(`.${styles.bandInner}`);
        if (closingInner) {
          gsap.fromTo(closingInner.children,
            { opacity: 0, y: 50 },
            {
              opacity: 1, y: 0,
              stagger: 0.15, duration: 0.5, ease: 'back.out(1.7)',
              scrollTrigger: {
                trigger: closingRef.current,
                start: 'top 82%',
                toggleActions: 'play none none none'
              }
            }
          );
        }

      }); // end matchMedia desktop

      // Mobile: simpler animations
      mm.add('(max-width: 700px)', () => {
        const bands = [band1Ref, band2Ref, band3Ref, band4Ref, closingRef];
        bands.forEach(ref => {
          const el = ref.current;
          if (!el) return;
          gsap.fromTo(el,
            { opacity: 0, y: 20 },
            {
              opacity: 1, y: 0, duration: 0.5, ease: 'power2.out',
              scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
            }
          );
        });
      });

    }, mainRef);

    return () => ctx.revert();
  }, []);

  const headlineWords = "Vuelve a crear, compartir y pertenecer".split(' ');

  return (
    <div className={styles.page} style={{ '--pattern-url': `url(${bgPatternUrl})` }} ref={mainRef}>
      {/* ─── Morphing Blob Background ─── */}
      <div className={styles.blobWrap} ref={blobRef}>
        <svg viewBox="0 0 250 250" preserveAspectRatio="xMidYMid slice" className={styles.blobSvg}>
          <path d={BLOBS.hero} fill="var(--color-primary)" opacity="0.06" />
        </svg>
      </div>

      {/* Theme Toggle */}
      <button className={styles.themeToggle} onClick={cycleTheme} aria-label="Cambiar tema" title={`Tema: ${themeName}`}>
        <Palette size={18} />
      </button>

      {/* ═══ HERO ═══ */}
      <section className={styles.hero} ref={heroRef}>
        <div className={styles.patternOverlay} />

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

      {/* ═══ BAND 1: FEATURES ═══ */}
      <section className={`${styles.band} ${styles.bandLight}`} ref={band1Ref}>
        <div className={styles.bandInner}>
          <span className={styles.bandEyebrow}>Tu red, tu espacio</span>
          <h2 className={styles.bandTitle}>Lo que ya puedes hacer</h2>
          <div className={styles.featGrid} ref={tagsRef}>
            <div className={styles.featInner}>
              <div className={styles.featItem}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/><path d="M8 10h8M8 14h5"/></svg>
                <span className={styles.featLabel}>Feed</span>
              </div>
              <div className={styles.featItem}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                <span className={styles.featLabel}>Chat</span>
              </div>
              <div className={styles.featItem}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>
                <span className={styles.featLabel}>Perfil</span>
              </div>
              <div className={styles.featItem}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <span className={styles.featLabel}>Fotos</span>
              </div>
              <div className={styles.featItem}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                <span className={styles.featLabel}>Audio</span>
              </div>
              <div className={styles.featItem}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                <span className={styles.featLabel}>Gente</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ BAND 2: ECONOMY ═══ */}
      <section className={`${styles.band} ${styles.bandDark}`} ref={band2Ref}>
        <div className={styles.bandInner}>
          <span className={styles.bandEyebrow}>Economia MXNe</span>
          <h2 className={styles.bandTitle}>Gana mientras formas parte</h2>
          <div className={styles.econLine}>
            <svg width="60" height="3" viewBox="0 0 60 3">
              <path d="M0 1.5h60" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <div className={styles.econSteps} ref={econStepsRef}>
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

      {/* ═══ BAND 3: FUTURE ═══ */}
      <section className={`${styles.band} ${styles.bandAccent}`} ref={band3Ref}>
        <div className={styles.bandInner}>
          <span className={styles.bandEyebright}>Proximamente</span>
          <h2 className={styles.bandTitleWhite}>Lo que viene para ti</h2>
          <div className={styles.futureList} ref={futureListRef}>
            <div className={styles.futureItem}>
              <div className={styles.futureIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a1 1 0 00-.8-.4H5.24a2 2 0 00-1.8 1.1l-.8 1.63A6 6 0 006 18h.5"/>
                  <circle cx="4.5" cy="19.5" r="1.5"/><circle cx="15.5" cy="19.5" r="1.5"/>
                </svg>
              </div>
              <div>
                <span className={styles.futureBadge}>PROXIMAMENTE</span>
                <h3 className={styles.futureTitle}>Conductores</h3>
              </div>
            </div>
            <div className={styles.futureItem}>
              <div className={styles.futureIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"/>
                  <path d="M7 9V5c0-1.1.9-2 2-2h6a2 2 0 012 2v4"/>
                  <circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>
                </svg>
              </div>
              <div>
                <span className={styles.futureBadge}>PROXIMAMENTE</span>
                <h3 className={styles.futureTitle}>Repartidores</h3>
              </div>
            </div>
            <div className={styles.futureItem}>
              <div className={styles.futureIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2l3 7h7l-5.5 4 2 7L12 16.5 5.5 20l2-7L2 9h7z"/>
                  <path d="M9 12h6M12 9v6"/>
                </svg>
              </div>
              <div>
                <span className={styles.futureBadge}>PROXIMAMENTE</span>
                <h3 className={styles.futureTitle}>Multiples formas de ganar</h3>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ BAND 4: PRINCIPLES ═══ */}
      <section className={`${styles.band} ${styles.bandLight}`} ref={band4Ref}>
        <div className={styles.bandInner}>
          <span className={styles.bandEyebrow}>Nuestros principios</span>
          <h2 className={styles.bandTitle}>Como construimos Shekael</h2>
          <div className={styles.principlesList} ref={principleListRef}>
            {PRINCIPLES.map((item, i) => (
              <article key={i} className={styles.principleItem}>
                <div className={styles.principleNum}>0{i + 1}</div>
                <h3 className={styles.principleLabel}>{item}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CLOSING ═══ */}
      <section className={`${styles.band} ${styles.bandDark} ${styles.bandClosing}`} ref={closingRef}>
        <div className={styles.bandInner}>
          <p className={styles.closingMission}>Una aplicacion. Un ecosistema.</p>
          <h2 className={styles.bandTitle}>Shekael te espera</h2>
          <p className={styles.closingVision}>La super app de Mexico</p>
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
