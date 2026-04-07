import styles from './Avatar.module.css';

const sizeMap = {
    sm: 32,
    md: 40,
    lg: 48,
    xl: 56,
};

export default function Avatar({ avatarUrl, name, size = 32, className = '' }) {
    const initials = (name || 'U').slice(0, 2).toUpperCase();
    const hue = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

    const sizeInPx = typeof size === 'string' ? sizeMap[size] || 32 : size;

    const containerStyle = {
        width: `${sizeInPx}px`,
        height: `${sizeInPx}px`,
        fontSize: `${sizeInPx * 0.38}px`,
    };

    if (avatarUrl) {
        return (
            <div
                className={`${styles.avatar} ${className}`}
                style={containerStyle}
            >
                <img
                    src={avatarUrl}
                    alt={name}
                    className={styles.avatarImage}
                />
            </div>
        );
    }

    return (
        <div
            className={`${styles.avatar} ${className}`}
            style={{
                ...containerStyle,
                backgroundColor: `hsl(${hue}, 50%, 30%)`,
            }}
        >
            {initials}
        </div>
    );
}
