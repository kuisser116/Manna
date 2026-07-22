import styles from './ShekaelLogo.module.css';

export default function ShekaelLogo({ size = 'md', className = '' }) {
    return (
        <span className={`${styles.wordmark} ${styles[size]} ${className}`}>
            Shekael
        </span>
    );
}
ShekaelLogo.displayName = 'ShekaelLogo';
