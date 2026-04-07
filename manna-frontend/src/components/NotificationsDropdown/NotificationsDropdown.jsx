import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getNotifications, getUnreadNotificationsCount, markNotificationAsRead, markAllNotificationsAsRead } from '../../api/notifications.api';
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
    const { user } = useStore();
    const navigate = useNavigate();

    useEffect(() => {
        if (user) {
            fetchUnreadCount();
            const interval = setInterval(() => {
                fetchUnreadCount();
            }, 30000); // 30 seconds
            return () => clearInterval(interval);
        }
    }, [user]);

    useEffect(() => {
        if (isOpen && notifications.length === 0) {
            fetchNotifications(0);
        }
    }, [isOpen]);

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

    const handleNotificationClick = async (notif) => {
        // Redirigir si tiene postId
        if (notif.post_id) {
            navigate(`/post/${notif.post_id}`);
            setIsOpen(false);
        } else if (notif.type === 'ad_pending_review') {
            navigate('/admin/ads');
            setIsOpen(false);
        } else if (['ad_approved', 'ad_rejected'].includes(notif.type)) {
            navigate('/ads-studio'); // O a la pestaña de "Mis Campañas"
            setIsOpen(false);
        }

        // Marcar como leída si no lo está
        if (!notif.is_read) {
            try {
                await markNotificationAsRead(notif.id);
                setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
                setUnreadCount(prev => Math.max(0, prev - 1));
            } catch (err) {
                console.error('Error marking as read:', err);
            }
        }
    };

    const handleMarkAsRead = async (id, isRead) => {
        if (isRead) return;
        try {
            await markNotificationAsRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error('Error marking as read:', err);
        }
    };

    const handleMarkAllAsRead = async (e) => {
        e.stopPropagation();
        try {
            await markAllNotificationsAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error('Error marking all as read:', err);
        }
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
            case 'ad_rejected': return 'ha revisado tu campaña y no ha podido ser aprobada';
            case 'ad_approved': return 'ha aprobado tu campaña publicitaria';
            case 'ad_pending_review': return 'ha enviado una nueva campaña para revisión';
            default: return 'ha interactuado con tu contenido';
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
                {unreadCount > 0 && (
                    <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
            </button>

            {isOpen && (
                <div className={styles.dropdown}>
                    <div className={styles.header}>
                        <h4>{t('notifications.title')}</h4>
                        {unreadCount > 0 && (
                            <button className={styles.markAllBtn} onClick={handleMarkAllAsRead}>
                                <CheckCheck size={16} />
                                {t('notifications.markAllRead')}
                            </button>
                        )}
                    </div>
                    
                    <div className={styles.list}>
                        {notifications.length === 0 && !loading && (
                            <div className={styles.empty}>{t('notifications.noNotifications')}</div>
                        )}
                        
                        {notifications.map((notif) => (
                            <div 
                                key={notif.id} 
                                className={`${styles.item} ${notif.is_read ? '' : styles.unread}`}
                                onClick={() => handleNotificationClick(notif)}
                            >
                                <Avatar avatarUrl={notif.actor_avatar} name={notif.actor_name} size={40} />
                                <div className={styles.content}>
                                    <p>
                                        <strong>{notif.actor_name}</strong> {getNotificationText(notif.type)}.
                                    </p>
                                    <span className={styles.time}>
                                        {new Date(notif.created_at).toLocaleDateString()} {new Date(notif.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                </div>
                                {!notif.is_read && <span className={styles.unreadDot} />}
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
