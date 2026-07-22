import { useRef, useEffect } from 'react';
import gsap from 'gsap';

/**
 * BounceReveal — Wraps cualquier elemento y lo anima al aparecer
 * con el mismo elastic bounce del tutorial (scale 0.4→1, rotate -8→0).
 *
 * Props:
 * - children: contenido a animar
 * - as: tag HTML del wrapper (default 'span')
 * - className: clases adicionales
 * - delay: segundos de retraso antes de animar (default 0)
 * - onViewport: si true, espera a que el elemento esté en viewport (default false)
 * - disabled: si true, no anima
 * - from: objeto GSAP personalizado para estado inicial (opcional)
 * - to: objeto GSAP personalizado para estado final (opcional)
 */
export default function BounceReveal({
    children,
    as: Tag = 'span',
    className = '',
    delay = 0,
    onViewport = false,
    disabled = false,
    from,
    to,
}) {
    const elRef = useRef(null);
    const done = useRef(false);

    useEffect(() => {
        if (disabled) return;
        const el = elRef.current;
        if (!el) return;

        const fromState = from || { autoAlpha: 0, scale: 0.4, rotate: -8 };
        const toState = to || {
            autoAlpha: 1,
            scale: 1,
            rotate: 0,
            duration: 0.8,
            delay,
            ease: 'elastic.out(1, 0.5)',
        };

        const play = () => {
            if (done.current) return;
            done.current = true;
            gsap.fromTo(el, fromState, toState);
        };

        if (onViewport) {
            const observer = new IntersectionObserver(
                ([entry]) => {
                    if (entry.isIntersecting) {
                        play();
                        observer.disconnect();
                    }
                },
                { threshold: 0.3 }
            );
            observer.observe(el);
            return () => observer.disconnect();
        } else {
            play();
        }
    }, [delay, onViewport, disabled, from, to]);

    return (
        <Tag ref={elRef} className={className}>
            {children}
        </Tag>
    );
}
