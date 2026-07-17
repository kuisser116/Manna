import { X, Image } from 'lucide-react';
import styles from './ProductPreview.module.css';

export default function ProductPreview({ product, onClose }) {
  if (!product) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>

        <div className={styles.imageSection}>
          {product.image ? (
            <img src={product.image} alt={product.name} className={styles.image} />
          ) : (
            <div className={styles.imagePlaceholder}>
              <Image size={48} opacity={0.3} />
            </div>
          )}
        </div>

        <div className={styles.info}>
          <div className={styles.header}>
            <h3 className={styles.name}>{product.name}</h3>
            <span className={styles.price}>{product.price}</span>
          </div>

          {product.category && (
            <span className={styles.category}>{product.category}</span>
          )}

          <p className={styles.description}>{product.description}</p>

          <button className={styles.contactBtn}>
            Contactar para comprar
          </button>
        </div>
      </div>
    </div>
  );
}
