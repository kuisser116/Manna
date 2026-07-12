import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import useStore from './store';
import _sodium, { ready as sodiumReady } from 'libsodium-wrappers';
import { updatePublicKey, uploadPreKeys } from './api/chats.api';
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
import Studio from './pages/Studio';
import Search from './pages/Search/Search';
import Chat from './pages/Chat/Chat';



import TopBar from './components/TopBar/TopBar';
import Sidebar from './components/Sidebar/Sidebar';
import CommentModal from './components/CommentModal/CommentModal';
import QRScanner from './components/QRScanner/QRScanner';
import MyQRModal from './components/MyQRModal/MyQRModal';
import WalletWidget from './components/WalletWidget/WalletWidget';
import LockScreen from './components/LockScreen/LockScreen';
import useSessionLock from './hooks/useSessionLock';


function ProtectedRoute({ children, authLoading }) {
  const { token, setVideoMode } = useStore();
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
  return token ? children : <Navigate to="/" replace />;
}

// Layout con TopBar + Sidebar para rutas protegidas
function AppLayout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [theaterSidebarVisible, setTheaterSidebarVisible] = useState(false);
  const [qrScannerData, setQrScannerData] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 700);
  const location = useLocation();
  const sessionLock = useSessionLock();

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
    window.addEventListener('Shekael:pay-user', handlePayUser);
    return () => window.removeEventListener('Shekael:pay-user', handlePayUser);
  }, [setQrScannerOpen]);

  return (
    <>
      {sessionLock.locked && (
        <LockScreen
          onUnlock={sessionLock.unlock}
          mode={localStorage.getItem('shekael_pin_hash') ? 'lock' : 'setup'}
        />
      )}
      <TopBar onToggleSidebar={handleToggleSidebar} sidebarWidth={isMobile ? 0 : navWidth} isMobile={isMobile} />
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
    const isDark = useStore.getState().isDarkMode;
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, [initAuth]);

  // Inicializar E2EE keys si el usuario está autenticado (para toda la app)
  useEffect(() => {
    const token = useStore.getState().token;
    if (!token) return;

    let cancelled = false;

    async function initE2EE() {
      try {
        await sodiumReady;
        if (cancelled) return;

        // Verificar si ya hay llaves
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('ShekaelKeys', 1);
          req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains('keys'))
              req.result.createObjectStore('keys', { keyPath: 'id' });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });

        const tx = db.transaction('keys', 'readonly');
        const store = tx.objectStore('keys');
        // Buscar tanto 'main' (plana) como 'main_encrypted' (cifrada con PIN)
        const [storedPlain, storedEnc] = await Promise.all([
          new Promise((resolve) => {
            const req = store.get('main');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          }),
          new Promise((resolve) => {
            const req = store.get('main_encrypted');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          })
        ]);
        db.close();

        if (storedPlain || storedEnc) return; // Ya tiene llaves (planas o cifradas con PIN)

        // Generar nuevo par
        const kp = _sodium.crypto_box_keypair();
        const keyPair = {
          publicKey: _sodium.to_base64(kp.publicKey),
          privateKey: _sodium.to_base64(kp.privateKey)
        };

        // Guardar en IndexedDB
        const db2 = await new Promise((resolve, reject) => {
          const req = indexedDB.open('ShekaelKeys', 1);
          req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains('keys'))
              req.result.createObjectStore('keys', { keyPath: 'id' });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const tx2 = db2.transaction('keys', 'readwrite');
        const store2 = tx2.objectStore('keys');
        await new Promise((resolve, reject) => {
          const req = store2.put({ id: 'main', ...keyPair });
          req.onsuccess = resolve;
          req.onerror = reject;
        });
        db2.close();

        // Subir llave pública (best-effort)
        try {
          await updatePublicKey(keyPair.publicKey);
        } catch { /* silencioso */ }

        // Generar y subir pre-keys (para mensajes offline)
        try {
          const identityPriv = _sodium.from_base64(keyPair.privateKey);

          // Signed pre-key: un par firmado con la identity key
          const spkKp = _sodium.crypto_box_keypair();
          const spkPub = _sodium.to_base64(spkKp.publicKey);
          const spkPriv = _sodium.to_base64(spkKp.privateKey);
          const spkSig = _sodium.to_base64(
            _sodium.crypto_sign_detached(spkKp.publicKey, identityPriv)
          );

          // One-time pre-keys: 50 pares
          const preKeys = [];
          const preKeyPrivates = [];
          for (let i = 1; i <= 50; i++) {
            const kp2 = _sodium.crypto_box_keypair();
            const pubB64 = _sodium.to_base64(kp2.publicKey);
            preKeys.push({
              keyId: i,
              publicKey: pubB64,
              signature: _sodium.to_base64(
                _sodium.crypto_sign_detached(kp2.publicKey, identityPriv)
              )
            });
            preKeyPrivates.push({ keyId: i, privateKey: _sodium.to_base64(kp2.privateKey) });
          }

          // Guardar pre-keys privadas en IndexedDB
          const pdb = await new Promise((resolve, reject) => {
            const req = indexedDB.open('ShekaelPreKeys', 1);
            req.onupgradeneeded = () => {
              if (!req.result.objectStoreNames.contains('prekeys'))
                req.result.createObjectStore('prekeys', { keyPath: 'id' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          const ptx = pdb.transaction('prekeys', 'readwrite');
          const pstore = ptx.objectStore('prekeys');
          // Guardar signed pre-key
          pstore.put({ id: 'signed', publicKey: spkPub, privateKey: spkPriv });
          // Guardar one-time pre-keys
          for (const pk of preKeyPrivates) {
            pstore.put({ id: `otpk_${pk.keyId}`, ...pk });
          }
          await new Promise((resolve, reject) => {
            ptx.oncomplete = resolve;
            ptx.onerror = reject;
          });
          pdb.close();

          // Subir pre-keys públicas al servidor
          await uploadPreKeys(preKeys, {
            publicKey: spkPub,
            signature: spkSig
          });
        } catch { /* silencioso */ }
      } catch (e) {
        console.warn('E2EE init fallo:', e);
      }
    }

    initE2EE();
    return () => { cancelled = true; };
  }, []);

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
