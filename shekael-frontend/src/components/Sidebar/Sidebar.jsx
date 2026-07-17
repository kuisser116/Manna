import { NavLink, useNavigate, Link } from 'react-router-dom';
import { Home, Search, QrCode, Bell, User, PlusSquare, MessageCircle, MapPin, Music } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './Sidebar.module.css';
import useStore from '../../store';

export function Sidebar({ collapsed = false, hidden = false, isMobile = false, onClose }) {
    const { t, i18n } = useTranslation();
    const { user, setQrScannerOpen } = useStore();
    const navigate = useNavigate();

    const handleNav = (to) => {
        if (isMobile && onClose) onClose();
        navigate(to);
    };

    const sidebarContent = (
        <div className={`${styles.nav} ${collapsed ? styles.collapsed : styles.expanded} ${hidden ? styles.hidden : ''} ${isMobile ? styles.mobileNav : ''}`}>
            <div className={styles.itemsContainer}>
                {/* Home */}
                <button
                    className={styles.iconBtn}
                    title={t('sidebar.feed', 'Inicio')}
                    data-label={t('sidebar.feed', 'Inicio')}
                    onClick={() => handleNav('/feed')}
                >
                    <Home size={24} strokeWidth={2} />
                </button>

                {/* Create Post Button */}
                <button
                    className={styles.iconBtn}
                    title={t('sidebar.create', 'Crear publicación')}
                    data-label={t('sidebar.create', 'Crear publicación')}
                    onClick={() => handleNav('/create')}
                >
                    <PlusSquare size={24} strokeWidth={2} />
                </button>

                {/* QR Button */}
                <button
                    className={styles.iconBtn}
                    onClick={() => {
                        if (isMobile && onClose) onClose();
                        setQrScannerOpen(true);
                    }}
                    aria-label="Mi QR"
                    title={t('sidebar.qr', 'Mi QR')}
                    data-label={t('sidebar.qr', 'Mi QR')}
                >
                    <QrCode size={24} strokeWidth={2} />
                </button>

                {/* Explorar */}
                <button
                    className={styles.iconBtn}
                    title="Explorar"
                    data-label="Explorar"
                    onClick={() => handleNav('/explorar')}
                >
                    <MapPin size={24} strokeWidth={2} />
                </button>

                {/* Music */}
                <button
                    className={styles.iconBtn}
                    title="Música"
                    data-label="Música"
                    onClick={() => handleNav('/music')}
                >
                    <Music size={24} strokeWidth={2} />
                </button>

                {/* Chat */}
                <button
                    className={styles.iconBtn}
                    title={t('sidebar.chat', 'Chat')}
                    data-label={t('sidebar.chat', 'Chat')}
                    onClick={() => handleNav('/chat')}
                >
                    <MessageCircle size={24} strokeWidth={2} />
                </button>

                {/* User Avatar */}
                <button
                    className={styles.iconBtn}
                    title={t('sidebar.profile', 'Perfil')}
                    data-label={t('sidebar.profile', 'Perfil')}
                    onClick={() => handleNav('/profile')}
                >
                    <User size={24} strokeWidth={2} />
                </button>
            </div>
        </div>
    );

    if (isMobile) {
        return (
            <>
                {/* Backdrop */}
                {!collapsed && (
                    <div className={styles.mobileOverlay} onClick={onClose} />
                )}
                {sidebarContent}
            </>
        );
    }

    return sidebarContent;
}

export default Sidebar;
