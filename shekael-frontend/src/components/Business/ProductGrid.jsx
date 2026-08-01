import { useState, useRef, useCallback } from 'react';
import { Package, Image } from 'lucide-react';
import ProductPreview from './ProductPreview';
import styles from './ProductGrid.module.css';

export default function ProductGrid({ products = [] }) {
  const [previewProduct, setPreviewProduct] = useState(null);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef(null);

  const openPreview = useCallback((product) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setClosing(false);
    setPreviewProduct(product);
  }, []);

  const startClose = useCallback(() => {
    if (!previewProduct) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setClosing(true);
  }, [previewProduct]);

  const finishClose = useCallback(() => {
    setPreviewProduct(null);
    setClosing(false);
  }, []);

  const keepOpen = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setClosing(false);
  }, []);

  if (!products.length) {
    return (
      <div className={styles.empty}>
        <Package size={40} opacity={0.3} />
        <p>Este comercio aún no tiene productos</p>
      </div>
    );
  }

  return (
    <div
      className={styles.gridWrapper}
      onMouseLeave={startClose}
      onMouseEnter={keepOpen}
    >
      <div className={styles.grid}>
        {products.map((product) => (
          <div
            key={product.id}
            className={styles.productCard}
            onMouseEnter={() => openPreview(product)}
          >
            <div className={styles.productImage}>
              {product.image ? (
                <img src={product.image} alt={product.name} />
              ) : (
                <div className={styles.imagePlaceholder}>
                  <Image size={28} opacity={0.3} />
                </div>
              )}
            </div>
            <div className={styles.productLabel}>
              <span className={styles.labelName}>{product.name}</span>
              <span className={styles.labelPrice}>{product.price}</span>
            </div>
          </div>
        ))}
      </div>

      {previewProduct && (
        <ProductPreview
          key={previewProduct.id}
          product={previewProduct}
          closing={closing}
          onClose={finishClose}
        />
      )}
    </div>
  );
}
