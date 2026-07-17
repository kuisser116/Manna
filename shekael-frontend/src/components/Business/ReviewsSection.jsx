import { Star, ThumbsUp, Flag } from 'lucide-react';
import styles from './ReviewsSection.module.css';

export default function ReviewsSection({ reviews = [] }) {
  if (!reviews.length) {
    return (
      <div className={styles.empty}>
        <Star size={40} opacity={0.3} />
        <p>No hay reseñas aún</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {reviews.map((review) => (
        <div key={review.id} className={styles.reviewCard}>
          <div className={styles.reviewHeader}>
            <div className={styles.reviewer}>
              <div className={styles.avatarPlaceholder}>
                {review.user.charAt(0)}
              </div>
              <div>
                <span className={styles.reviewerName}>{review.user}</span>
                <span className={styles.reviewDate}>{review.date}</span>
              </div>
            </div>
            <div className={styles.stars}>
              {[1,2,3,4,5].map(s => (
                <Star
                  key={s}
                  size={14}
                  fill={s <= review.rating ? '#f59e0b' : 'none'}
                  color={s <= review.rating ? '#f59e0b' : 'var(--color-border, #444)'}
                />
              ))}
            </div>
          </div>
          <p className={styles.reviewText}>{review.text}</p>
          <div className={styles.reviewActions}>
            <button className={styles.reviewAction}><ThumbsUp size={14} /> Útil</button>
            <button className={styles.reviewAction}><Flag size={14} /> Reportar</button>
          </div>
        </div>
      ))}
    </div>
  );
}
