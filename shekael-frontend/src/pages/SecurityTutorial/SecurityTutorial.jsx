import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ArrowRight, Key, Shield, AlertTriangle, Smartphone, FileText, CheckCircle } from 'lucide-react';
import useStore from '../../store';
import styles from './SecurityTutorial.module.css';

const TOTAL = 5;

export default function SecurityTutorial() {
    const navigate = useNavigate();
    const [slide, setSlide] = useState(0);
    const root = useRef(null);
    const dots = useRef([]);
    const btn = useRef(null);

    // Refs per slide
    const iconRef = useRef([]);
    const h2Ref = useRef([]);
    const pRef = useRef([]);
    const highlightRef = useRef([]);

    // Particles
    useEffect(() => {
        const box = root.current;
        if (!box) return;
        const particles = [];
        const letters = ['S','H','E','K','A','E','L'];
        const font = "'Theodore And Scarlett','Caesar Dressing',sans-serif";
        const MAX = 60;

        function makeLetter(text, x, y, size) {
            const d = document.createElement('span');
            d.textContent = text;
            d.className = styles.particle;
            const s = size || 12 + Math.random() * 30;
            d.style.cssText = [
                `left:${x}%;top:${y}%`,
                `font-size:${s}px`,
                `color:var(--color-primary)`,
                `opacity:${0.12 + Math.random() * 0.2}`,
                `font-family:${font}`,
                'text-transform:uppercase',
                'font-weight:400',
                'letter-spacing:normal',
                'pointer-events:none',
                'user-select:none',
                'white-space:nowrap'
            ].join(';');
            box.appendChild(d);
            particles.push(d);
            if (particles.length > MAX) {
                const old = particles.shift();
                if (old.parentNode) old.remove();
            }
            return d;
        }

        for (let i = 0; i < 30; i++) {
            const d = makeLetter(letters[i % letters.length], Math.random()*100, Math.random()*100);
            gsap.to(d, {
                y: 'random(-200,200)', x: 'random(-120,120)',
                rotation: 'random(-25,25)',
                duration: 'random(3,6)', repeat: -1, yoyo: true,
                ease: 'sine.inOut', delay: Math.random() * 0.5
            });
        }

        return () => {
            particles.forEach(d => d.remove());
        };
    }, []);

    // Animate slide
    useEffect(() => {
        const slides = root.current?.querySelectorAll(`.${styles.slide}`);
        if (slides) gsap.set(slides, { autoAlpha: 0 });
        gsap.set(btn.current, { autoAlpha: 0 });

        const timer = setTimeout(() => {
            const s = root.current?.querySelector(`[data-slide="${slide}"]`);
            if (s) gsap.set(s, { autoAlpha: 1 });

            // Animate elements
            gsap.fromTo(iconRef.current[slide],
                { autoAlpha: 0, scale: 0.4, rotate: -10 },
                { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' }
            );
            gsap.fromTo(h2Ref.current[slide],
                { autoAlpha: 0, y: 20, scale: 0.9 },
                { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)', delay: 0.1 }
            );
            gsap.fromTo(pRef.current[slide],
                { autoAlpha: 0, y: 16, scale: 0.9 },
                { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)', delay: 0.2 }
            );
            if (highlightRef.current[slide]) {
                gsap.fromTo(highlightRef.current[slide],
                    { autoAlpha: 0, y: 12 },
                    { autoAlpha: 1, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)', delay: 0.35 }
                );
            }
            gsap.fromTo(btn.current,
                { autoAlpha: 0, y: 20, scale: 0.92 },
                { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: 'elastic.out(1, 0.5)', delay: 0.4 }
            );
        }, 100);

        dots.current.forEach((el, i) => {
            if (!el) return;
            el.className = i === slide ? `${styles.pdot} ${styles.pdotActive}`
                : i < slide ? `${styles.pdot} ${styles.pdotDone}` : styles.pdot;
        });

        return () => clearTimeout(timer);
    }, [slide]);

    const goNext = () => {
        gsap.to(btn.current, { autoAlpha: 0, y: 20, duration: 0.15 });
        const cur = root.current?.querySelector(`[data-slide="${slide}"]`);
        if (cur) {
            gsap.to(cur, {
                autoAlpha: 0, filter: 'blur(8px)', scale: 0.96, duration: 0.3, ease: 'power2.in',
                onComplete: () => {
                    const next = slide + 1;
                    if (next >= TOTAL) {
                        navigate('/settings/security');
                        return;
                    }
                    setSlide(next);
                }
            });
        }
    };

    const slides = [
        {
            icon: Shield,
            title: 'Recupera tu Cuenta',
            desc: 'Tu dinero está protegido. Pero si pierdes tu teléfono o olvidas tu PIN, necesitas un respaldo. Aquí te explicamos cómo.',
            highlight: null,
        },
        {
            icon: Key,
            title: 'Tu Clave Secreta',
            desc: 'Shekael te generó una clave única (empieza con S...). Esta clave ES tu wallet. Con ella puedes recuperar todo.',
            highlight: 'Sin esta clave, nadie —ni Shekael— puede recuperar tu dinero.',
        },
        {
            icon: Smartphone,
            title: 'Tu PIN de Seguridad',
            desc: 'Tu PIN de 6 dígitos protege la app. Solo tú puedes desbloquearla. Pero el PIN NO recupera tu cuenta.',
            highlight: 'Si olvidas tu PIN, necesitarás tu clave secreta para crear uno nuevo.',
        },
        {
            icon: FileText,
            title: 'Respaldo en Papel',
            desc: 'Escribe tu clave secreta en papel físico. Guárdala en un lugar seguro de tu casa.',
            highlight: 'NO fotos. NO nube. NO screenshots. Solo papel físico.',
        },
        {
            icon: CheckCircle,
            title: 'Listo',
            desc: 'Ahora veremos tu clave. Escríbela en papel inmediatamente.',
            highlight: null,
        },
    ];

    return (
        <div className={styles.overlay} ref={root}>
            <div className={styles.progress}>
                {[0,1,2,3,4].map(i => <div key={i} ref={el => dots.current[i] = el} className={styles.pdot} />)}
            </div>

            <div className={styles.wrap}>
                {slides.map((s, i) => {
                    const Icon = s.icon;
                    return (
                        <div className={styles.slide} key={i} data-slide={i}>
                            <div ref={el => iconRef.current[i] = el}>
                                <Icon size={56} strokeWidth={1.5} className={styles.slideIcon} />
                            </div>
                            <h2 ref={el => h2Ref.current[i] = el} className={styles.titleMed}>{s.title}</h2>
                            <p ref={el => pRef.current[i] = el} className={styles.desc}>{s.desc}</p>
                            {s.highlight && (
                                <div ref={el => highlightRef.current[i] = el} className={styles.highlightBox}>
                                    <AlertTriangle size={18} />
                                    <span>{s.highlight}</span>
                                </div>
                            )}
                        </div>
                    );
                })}

                <button className={`${styles.btn} ${slide === 4 ? styles.btnFinish : ''}`} ref={btn} onClick={goNext}>
                    {slide === 4 ? 'Ver mi clave' : 'Siguiente'}
                    <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
}
