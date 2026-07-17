import { useState } from 'react';
import { Package, Image } from 'lucide-react';
import ProductPreview from './ProductPreview';
import styles from './ProductGrid.module.css';

export default function ProductGrid({ products = [] }) {
  const [previewProduct, setPreviewProduct] = useState(null);

  if (!products.length) {
    return (
      <div className={styles.empty}>
        <Package size={40} opacity={0.3} />
        <p>Este comercio aún no tiene productos</p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {products.map((product) => (
          <div
            key={product.id}
            className={styles.productCard}
            onMouseEnter={() => setPreviewProduct(product)}
            onMouseLeave={() => setPreviewProduct(null)}
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
            <div className={styles.productOverlay}>
              <span className={styles.productName}>{product.name}</span>
              <span className={styles.productPrice}>{product.price}</span>
              <span className={styles.productDesc}>{product.description}</span>
            </div>
          </div>
        ))}
      </div>

      {previewProduct && <ProductPreview product={previewProduct} />}
    </>
  );
}
