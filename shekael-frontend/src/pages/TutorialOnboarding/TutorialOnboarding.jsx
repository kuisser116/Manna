import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ArrowRight, Plus } from 'lucide-react'; // eslint-disable-line
import ShekaelLogo from '../../components/ShekaelLogo/ShekaelLogo';
import useStore from '../../store';
import styles from './TutorialOnboarding.module.css';

const API_URL = import.meta.env.VITE_API_URL || location.origin;
const TOTAL = 4;

export default function TutorialOnboarding({ onComplete }) {
    const navigate = useNavigate();
    const { token } = useStore();
    const [slide, setSlide] = useState(0);
    const [done, setDone] = useState(false);

    const root = useRef(null);
    const dots = useRef([]);
    const btn = useRef(null);

    // Refs per slide
    const logo = useRef(null);
    const h1 = useRef(null);
    const p = useRef([]);
    const h2 = useRef([]);

    // Chest SVG refs
    const chestSvg = useRef(null);
    const chestLid = useRef(null);
    const chestGlow = useRef(null);
    const chestCoins = useRef([]);
    const fiftyText = useRef(null);
    const fiftyLabel = useRef(null);

    // Mockup refs
    const mockup = useRef(null);
    const createPulse = useRef(null);

    // Bitso refs
    const bitsoWrap = useRef(null);

    // Particles
    useEffect(() => {
        const box = root.current;
        if (!box) return;
        const elms = [];
        for (let i = 0; i < 20; i++) {
            const d = document.createElement('div');
            d.className = styles.particle;
            d.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;width:${2+Math.random()*4}px;height:${2+Math.random()*4}px`;
            box.appendChild(d);
            elms.push(d);
        }
        gsap.to(elms, {
            y: 'random(-25,25)', x: 'random(-12,12)',
            duration: 'random(3,5)', repeat: -1, yoyo: true,
            ease: 'sine.inOut', stagger: { each: 0.06, from: 'random' }
        });
        return () => elms.forEach(d => d.remove());
    }, []);

    /* ─── Animators ─── */
    const animators = useCallback(() => {
        const f = [];

        const showSlide = (idx) => {
            const el = root.current?.querySelector(`[data-slide="${idx}"]`);
            if (el) gsap.set(el, { autoAlpha: 1 });
        };
        const hideAll = () => {
            const slides = root.current?.querySelectorAll(`.${styles.slide}`);
            if (slides) gsap.set(slides, { autoAlpha: 0 });
        };

        // SLIDE 0: Welcome — elements appear together, dynamic
        f[0] = () => {
            hideAll();
            showSlide(0);
            gsap.set(btn.current, { autoAlpha: 0 });
            const tl = gsap.timeline();
            // All three main elements animate simultaneously
            tl.add(() => {
                gsap.fromTo(h1.current,
                    { autoAlpha: 0, x: -60, scale: 0.9 },
                    { autoAlpha: 1, x: 0, scale: 1, duration: 0.6, ease: 'power4.out' }
                );
                gsap.fromTo(logo.current,
                    { autoAlpha: 0, scale: 0.4, rotate: -8 },
                    { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)' }
                );
                gsap.fromTo(p.current[0],
                    { autoAlpha: 0, x: 60, scale: 0.9 },
                    { autoAlpha: 1, x: 0, scale: 1, duration: 0.6, ease: 'power4.out' }
                );
            }, 0);
            // Button slides up slightly after
            tl.fromTo(btn.current, { autoAlpha: 0, y: 24, scale: 0.92 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(1.7)' }, '-=0.15');
        };

        // SLIDE 1: Chest
        f[1] = () => {
            hideAll();
            showSlide(1);
            gsap.set(btn.current, { autoAlpha: 0 });
            const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
            tl.fromTo(chestSvg.current, { autoAlpha: 0, scale: 0.3, rotate: -10 }, { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.9, ease: 'elastic.out(1, 0.5)' });
            // Minecraft-style chest open: lid scales down (flattens backward)
            tl.to(chestLid.current, {
                scaleY: 0.3,
                y: -14,
                transformOrigin: '50% 0%',
                duration: 0.6,
                ease: 'back.out(1.5)'
            }, '-=0.3');

            tl.fromTo(fiftyText.current, { autoAlpha: 0, y: 20, filter: 'blur(8px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.6 }, '-=0.2');
            tl.fromTo(fiftyLabel.current, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4 }, '-=0.15');
            tl.fromTo(btn.current, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.35 }, '-=0.1');
        };

        // SLIDE 2: Authentic + Mockup
        f[2] = () => {
            hideAll();
            showSlide(2);
            gsap.set(btn.current, { autoAlpha: 0 });
            const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
            tl.fromTo(h2.current[2], { autoAlpha: 0, y: 16, filter: 'blur(6px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.5 });
            tl.fromTo(p.current[2], { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.4 }, '-=0.2');
            tl.fromTo(mockup.current, { autoAlpha: 0, y: 60, filter: 'blur(10px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.8, ease: 'power4.out' }, '-=0.1');
            tl.fromTo(createPulse.current, { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(2.5)' }, '-=0.3');
            tl.fromTo(btn.current, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.35 }, '-=0.1');
        };

        // SLIDE 3: Withdraw
        f[3] = () => {
            hideAll();
            showSlide(3);
            gsap.set(btn.current, { autoAlpha: 0 });
            const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
            const coinEls = root.current.querySelectorAll(`.${styles.floatingCoin}`);

            // Coins aparecen todas simultaneamente con elastic bounce
            gsap.set(coinEls, { autoAlpha: 0, scale: 0.4, rotate: -12 });
            tl.to(coinEls, {
                autoAlpha: 1,
                scale: 1,
                rotate: 0,
                duration: 0.5,
                ease: 'elastic.out(0.7, 0.4)',
                stagger: 0.07
            });

            // Bitso logo con elastic bounce + mas grande
            tl.fromTo(bitsoWrap.current,
                { autoAlpha: 0, scale: 0.4, rotate: -6 },
                { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' },
                '-=0.25'
            );

            // Monedas vuelan al centro y se absorben en Bitso
            tl.to(coinEls, {
                left: '50%',
                top: '50%',
                xPercent: -50,
                yPercent: -50,
                scale: 0,
                opacity: 0,
                duration: 0.5,
                ease: 'back.in(1.3)',
                stagger: 0.04
            }, '-=0.1');

            tl.fromTo(h2.current[3], { autoAlpha: 0, y: 20, filter: 'blur(6px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.5 }, '-=0.2');
            tl.fromTo(p.current[3], { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4 }, '-=0.1');
            tl.fromTo(btn.current, { autoAlpha: 0, y: 20, scale: 0.9 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.5)' }, '-=0.1');
        };

        return f;
    }, []);

    const fnRef = useRef(null);
    if (!fnRef.current) fnRef.current = animators();

    // Animate on slide change
    useEffect(() => {
        if (done) return;
        // Immediately hide all slides to prevent flash
        const slides = root.current?.querySelectorAll(`.${styles.slide}`);
        if (slides) gsap.set(slides, { autoAlpha: 0 });
        gsap.set(btn.current, { autoAlpha: 0, clearProps: 'all' });
        const timer = setTimeout(() => fnRef.current[slide](), 100);
        // Update progress dots
        dots.current.forEach((el, i) => {
            if (!el) return;
            el.className = i === slide ? `${styles.pdot} ${styles.pdotActive}`
                : i < slide ? `${styles.pdot} ${styles.pdotDone}` : styles.pdot;
        });
        return () => clearTimeout(timer);
    }, [slide, done]);

    const goNext = useCallback(() => {
        if (done) return;
        gsap.to(btn.current, { autoAlpha: 0, y: 20, duration: 0.15 });
        const cur = root.current?.querySelector(`.${styles.slide}`);
        if (cur) {
            gsap.to(cur, {
                autoAlpha: 0, filter: 'blur(8px)', scale: 0.96, duration: 0.3, ease: 'power2.in',
                onComplete: () => {
                    const next = slide + 1;
                    if (next >= TOTAL) { finish(); return; }
                    setSlide(next);
                }
            });
        }
    }, [slide, done]);

    const finish = useCallback(async () => {
        setDone(true);
        try {
            if (token) {
                await fetch(`${API_URL}/users/tutorial-complete`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
                });
            }
        } catch (_) {}
        gsap.to(root.current, { autoAlpha: 0, duration: 0.5, ease: 'power2.inOut', onComplete: () => {
            if (onComplete) onComplete();
            else navigate('/feed', { replace: true });
        }});
    }, [token, navigate, onComplete]);

    return (
        <div className={styles.overlay} ref={root}>
            {/* Progress dots */}
            <div className={styles.progress}>
                {[0,1,2,3].map(i => <div key={i} ref={el => dots.current[i] = el} className={styles.pdot} />)}
            </div>

            <div className={styles.wrap}>
                {/* ═══ SLIDE 0 ── Hero ═══ */}
                <div className={styles.slide} data-slide="0">
                    <h1 ref={h1} className={styles.titleLarge}>Bienvenido</h1>
                    <div className={styles.brandTitle} ref={logo}><ShekaelLogo size="hero" /></div>
                    <p ref={el => p.current[0] = el} className={styles.sub}>Aquí tu atención vale.</p>
                </div>

                {/* ═══ SLIDE 1 ── Chest + $50 ═══ */}
                <div className={styles.slide} data-slide="1">
                    <svg ref={chestSvg} className={styles.chest} viewBox="0 12 150 108" fill="none" overflow="visible">
                        {/* Chest interior — dark background visible between lid and body when open */}
                        <rect x="14" y="18" width="122" height="42" rx="2" fill="#1F1307"/>
                        {/* Chest bottom */}
                        <rect x="10" y="60" width="130" height="55" rx="2" fill="#7B5B2A" stroke="#5C431E" strokeWidth="3"/>
                        {/* Bottom trim */}
                        <rect x="10" y="60" width="130" height="6" rx="1" fill="#C4932F" stroke="#5C431E" strokeWidth="1.5"/>
                        {/* Bottom handle */}
                        <rect x="50" y="65" width="50" height="8" rx="2" fill="#5C431E"/>
                        {/* Chest lid */}
                        <g ref={chestLid}>
                            <rect x="8" y="20" width="134" height="42" rx="2" fill="#8B6914" stroke="#5C431E" strokeWidth="3"/>
                            {/* Lid top trim */}
                            <rect x="8" y="20" width="134" height="5" rx="1" fill="#C4932F" stroke="#5C431E" strokeWidth="1.5"/>
                            {/* Lock on front */}
                            <rect x="66" y="42" width="18" height="22" rx="3" fill="#5C431E"/>
                            <rect x="70" y="46" width="10" height="10" rx="2" fill="#C4932F"/>
                            <circle cx="75" cy="51" r="3" fill="#8B6914"/>
                        </g>
                        {/* Side brackets */}
                        <rect x="18" y="72" width="12" height="8" rx="2" fill="#5C431E"/>
                        <rect x="120" y="72" width="12" height="8" rx="2" fill="#5C431E"/>
                        {/* Glow from inside */}
                        <ellipse ref={chestGlow} cx="75" cy="45" rx="55" ry="15" fill="#FFD700" opacity="0"/>
                    </svg>

                    <div ref={fiftyText} className={styles.amount}>$50 MXN</div>
                    <p ref={fiftyLabel} className={styles.desc}>Publica contenido para liberarlos.</p>
                </div>

                {/* ═══ SLIDE 2 ── Authentic + Mockup ═══ */}
                <div className={styles.slide} data-slide="2">
                    <h2 ref={el => h2.current[2] = el} className={styles.titleMed}>Ya son tuyos.</h2>
                    <p ref={el => p.current[2] = el} className={styles.desc} style={{marginBottom:16}}>
                        Solo publica algo auténtico — una foto, un pensamiento, tu día a día.
                    </p>
                    <div className={styles.mockup} ref={mockup}>
                        <div className={styles.mockFrame}>
                            <div className={styles.mockTop}><ShekaelLogo size="xs" /></div>
                            <div className={styles.mockFeed}>
                                <div className={styles.mockCard} />
                                <div className={styles.mockCard} style={{width:'80%'}} />
                                <div className={styles.mockCard} style={{width:'65%'}} />
                            </div>
                            <div className={styles.mockNav}>
                                <div className={styles.mockNavBtn} />
                                <div className={styles.mockNavBtn} />
                                <div className={styles.mockNavBtnCreate} ref={createPulse}>
                                    <Plus size={18} strokeWidth={2.5} />
                                </div>
                                <div className={styles.mockNavBtn} />
                                <div className={styles.mockNavBtn} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══ SLIDE 3 ── Withdraw ═══ */}
                <div className={styles.slide} data-slide="3">
                    <div className={styles.bitsoAnim}>
                        <span className={styles.floatingCoin} style={{top:'-19%',left:'11%'}}>💰</span>
                        <span className={styles.floatingCoin} style={{top:'-14%',right:'16%'}}>💎</span>
                        <span className={styles.floatingCoin} style={{top:'44%',left:'-14%'}}>🪙</span>
                        <span className={styles.floatingCoin} style={{top:'39%',right:'-14%'}}>💵</span>
                        <span className={styles.floatingCoin} style={{bottom:'-19%',left:'31%'}}>✨</span>
                        <div className={styles.bitsoIcon} ref={bitsoWrap}>
                            <img src="/brands/bitso.png" alt="Bitso" className={styles.bitsoSvg} />
                        </div>
                    </div>
                    <h2 ref={el => h2.current[3] = el} className={styles.titleMed}>Retira cuando quieras a Bitso.</h2>
                    <p ref={el => p.current[3] = el} className={styles.desc}>Así de simple.</p>
                </div>

                {/* ═══ Button ═══ */}
                <button className={`${styles.btn} ${slide === 3 ? styles.btnFinish : ''}`} ref={btn} onClick={goNext}>
                    {slide === 3 ? 'Comenzar ahora' : 'Siguiente'}
                    <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
}
