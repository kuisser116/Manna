import React from 'react';
import styles from './VotingButtons.module.css';

const VotingButtons = ({ onVote, onSkip, loading }) => {
  return (
    <div className={styles.container}>
      <button 
        className={`${styles.btn} ${styles.btnApprove}`}
        onClick={() => onVote('approve')}
        disabled={loading}
      >
        Aprobar
      </button>
      
      <button 
        className={`${styles.btn} ${styles.btnRemove}`}
        onClick={() => onVote('remove')}
        disabled={loading}
      >
        Eliminar
      </button>
      
      <button 
        className={`${styles.btn} ${styles.btnSkip}`}
        onClick={onSkip}
        disabled={loading}
      >
        Saltar caso
      </button>
    </div>
  );
};

export default VotingButtons;
