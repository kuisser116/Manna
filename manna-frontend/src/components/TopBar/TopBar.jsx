import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, Bell, Menu, X, ArrowLeft, QrCode, Sun, Moon, LayoutGrid, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import useStore from "../../store";
import useAuth from "../../hooks/useAuth";
import { searchGlobal } from "../../api/search.api";
import Avatar from "../Avatar/Avatar";
import NotificationsDropdown from "../NotificationsDropdown/NotificationsDropdown";
import LanguageSelector from "../LanguageSelector/LanguageSelector";
import styles from "./TopBar.module.css";
import logoImg from "../../assets/personaje_1.12.png";

export function TopBar({ onToggleSidebar }) {
  const { t } = useTranslation();
  const { user, setMyQRModalOpen, isDarkMode, toggleDarkMode } = useStore();
  const { logout } = useAuth();
  const [query, setQuery] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const [suggestions, setSuggestions] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const isProfileRoute = location.pathname.startsWith('/profile');

  // Cargar sugerencias
  useEffect(() => {
    if (!query.trim()) {
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

  // Click outside
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

  // Solo mostrar el botón de regresar si no estamos en feed ni en la portada
  const showBackBtn =
    location.pathname !== "/feed" && location.pathname !== "/";

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      setShowSuggestions(false);
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const getSuggestionText = (p) => {
    if (p.type === 'video' && p.video_title) return p.video_title;
    const text = p.content || 'Publicación';
    if (text.includes('|||') || text.startsWith('http')) return 'Publicación con archivo adjunto';
    return text.length > 60 ? text.substring(0, 60) + '...' : text;
  };

  const isProfileMinimal = isProfileRoute;

  return (
    <header className={styles.topbar} data-profile-route={isProfileRoute ? 'true' : 'false'}>
      {/* Izquierda: hamburger + logo */}
      <div className={styles.left}>
        {isProfileMinimal ? null : (
          <button
            className={styles.hamburger}
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
          >
            <Menu size={22} />
          </button>
        )}
        <Link to="/feed" className={styles.logo}>
          M
        </Link>
        {!isProfileMinimal && showBackBtn && (
          <button
            className={styles.backBtn}
            onClick={() => navigate(-1)}
            aria-label="Volver atrás"
          >
            <ArrowLeft size={22} />
          </button>
        )}
      </div>

      {/* Centro: barra de búsqueda con dropdown */}
      <div className={`${styles.searchWrap} ${isProfileMinimal ? styles.searchWrapHidden : ''}`} ref={dropdownRef}>
        <form className={styles.searchContainer} onSubmit={handleSearch}>
          <div className={styles.searchBox}>
            <input
              ref={inputRef}
              type="text"
              className={styles.searchInput}
              placeholder={t('topbar.search')}
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

      {/* Derecha: selector idioma + notificaciones + avatar */}
      <div className={styles.right}>
        {isProfileMinimal ? (
          <>
            <button
              className={styles.iconBtn}
              aria-label="Toggle sidebar"
              onClick={onToggleSidebar}
            >
              <LayoutGrid size={20} />
            </button>

            <button
              className={styles.iconBtn}
              aria-label="Toggle Theme"
              onClick={() => setShowUserMenu((v) => !v)}
            >
              <Settings size={20} />
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
          </>
        ) : (
          <>
            <LanguageSelector />

            <button
              className={styles.iconBtn}
              aria-label={t('topbar.myQR')}
              onClick={() => setMyQRModalOpen(true)}
            >
              <QrCode size={20} />
              <span className={styles.btnLabel}>{t('topbar.myQR')}</span>
            </button>

            <button
              className={styles.iconBtn}
              aria-label="Toggle Theme"
              onClick={toggleDarkMode}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
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
                  <Link
                    to="/ads-studio"
                    className={styles.userMenuItem}
                    onClick={() => setShowUserMenu(false)}
                  >
                    Ads Studio
                  </Link>
                  {user?.is_admin && (
                    <>
                      <Link
                        to="/admin/control-center"
                        className={`${styles.userMenuItem} ${styles.userMenuAdmin}`}
                        onClick={() => setShowUserMenu(false)}
                      >
                        Control
                      </Link>
                      <Link
                        to="/admin/ads"
                        className={`${styles.userMenuItem} ${styles.userMenuAdmin}`}
                        onClick={() => setShowUserMenu(false)}
                      >
                        Validar Anuncios
                      </Link>
                    </>
                  )}
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
          </>
        )}
      </div>
    </header>
  );
}

export default TopBar;
