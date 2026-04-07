import React from 'react';
import styles from './AdPreview.module.css';

/**
 * AdPreview — muestra un mock del feed con el anuncio del anunciante insertado.
 * Permite ver exactamente cómo se verá antes de pagar.
 */
const AdPreview = ({ title, mediaUrl, mediaType, altText }) => {
    const hasMedia = mediaUrl && (mediaUrl.startsWith('http') || mediaUrl.startsWith('blob:') || mediaUrl.startsWith('data:'));

    return (
        <div className={styles.wrapper}>
            <p className={styles.label}>📱 Vista previa en el feed</p>

            <div className={styles.feedMock}>
                {/* Post fantasma antes */}
                <div className={styles.ghostPost}>
                    <div className={styles.ghostAvatar} />
                    <div className={styles.ghostLines}>
                        <div className={styles.ghostLine} style={{ width: '60%' }} />
                        <div className={styles.ghostLine} style={{ width: '90%' }} />
                        <div className={styles.ghostLine} style={{ width: '45%' }} />
                    </div>
                </div>

                {/* El anuncio real */}
                <div className={styles.adCard}>
                    <div className={styles.adBadge}>📢 Anuncio · Patrocinado</div>

                    <div className={styles.adMediaWrap}>
                        {hasMedia ? (
                            mediaType === 'video' ? (
                                <video
                                    src={mediaUrl}
                                    className={styles.adMedia}
                                    muted
                                    autoPlay
                                    loop
                                    playsInline
                                />
                            ) : (
                                <img
                                    src={mediaUrl}
                                    alt={altText || title || 'Vista previa del anuncio'}
                                    className={styles.adMedia}
                                />
                            )
                        ) : (
                            <div className={styles.adMediaPlaceholder}>
                                <span>🖼️</span>
                                <p>Tu imagen/video aparecerá aquí</p>
                            </div>
                        )}
                    </div>

                    <div className={styles.adBody}>
                        <p className={styles.adTitle}>{title || 'Título de tu anuncio'}</p>
                        <div className={styles.adTimer}>⏱ Ver 10s para ganar recompensa</div>
                    </div>
                </div>

                {/* Post fantasma después */}
                <div className={styles.ghostPost}>
                    <div className={styles.ghostAvatar} />
                    <div className={styles.ghostLines}>
                        <div className={styles.ghostLine} style={{ width: '75%' }} />
                        <div className={styles.ghostLine} style={{ width: '55%' }} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdPreview;
