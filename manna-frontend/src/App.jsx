import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import useStore from './store';
import logoImg from './assets/personaje_1.12.png';
import styles from './App.module.css';

// Importar i18n
import './i18n';

import Landing from './pages/Landing';
import Feed from './pages/Feed';
import CreatePost from './pages/CreatePost';
import FondoRegional from './pages/FondoRegional';
import Profile from './pages/Profile';
import Terms from './pages/Terms';
import PostDetail from './pages/PostDetail';
import Advertise from './pages/Advertise/Advertise';
import AdminAds from './pages/AdminAds/AdminAds';
import ControlCenter from './pages/ControlCenter/ControlCenter';
import Studio from './pages/Studio';
import Search from './pages/Search/Search';



import TopBar from './components/TopBar/TopBar';
import Sidebar from './components/Sidebar/Sidebar';
import CommentModal from './components/CommentModal/CommentModal';
import QRScanner from './components/QRScanner/QRScanner';
import MyQRModal from './components/MyQRModal/MyQRModal';
import WalletWidget from './components/WalletWidget/WalletWidget';


function ProtectedRoute({ children, authLoading }) {
  const { token, setVideoMode } = useStore();
  if (authLoading) {
    return (
      <div className={styles.loadingWrapper}>
        <img src={logoImg} alt="Cargando Ehise" className={styles.loadingLogo} />
        <p className={styles.loadingText}>
          Cargando Ehise...
        </p>
      </div>
    );
  }
  return token ? children : <Navigate to="/" replace />;
}

// Layout con TopBar + Sidebar para rutas protegidas
function AppLayout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [theaterSidebarVisible, setTheaterSidebarVisible] = useState(false);
  const [qrScannerData, setQrScannerData] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 700);
  const location = useLocation();

  const { videoMode, qrScannerOpen, setQrScannerOpen, myQRModalOpen, setMyQRModalOpen } = useStore();
  const isTheaterMode = videoMode === 'theater';
  const isProfileRoute = location.pathname.startsWith('/profile');

  // Escuchar resize para modo móvil
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 700);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Al cambiar de modo (o salir), resetear el estado de visibilidad del sidebar de teatro
  // para que siempre empiece oculto la próxima vez que se entre.
  // Además, forzamos que al volver al modo default sea en modo colapsado para suavizar la transición.
  useEffect(() => {
    if (!isTheaterMode) {
      setTheaterSidebarVisible(false);
      setSidebarCollapsed(true);
    }
  }, [isTheaterMode]);

  // En modo teatro: Visibility depende de theaterSidebarVisible. El ancho es 0 o 72.
  // En modo normal: El comportamiento original de toggling entre 72px y 220px.
  const navWidth = isTheaterMode
    ? (theaterSidebarVisible ? 72 : 0)
    : (sidebarCollapsed ? 72 : 220);

  // En modo teatro, si es visible, forzamos que se vea colapsado (iconos solamente).
  const actualSidebarCollapsed = isTheaterMode ? true : sidebarCollapsed;
  // En modo teatro, se oculta si theaterSidebarVisible es false.
  const isSidebarHidden = isTheaterMode ? !theaterSidebarVisible : false;

  const handleToggleSidebar = () => {
    if (isTheaterMode) {
      setTheaterSidebarVisible((v) => !v);
    } else {
      setSidebarCollapsed((v) => !v);
    }
  };

  // Escuchar evento de pago directo (ej. desde Perfil)
  useEffect(() => {
    const handlePayUser = (e) => {
      setQrScannerData(e.detail);
      setQrScannerOpen(true);
    };
    window.addEventListener('Ehise:pay-user', handlePayUser);
    return () => window.removeEventListener('Ehise:pay-user', handlePayUser);
  }, [setQrScannerOpen]);

  return (
    <>
      <TopBar onToggleSidebar={handleToggleSidebar} />
      <Sidebar collapsed={actualSidebarCollapsed} hidden={isSidebarHidden} />
      <div
        className={styles.appContent}
        style={{
          marginLeft: isMobile ? 0 : `${navWidth}px`,
          transition: 'margin-left 0.3s ease',
        }}
      >
        {children}
        {isMobile && !isProfileRoute && <WalletWidget variant="floating" />}
      </div>
      <CommentModal />
      <QRScanner
        isOpen={qrScannerOpen}
        onClose={() => {
          setQrScannerOpen(false);
          setQrScannerData(null);
        }}
        defaultPublicKey={qrScannerData?.publicKey}
        defaultBusinessName={qrScannerData?.name}
        onPaymentSuccess={() => {
          window.dispatchEvent(new CustomEvent('Ehise:ad-reward'));
        }}
      />
      <MyQRModal
        isOpen={myQRModalOpen}
        onClose={() => setMyQRModalOpen(false)}
      />
    </>
  );
}



function App() {
  const { initAuth } = useStore();
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    initAuth().finally(() => setAuthLoading(false));
    const isDark = useStore.getState().isDarkMode;
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, [initAuth]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Landing sin layout de app */}
        <Route path="/" element={<Landing />} />
        <Route path="/terminos" element={<Terms />} />

        {/* Rutas protegidas con TopBar + Sidebar */}
        <Route path="/feed" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><Feed /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/create" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><CreatePost /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/profile/:id?" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><Profile /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/post/:id" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><PostDetail /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/ads-studio" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><Advertise /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/advertise" element={
          <ProtectedRoute authLoading={authLoading}>
            <Advertise />
          </ProtectedRoute>
        } />
        <Route path="/ads-studio/*" element={<Navigate to="/ads-studio" replace />} />
        <Route path="/admin/ads" element={
          <ProtectedRoute authLoading={authLoading}>
            <AdminAds />
          </ProtectedRoute>
        } />
        <Route path="/studio" element={
          <ProtectedRoute authLoading={authLoading}>
            <Studio />
          </ProtectedRoute>
        } />
        <Route path="/admin/control-center" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><ControlCenter /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/search" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><Search /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
