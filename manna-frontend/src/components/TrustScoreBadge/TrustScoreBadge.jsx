import React from 'react';
import styles from './TrustScoreBadge.module.css';

const TrustScoreBadge = ({ score }) => {
  return (
    <div className={styles.badge}>
      <div className={styles.score}>
        {score}
      </div>
      <div className={styles.label}>Trust Score</div>
    </div>
  );
};

export default TrustScoreBadge;
