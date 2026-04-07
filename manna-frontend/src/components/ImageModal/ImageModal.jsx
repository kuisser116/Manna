import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import styles from './ImageModal.module.css';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.4;

export default function ImageModal({ src, alt = 'Imagen', onClose }) {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef(null);
    const imgRef = useRef(null);

    // Close on Escape key
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Prevent body scroll while modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const handleWheel = useCallback((e) => {
        e.preventDefault();
        setScale((prev) => {
            const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
            const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
            // Reset position when zooming back to 1
            if (next === MIN_ZOOM) setPosition({ x: 0, y: 0 });
            return next;
        });
    }, []);

    // Attach wheel listener with { passive: false } so we can preventDefault
    useEffect(() => {
        const el = imgRef.current?.parentElement;
        if (!el) return;
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

    const handleMouseDown = (e) => {
        if (scale <= 1) return;
        e.preventDefault();
        setIsDragging(true);
        dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };

    const handleMouseMove = (e) => {
        if (!isDragging || !dragStart.current) return;
        setPosition({
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y,
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        dragStart.current = null;
    };

    const handleZoomIn = () => {
        setScale((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
    };

    const handleZoomOut = () => {
        setScale((prev) => {
            const next = Math.max(MIN_ZOOM, prev - ZOOM_STEP);
            if (next === MIN_ZOOM) setPosition({ x: 0, y: 0 });
            return next;
        });
    };

    const handleReset = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    return (
        <AnimatePresence>
            <motion.div
                className={styles.overlay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={onClose}
            >
                {/* Controls */}
                <div className={styles.controls} onClick={(e) => e.stopPropagation()}>
                    <button
                        className={styles.controlBtn}
                        onClick={handleZoomOut}
                        disabled={scale <= MIN_ZOOM}
                        title="Alejar"
                    >
                        <ZoomOut size={20} />
                    </button>
                    <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
                    <button
                        className={styles.controlBtn}
                        onClick={handleZoomIn}
                        disabled={scale >= MAX_ZOOM}
                        title="Acercar"
                    >
                        <ZoomIn size={20} />
                    </button>
                    <button
                        className={styles.controlBtn}
                        onClick={handleReset}
                        disabled={scale === 1}
                        title="Restablecer"
                    >
                        <Maximize2 size={20} />
                    </button>
                    <button className={`${styles.controlBtn} ${styles.closeBtn}`} onClick={onClose} title="Cerrar">
                        <X size={20} />
                    </button>
                </div>

                {/* Image container */}
                <div
                    className={styles.imgContainer}
                    onClick={(e) => e.stopPropagation()}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <img
                        ref={imgRef}
                        src={src}
                        alt={alt}
                        className={styles.img}
                        style={{
                            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                            transition: isDragging ? 'none' : 'transform 0.15s ease',
                        }}
                        onMouseDown={handleMouseDown}
                        draggable={false}
                        onClick={scale === 1 ? handleZoomIn : undefined}
                    />
                </div>

                {/* Hint */}
                {scale === 1 && (
                    <p className={styles.hint}>Scroll o click para acercar · Esc para cerrar</p>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
