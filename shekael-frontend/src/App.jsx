import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import useStore from './store';
import { ready as sodiumReady } from 'libsodium-wrappers';
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
import ControlCenter from './pages/ControlCenter/ControlCenter';
import AdminPostApproval from './pages/AdminPostApproval/AdminPostApproval';
import TutorialOnboarding from './pages/TutorialOnboarding/TutorialOnboarding';
import Studio from './pages/Studio';

import Search from './pages/Search/Search';
import Explorar from './pages/Explorar/Explorar';
import Chat from './pages/Chat/Chat';
import BusinessProfile from './components/Business/BusinessProfile';
import BusinessRegistration from './pages/BusinessRegistration/BusinessRegistration';
import Settings from './pages/Settings';
import Security from './pages/Settings/Security';
import Recovery from './pages/Recovery/Recovery';

import TopBar from './components/TopBar/TopBar';
import Sidebar from './components/Sidebar/Sidebar';
import CommentModal from './components/CommentModal/CommentModal';
import ToastContainer from './components/Toast/Toast';
import QRScanner from './components/QRScanner/QRScanner';
import MyQRModal from './components/MyQRModal/MyQRModal';
import WalletWidget from './components/WalletWidget/WalletWidget';

import LockScreen from './components/LockScreen/LockScreen';
import SecurityTutorial from './components/SecurityTutorial/SecurityTutorial';
import useSessionLock from './hooks/useSessionLock';


function ProtectedRoute({ children, authLoading }) {
  const { token, user, latestTermsVersion } = useStore();
  const location = useLocation();
  if (authLoading) {
    return (
      <div className={styles.loadingWrapper}>
        <img src={logoImg} alt="Cargando Shekael" className={styles.loadingLogo} />
        <p className={styles.loadingText}>
          Cargando Shekael...
        </p>
      </div>
    );
  }
  if (!token) return <Navigate to="/" replace />;
  // Auto-redirect al tutorial si no lo ha visto (excepto si ya estamos en /onboarding)
  if (user && user.tutorial_completed === false && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  // Forzar aceptación de términos si la versión del usuario no coincide con la última
  if (user && latestTermsVersion && user.terms_version !== latestTermsVersion && location.pathname !== '/terminos') {
    return <Navigate to="/terminos" replace />;
  }
  return children;
}

// Layout con TopBar + Sidebar para rutas protegidas
function AppLayout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [theaterSidebarVisible, setTheaterSidebarVisible] = useState(false);
  const [qrScannerData, setQrScannerData] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 700);
  const location = useLocation();
  const sessionLock = useSessionLock();

  const { videoMode, qrScannerOpen, setQrScannerOpen, myQRModalOpen, setMyQRModalOpen, chatConversationMode } = useStore();
  const isTheaterMode = videoMode === 'theater';
  const [showSecurityTutorial, setShowSecurityTutorial] = useState(() => {
    return !localStorage.getItem('shekael_security_tutorial_seen');
  });
  const isProfileRoute = location.pathname.startsWith('/profile');
  const isChatRoute = location.pathname.startsWith('/chat');
  const isBusinessRoute = location.pathname.startsWith('/business');
  const isExplorarRoute = location.pathname.startsWith('/explorar');

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
    window.addEventListener('Shekael:pay-user', handlePayUser);
    return () => window.removeEventListener('Shekael:pay-user', handlePayUser);
  }, [setQrScannerOpen]);

  return (
    <>
      {showSecurityTutorial && (
        <SecurityTutorial onComplete={() => setShowSecurityTutorial(false)} />
      )}
      {sessionLock.locked && (
        <LockScreen
          onUnlock={() => {
            sessionLock.unlock();
            useStore.getState().addToast('success', 'Sesión reanudada', 'Bienvenido de vuelta.');
          }}
        />
      )}
      {(!isChatRoute || !chatConversationMode || !isMobile) && (
        <TopBar onToggleSidebar={handleToggleSidebar} sidebarWidth={isMobile ? 0 : navWidth} isMobile={isMobile} />
      )}
      {(!isChatRoute || !chatConversationMode || !isMobile) && (
        <Sidebar
          collapsed={actualSidebarCollapsed}
          hidden={isSidebarHidden}
          isMobile={isMobile}
          onClose={() => setSidebarCollapsed(true)}
        />
      )}
      <div
        className={styles.appContent}
        style={{
          marginLeft: (isMobile || (isChatRoute && chatConversationMode)) ? 0 : `${navWidth}px`,
          transition: 'margin-left 0.3s ease',
        }}
      >
        {children}
        {!isChatRoute && <WalletWidget variant="floating" />}
      </div>
      <CommentModal />
      <ToastContainer />
      <QRScanner
        isOpen={qrScannerOpen}
        onClose={() => {
          setQrScannerOpen(false);
          setQrScannerData(null);
        }}
        defaultPublicKey={qrScannerData?.publicKey}
        defaultBusinessName={qrScannerData?.name}
        onPaymentSuccess={() => {
          window.dispatchEvent(new CustomEvent('Shekael:ad-reward'));
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
    const t = useStore.getState().themeName;
    if (t !== 'light') {
      document.documentElement.setAttribute('data-theme', t);
    }
  }, [initAuth]);

  // Inicializar E2EE — solo asegurar libsodium. El keypair se genera bajo
  // demanda en LockScreen (setup PIN) y se almacena cifrado en Supabase.
  useEffect(() => {
    const state = useStore.getState();
    const token = state.token;
    if (!token) return;

    let cancelled = false;
    async function initE2EE() {
      try {
        await sodiumReady;
        if (cancelled) return;
        void('[E2EE] libsodium ready, no local keys.');

        // Limpiar IndexedDB legacy si existe
        try {
          indexedDB.deleteDatabase('ShekaelKeys');
        } catch {}
        try {
          indexedDB.deleteDatabase('ShekaelPreKeys');
        } catch {}
      } catch (e) {
        console.warn('[E2EE] init fallo:', e);
      }
    }

    initE2EE();
    return () => { cancelled = true; };
  }, [authLoading]);

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
        <Route path="/onboarding" element={
          <ProtectedRoute authLoading={authLoading}>
            <TutorialOnboarding />
          </ProtectedRoute>
        } />
        <Route path="/admin/posts" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><AdminPostApproval /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/business/register" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><BusinessRegistration /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/business/:id" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><BusinessProfile /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/explorar" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><Explorar /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/search" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><Search /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/chat" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><Chat /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><Settings /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/settings/security" element={
          <ProtectedRoute authLoading={authLoading}>
            <AppLayout><Security /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/recovery" element={<Recovery />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
