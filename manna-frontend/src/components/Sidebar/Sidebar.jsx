import { NavLink, useNavigate, Link } from 'react-router-dom';
import { Home, Search, QrCode, Bell, User, PlusSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './Sidebar.module.css';
import useStore from '../../store';

export function Sidebar({ collapsed = false, hidden = false }) {
    const { t, i18n } = useTranslation();
    const { user, setQrScannerOpen } = useStore();
    const navigate = useNavigate();



    const changeLang = (lang) => {
        i18n.changeLanguage(lang);
    };

    return (
        <aside className={`${styles.nav} ${collapsed ? styles.collapsed : styles.expanded} ${hidden ? styles.hidden : ''}`}>
            <div className={styles.itemsContainer}>
                {/* Home */}
                <Link
                    to="/feed"
                    className={styles.iconBtn}
                    title={t('sidebar.feed', 'Inicio')}
                >
                    <Home size={24} strokeWidth={2} />
                </Link>

                {/* Create Post Button */}
                <Link
                    to="/create"
                    className={styles.iconBtn}
                    title={t('sidebar.create', 'Crear publicación')}
                >
                    <PlusSquare size={24} strokeWidth={2} />
                </Link>

                {/* QR Button */}
                <button
                    className={styles.iconBtn}
                    onClick={() => setQrScannerOpen(true)}
                    aria-label="Mi QR"
                    title={t('sidebar.qr', 'Mi QR')}
                >
                    <QrCode size={24} strokeWidth={2} />
                </button>

                {/* User Avatar */}
                <Link
                    to="/profile"
                    className={styles.iconBtn}
                    title={t('sidebar.profile', 'Perfil')}
                >
                    <User size={24} strokeWidth={2} />
                </Link>
            </div>
        </aside>
    );
}

export default Sidebar;
