import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Image, Tag } from 'lucide-react';
import styles from './ProductPreview.module.css';

export default function ProductPreview({ product, closing, onClose }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!closing) {
      gsap.fromTo(
        modalRef.current,
        { scale: 0.88, y: 24, autoAlpha: 0 },
        { scale: 1, y: 0, autoAlpha: 1, duration: 0.35, ease: 'back.out(1.7)' }
      );
    }
  }, []);

  useEffect(() => {
    if (!closing) return;
    gsap.to(modalRef.current, {
      scale: 0.92,
      y: 16,
      autoAlpha: 0,
      duration: 0.15,
      ease: 'power2.in',
      onComplete: onClose,
    });
  }, [closing]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.modal} ref={modalRef}>
        <div className={styles.imageCol}>
          {product.image ? (
            <img src={product.image} alt={product.name} className={styles.image} />
          ) : (
            <div className={styles.imagePlaceholder}>
              <Image size={40} opacity={0.3} />
            </div>
          )}
        </div>
        <div className={styles.infoCol}>
          <div>
            <h3 className={styles.name}>{product.name}</h3>
            <span className={styles.price}>{product.price}</span>
            <p className={styles.description}>{product.description}</p>
          </div>
          {product.category && (
            <span className={styles.category}>
              <Tag size={13} /> {product.category}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
