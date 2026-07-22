import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, Bell, Menu, ArrowLeft, QrCode, Palette, Store, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import useStore from "../../store";
import useAuth from "../../hooks/useAuth";
import { searchGlobal } from "../../api/search.api";
import Avatar from "../Avatar/Avatar";
import NotificationsDropdown from "../NotificationsDropdown/NotificationsDropdown";
import ShekaelLogo from "../ShekaelLogo/ShekaelLogo";
import BounceReveal from "../BounceReveal/BounceReveal";

import styles from "./TopBar.module.css";
import logoImg from "../../assets/personaje_1.12.png";

const FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'image', label: 'Imágenes' },
  { id: 'video', label: 'Videos' },
  { id: 'text', label: 'Texto' },
  { id: 'supported', label: 'Más apoyados' },
  { id: 'recent', label: 'Recientes' },
  { id: 'following', label: 'Siguiendo' },
];

export function TopBar({ onToggleSidebar, sidebarWidth = 0, isMobile = false }) {
  const { t } = useTranslation();
  const { user, setMyQRModalOpen, themeName, cycleTheme, activeFilter, setActiveFilter } = useStore();
  const { logout } = useAuth();
  const [query, setQuery] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const [suggestions, setSuggestions] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (!query.trim() || isMusicRoute) {
      setSuggestions(null);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(() => {
      searchGlobal(query.trim())
        .then(res => {
          setSuggestions(res.data);
          setShowSuggestions(true);
        })
        .catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isMusicRoute = location.pathname === '/music';

  const showBackBtn =
    location.pathname !== "/feed" && location.pathname !== "/";

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      setShowSuggestions(false);
      if (isMusicRoute) {
        navigate(`/music?q=${encodeURIComponent(query.trim())}`);
      } else {
        navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  const getSuggestionText = (p) => {
    if (p.type === 'video' && p.video_title) return p.video_title;
    const text = p.content || 'Publicación';
    if (text.includes('|||') || text.startsWith('http')) return 'Publicación con archivo adjunto';
    return text.length > 60 ? text.substring(0, 60) + '...' : text;
  };

  return (
    <>
    <header className={styles.topbar}>
      <div className={styles.topbarMain}>
        <div className={styles.left}>
          <button
            className={styles.hamburger}
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>
          <Link to="/feed" className={styles.logo}>
            <img src={logoImg} alt="Shekael" className={styles.logoImg} />
            <BounceReveal><ShekaelLogo size="sm" /></BounceReveal>
          </Link>
          {showBackBtn && (
            <button
              className={styles.backBtn}
              onClick={() => navigate(-1)}
              aria-label="Volver atrás"
            >
              <ArrowLeft size={20} />
            </button>
          )}
        </div>

        <div className={styles.searchWrap} ref={dropdownRef}>
          <form className={styles.searchContainer} onSubmit={handleSearch}>
            <div className={styles.searchBox}>
              <input
                ref={inputRef}
                type="text"
                className={styles.searchInput}
                placeholder={isMusicRoute ? 'Buscar canción…' : t('topbar.search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => {
                  if (query.trim() && suggestions) setShowSuggestions(true);
                }}
              />
              <button
                type="submit"
                className={styles.searchBtn}
                aria-label={t('topbar.search')}
              >
                <Search size={18} />
              </button>
            </div>
          </form>

          {showSuggestions && suggestions && (
            <div className={styles.suggestionsDropdown}>
              {suggestions.users?.length > 0 && (
                <>
                  <div className={styles.suggestionSection}>Usuarios</div>
                  {suggestions.users.slice(0, 3).map(u => (
                    <Link to={`/profile/${u.id}`} className={styles.suggestionItem} key={u.id} onClick={() => setShowSuggestions(false)}>
                      <Avatar avatarUrl={u.avatarUrl} name={u.displayName} size={32} />
                      <div className={styles.suggestionText}>
                        <span className={styles.suggestionTitle}>{u.displayName}</span>
                      </div>
                    </Link>
                  ))}
                </>
              )}

              {suggestions.posts?.length > 0 && (
                <>
                  <div className={styles.suggestionSection}>Publicaciones</div>
                  {suggestions.posts.slice(0, 3).map(p => (
                    <Link to={`/post/${p.id}`} className={styles.suggestionItem} key={p.id} onClick={() => setShowSuggestions(false)}>
                      <Search size={16} color="var(--color-text-muted)" />
                      <div className={styles.suggestionText}>
                        <span className={styles.suggestionTitle}>
                          {getSuggestionText(p)}
                        </span>
                        <span className={styles.suggestionSubtitle}>de {p.display_name}</span>
                      </div>
                    </Link>
                  ))}
                </>
              )}

              <Link to={`/search?q=${encodeURIComponent(query)}`} className={styles.viewAllBtn} onClick={() => setShowSuggestions(false)}>
                Ver todos los resultados para "{query}"
              </Link>
            </div>
          )}
        </div>

        <div className={styles.right}>
          <button
            className={styles.iconBtn}
            aria-label={t('topbar.myQR')}
            onClick={() => setMyQRModalOpen(true)}
          >
            <QrCode size={20} />
          </button>

          <button
            className={styles.iconBtn}
            aria-label="Cambiar tema"
            onClick={cycleTheme}
            title={`Tema: ${themeName}`}
          >
            <Palette size={20} />
          </button>

          <NotificationsDropdown />

          <div className={styles.userWrap}>
            <button
              className={styles.avatarBtn}
              onClick={() => setShowUserMenu((v) => !v)}
            >
              <Avatar
                avatarUrl={user?.avatarUrl}
                name={user?.displayName}
                size={32}
              />
            </button>

            {showUserMenu && (
              <div className={styles.userMenu}>
                <div className={styles.userMenuHeader}>
                  <Avatar
                    avatarUrl={user?.avatarUrl}
                    name={user?.displayName}
                    size={40}
                  />
                  <div>
                    <p className={styles.userMenuName}>{user?.displayName}</p>
                    <p className={styles.userMenuEmail}>{user?.email}</p>
                  </div>
                </div>
                <Link
                  to="/profile"
                  className={styles.userMenuItem}
                  onClick={() => setShowUserMenu(false)}
                >
                  Mi perfil
                </Link>
                <button
                  className={styles.userMenuItem}
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/business/register');
                  }}
                >
                  <Store size={16} /> Registrar comercio
                </button>
                {user?.is_admin && (
                  <Link
                    to="/admin/control-center"
                    className={styles.userMenuItem}
                    onClick={() => setShowUserMenu(false)}
                  >
                    Control Center
                  </Link>
                )}
                <button
                  className={styles.userMenuItem}
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/onboarding');
                  }}
                >
                  <BookOpen size={16} /> Tutorial
                </button>
                <button
                  className={`${styles.userMenuItem} ${styles.userMenuLogout}`}
                  onClick={() => {
                    logout();
                    setShowUserMenu(false);
                  }}
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {location.pathname === '/feed' && (
        <div className={styles.filterBar}>
          <div className={styles.filterTrack} style={{ paddingLeft: isMobile ? '1rem' : `calc(${sidebarWidth}px + 1.5rem)` }}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`${styles.filterChip} ${activeFilter === f.id ? styles.filterChipActive : ''}`}
                onClick={() => setActiveFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>

    </>
  );
}

export default TopBar;
