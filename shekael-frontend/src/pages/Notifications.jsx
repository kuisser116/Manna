import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronLeft, ChevronDown } from 'lucide-react';
import { getNotifications, markAllNotificationsAsRead } from '../api/notifications.api';
import Avatar from '../components/Avatar/Avatar';
import useStore from '../store';
import styles from './Notifications.module.css';

/**
 * Notifications
 * Página completa de notificaciones: todas, agrupadas por fecha
 * ("Hoy", "Ayer", "3 de agosto"), las más recientes arriba, paginadas.
 */
function groupLabel(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(today) - startOfDay(d)) / 86400000);

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return d.toLocaleDateString('es-MX', { weekday: 'long' });
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getNotificationText(type) {
    switch (type) {
        case 'like': return 'le gustó tu publicación';
        case 'comment': return 'comentó tu publicación';
        case 'support': return 'apoyó tu publicación';
        case 'save': return 'guardó tu publicación';
        case 'follow': return 'comenzó a seguirte';
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
}

export default function Notifications() {
    const navigate = useNavigate();
    const { user } = useStore();
    const [notifications, setNotifications] = useState([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const fetchPage = useCallback(async (pageToFetch, append = false) => {
        if (append) setLoadingMore(true); else setLoading(true);
        try {
            const { data } = await getNotifications(pageToFetch);
            setNotifications(prev => {
                if (!append) return data.notifications || [];
                const existing = new Set(prev.map(n => n.id));
                const fresh = (data.notifications || []).filter(n => !existing.has(n.id));
                return [...prev, ...fresh];
            });
            setHasMore(data.hasMore);
            setPage(data.page);
        } catch (err) {
            console.error('Error fetching notifications:', err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        fetchPage(0);
        if (user) {
            markAllNotificationsAsRead().catch(() => {});
        }
    }, [user, fetchPage]);

    // Agrupar por fecha (las más recientes primero, ya vienen así del API)
    const groups = [];
    const groupMap = new Map();
    for (const n of notifications) {
        const label = groupLabel(n.created_at);
        if (!groupMap.has(label)) {
            groupMap.set(label, []);
            groups.push({ label, items: groupMap.get(label) });
        }
        groupMap.get(label).push(n);
    }

    const handleClick = (notif) => {
        const type = notif.type || '';
        if (type.startsWith('business_registered:')) {
            const bizId = type.split(':')[1];
            if (bizId) navigate(`/business/${bizId}`);
        } else if (type === 'message' && notif.post_id) {
            navigate(`/chat?conv=${notif.post_id}`);
        } else if (notif.post_id) {
            navigate(`/post/${notif.post_id}`);
        }
    };

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <button className={styles.backBtn} onClick={() => navigate(-1)} aria-label="Volver">
                    <ChevronLeft size={22} />
                </button>
                <div className={styles.headerTitle}>
                    <Bell size={18} />
                    <h1>Notificaciones</h1>
                </div>
            </header>

            <div className={styles.content}>
                {loading ? (
                    <div className={styles.loadingSpinner} />
                ) : notifications.length === 0 ? (
                    <div className={styles.empty}>
                        <Bell size={36} />
                        <p>No tienes notificaciones todavía.</p>
                    </div>
                ) : (
                    groups.map((group) => (
                        <div key={group.label} className={styles.group}>
                            <h2 className={styles.groupLabel}>{group.label}</h2>
                            <div className={styles.groupList}>
                                {group.items.map((notif) => {
                                    const isSystem = notif.type === 'business_registered'
                                        || notif.type === 'business_registering'
                                        || (notif.type && notif.type.startsWith('business_registered:'));
                                    return (
                                        <div
                                            key={notif.id}
                                            className={`${styles.item} ${!notif.is_read ? styles.unread : ''}`}
                                            onClick={() => handleClick(notif)}
                                        >
                                            <Avatar avatarUrl={notif.actor_avatar} name={notif.actor_name} size={40} />
                                            <div className={styles.content}>
                                                <p>
                                                    {isSystem ? (
                                                        <span className={styles.systemText}>{getNotificationText(notif.type)}</span>
                                                    ) : (
                                                        <>
                                                            <strong>{notif.actor_name}</strong> {getNotificationText(notif.type)}.
                                                        </>
                                                    )}
                                                </p>
                                                <span className={styles.time}>
                                                    {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            {!notif.is_read && <span className={styles.unreadDot} />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}

                {hasMore && (
                    <button className={styles.loadMoreBtn} onClick={() => fetchPage(page + 1, true)} disabled={loadingMore}>
                        {loadingMore ? 'Cargando...' : 'Cargar más'}
                        <ChevronDown size={15} />
                    </button>
                )}
            </div>
        </div>
    );
}
