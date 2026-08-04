import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Video, Image as ImageIcon, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getNotifications, getUnreadNotificationsCount, markAllNotificationsAsRead } from '../../api/notifications.api';
import Avatar from '../Avatar/Avatar';
import useStore from '../../store';
import styles from './NotificationsDropdown.module.css';

export function NotificationsDropdown() {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    
    const dropdownRef = useRef(null);
    const { user, uploads } = useStore();
    const navigate = useNavigate();

    // Polling de contador de no leídas
    useEffect(() => {
        if (user) {
            fetchUnreadCount();
            const interval = setInterval(fetchUnreadCount, 10000);
            return () => clearInterval(interval);
        }
    }, [user]);

    // Refresco inmediato cuando la app lo pide (ej. proceso de registro de comercio)
    useEffect(() => {
        const handleRefresh = () => {
            fetchUnreadCount();
            fetchNotifications(0);
        };
        window.addEventListener('shekael:notif-refresh', handleRefresh);
        return () => window.removeEventListener('shekael:notif-refresh', handleRefresh);
    }, []);

    // Al abrir: cargar notis + auto-marcar todo como leído
    useEffect(() => {
        if (isOpen) {
            if (notifications.length === 0) {
                fetchNotifications(0);
            }
            if (unreadCount > 0) {
                markAllNotificationsAsRead()
                    .then(() => {
                        setUnreadCount(0);
                        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
                    })
                    .catch(console.error);
            }
        }
    }, [isOpen]);

    // Cerrar al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchUnreadCount = async () => {
        try {
            const { data } = await getUnreadNotificationsCount();
            setUnreadCount(data.unreadCount || 0);
        } catch (err) {
            console.error('Error fetching unread count:', err);
        }
    };

    const fetchNotifications = async (pageToFetch = 0) => {
        setLoading(true);
        try {
            const { data } = await getNotifications(pageToFetch);
            if (pageToFetch === 0) {
                setNotifications(data.notifications);
            } else {
                setNotifications(prev => [...prev, ...data.notifications]);
            }
            setHasMore(data.hasMore);
            setPage(data.page);
        } catch (err) {
            console.error('Error fetching notifications:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleNotificationClick = (notif) => {
        const type = notif.type || '';
        if (type.startsWith('business_registered:')) {
            const bizId = type.split(':')[1];
            if (bizId) navigate(`/business/${bizId}`);
        } else if (type === 'message' && notif.post_id) {
            navigate(`/chat?conv=${notif.post_id}`);
        } else if (notif.post_id) {
            navigate(`/post/${notif.post_id}`);
        }
        setIsOpen(false);
    };

    const loadMore = () => {
        if (!loading && hasMore) {
            fetchNotifications(page + 1);
        }
    };

    const getNotificationText = (type) => {
        switch (type) {
            case 'like': return t('notifications.likedPost');
            case 'comment': return t('notifications.commentedPost');
            case 'support': return t('notifications.supportedPost');
            case 'save': return t('notifications.savedPost');
            case 'follow': return t('notifications.followedYou');
            case 'message': return 'te envió un mensaje';
            case 'ad_rejected': return 'ha revisado tu campaña y no ha podido ser aprobada';
            case 'ad_approved': return 'ha aprobado tu campaña publicitaria';
            case 'ad_pending_review': return 'ha enviado una nueva campaña para revisión';
            case 'business_registered': return 'Comercio registrado correctamente — da click para ver';
            case 'business_registering': return 'Registrando comercio, por favor espera...';
            default:
                if (type && type.startsWith('business_registered:')) return 'Comercio registrado correctamente — da click para ver';
                return 'ha interactuado con tu contenido';
        }
    };

    return (
        <div className={styles.container} ref={dropdownRef}>
            <button
                className={styles.bellBtn}
                aria-label={t('notifications.title')}
                onClick={() => setIsOpen(!isOpen)}
            >
                <Bell size={20} />
                {uploads.some(u => u.status === 'uploading') && (
                    <span className={styles.uploadBadge} />
                )}
                {unreadCount > 0 && (
                    <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
            </button>

            {isOpen && (
                <div className={styles.dropdown}>
                    <div className={styles.header}>
                        <h4>{t('notifications.title')}</h4>
                    </div>

                    <div className={styles.list}>
                        {uploads.length > 0 && (
                            <div className={styles.uploadsBlock}>
                                {uploads.map((u) => {
                                    const done = u.status === 'done';
                                    const failed = u.status === 'error';
                                    const Icon = u.kind === 'video' ? Video : ImageIcon;
                                    return (
                                        <div key={u.id} className={`${styles.uploadItem} ${done ? styles.uploadItemDone : ''} ${failed ? styles.uploadItemError : ''}`}>
                                            <Icon size={16} className={styles.uploadIcon} />
                                            <div className={styles.uploadInfo}>
                                                <span className={styles.uploadLabel}>
                                                    {done
                                                        ? (u.kind === 'video' ? 'Video publicado' : 'Imagen publicada')
                                                        : failed
                                                            ? 'Subida fallida'
                                                            : (u.kind === 'video' ? 'Video subiendo' : 'Imagen subiendo')}
                                                </span>
                                                {!done && !failed && (
                                                    <div className={styles.uploadTrack}>
                                                        <div className={styles.uploadFill} style={{ width: `${u.progress}%` }} />
                                                    </div>
                                                )}
                                            </div>
                                            <span className={styles.uploadPct}>
                                                {done ? <CheckCircle2 size={14} /> : failed ? <AlertTriangle size={14} /> : `${u.progress}%`}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {notifications.length === 0 && !loading && (
                            <div className={styles.empty}>{t('notifications.noNotifications')}</div>
                        )}

                        {notifications.map((notif) => (
                            <div
                                key={notif.id}
                                className={styles.item}
                                onClick={() => handleNotificationClick(notif)}
                            >
                                <Avatar avatarUrl={notif.actor_avatar} name={notif.actor_name} size={40} />
                                <div className={styles.content}>
                                    <p>
                                        {notif.type === 'business_registered' || notif.type === 'business_registering' || (notif.type && notif.type.startsWith('business_registered:')) ? (
                                            <span className={styles.systemText}>{getNotificationText(notif.type)}</span>
                                        ) : (
                                            <>
                                                <strong>{notif.actor_name}</strong> {getNotificationText(notif.type)}.
                                            </>
                                        )}
                                    </p>
                                    <span className={styles.time}>
                                        {new Date(notif.created_at).toLocaleDateString()} {new Date(notif.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                </div>
                            </div>
                        ))}

                        {hasMore && (
                            <button className={styles.loadMoreBtn} onClick={loadMore} disabled={loading}>
                                {loading ? t('common.loading') : t('notifications.loadMore')}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default NotificationsDropdown;
