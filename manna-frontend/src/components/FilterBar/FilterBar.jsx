import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './FilterBar.module.css';

const FILTERS = [
    { id: 'all', label: 'Todo' },
    { id: 'image', label: 'Imágenes' },
    { id: 'video', label: 'Videos' },
    { id: 'text', label: 'Texto' },
    { id: 'supported', label: 'Más apoyados' },
    { id: 'recent', label: 'Recientes' },
    { id: 'following', label: 'Siguiendo' },
];

export default function FilterBar({ active, onChange }) {
    const scrollRef = useRef(null);
    const [showLeft, setShowLeft] = useState(false);
    const [showRight, setShowRight] = useState(false);
    const [isOverflowing, setIsOverflowing] = useState(false);

    const checkScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        
        const hasOverflow = el.scrollWidth > el.clientWidth;
        setIsOverflowing(hasOverflow);
        
        if (hasOverflow) {
            setShowLeft(el.scrollLeft > 10);
            setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
        } else {
            setShowLeft(false);
            setShowRight(false);
        }
    };

    const scroll = (dir) => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollBy({ left: dir * 300, behavior: 'smooth' });
    };

    const handleScroll = () => {
        checkScroll();
    };

    useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        // Pequeño delay para asegurar que el DOM se ha renderizado completamente
        const timer = setTimeout(checkScroll, 100);
        return () => {
            window.removeEventListener('resize', checkScroll);
            clearTimeout(timer);
        };
    }, [active]);

    return (
        <div className={styles.wrapper}>
            <div className={styles.container}>
                {showLeft && (
                    <button className={`${styles.arrow} ${styles.arrowLeft}`} onClick={() => scroll(-1)} aria-label="Scroll izquierda">
                        <ChevronLeft size={18} />
                    </button>
                )}

                <div 
                    className={`${styles.track} ${!isOverflowing ? styles.trackCentered : ''}`} 
                    ref={scrollRef} 
                    onScroll={handleScroll}
                >
                    {FILTERS.map((f) => (
                        <button
                            key={f.id}
                            className={`${styles.chip} ${active === f.id ? styles.chipActive : ''}`}
                            onClick={() => onChange(f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {showRight && (
                    <button className={`${styles.arrow} ${styles.arrowRight}`} onClick={() => scroll(1)} aria-label="Scroll derecha">
                        <ChevronRight size={18} />
                    </button>
                )}
            </div>
        </div>
    );
}
