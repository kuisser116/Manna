import { create } from 'zustand';

const useStore = create((set, get) => ({
  // â”€â”€ Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  user: null,
  token: null,

  setUser: (user) => set({ user }),

  // Perfil activo: 'user' (perfil personal) o { type:'business', business }
  // Al entrar a un comercio propio, la wallet muestra la del comercio.
  activeProfile: { type: 'user' },
  setActiveProfile: (profile) => set({ activeProfile: profile }),

  // Session lock compartido (para que Security no monte un 2do LockScreen)
  sessionLocked: false,
  setSessionLocked: (locked) => set({ sessionLocked: locked }),

  // Clave de recuperación verificada (resultado del modo verify)
  recoveryKey: null,
  setRecoveryKey: (key) => set({ recoveryKey: key }),

  setToken: (token) => {
    if (token) {
      localStorage.setItem('Shekael_token', token);
    } else {
      localStorage.removeItem('Shekael_token');
    }
    set({ token });
  },

  initAuth: async () => {
    const token = localStorage.getItem('Shekael_token');
    if (!token) return;
    set({ token });
    // Restaurar objeto user desde backend + obtener Ãºltima versiÃ³n de tÃ©rminos
    try {
      const apiUrl = import.meta.env.VITE_API_URL || location.origin;
      const [userRes, termsRes] = await Promise.all([
        fetch(`${apiUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/auth/terms/current`)
      ]);
      if (userRes.ok) {
        const data = await userRes.json();
        set({ user: data.user });
      } else {
        // Token invÃ¡lido o expirado â€” limpiar sesiÃ³n
        localStorage.removeItem('Shekael_token');
        set({ token: null, user: null });
      }
      if (termsRes.ok) {
        const termsData = await termsRes.json();
        set({ latestTermsVersion: termsData.version });
      }
    } catch {
      // API no disponible â€” mantener token, user queda null
      console.warn('No se pudo restaurar sesiÃ³n desde /auth/me');
    }
  },

  // Latest terms version from backend (for forced re-accept)
  latestTermsVersion: null,
  setLatestTermsVersion: (version) => set({ latestTermsVersion: version }),

  // acceptTerms — con version tracking
  acceptTerms: async (version = 'v1.0') => {
    const token = get().token;
    if (!token) throw new Error("No autenticado");
    const apiUrl = import.meta.env.VITE_API_URL || location.origin;
    const res = await fetch(apiUrl + "/auth/accept-terms", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token 
      },
      body: JSON.stringify({ version }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Error al aceptar terminos");
    }
    const data = await res.json();
    const currentUser = get().user;
    if (currentUser) {
      set({ user: { 
        ...currentUser, 
        terms_accepted_at: data.terms_accepted_at,
        terms_version: data.terms_version
      }});
    }
  },

  logout: () => {
    localStorage.removeItem('Shekael_token');
    // No borrar flags de términos — la aceptación es permanente, no por sesión
    // Si cambia la versión, se maneja con la comparación de version en DB
    localStorage.removeItem('shekael_pin_hash');
    set({ user: null, token: null, balance: '0.00', posts: [] });
    // Notificar a toda la app que se cerró sesión
    window.dispatchEvent(new CustomEvent('Shekael:logout'));
  },

  // ── Wallet ───────────────────────────────────────────────
  balance: '0.00',
  currency: 'XLM',
  balanceLoading: false,
  walletNotFunded: false,
  walletUsdcActive: false,

  setBalance: (balance, _currency = 'USDC', walletNotFunded = false, walletUsdcActive = false) => set({
    balance: balance || '0.00',
    currency: 'MXN',
    walletNotFunded,
    walletUsdcActive,
  }),
  setBalanceLoading: (balanceLoading) => set({ balanceLoading }),

  posts: [],
  feedLoading: false,
  feedError: null,
  setPosts: (posts) => set({ posts }),
  addPost: (post) => set((state) => ({ posts: [post, ...state.posts] })),
  setFeedLoading: (feedLoading) => set({ feedLoading }),
  setFeedError: (feedError) => set({ feedError }),

  updatePostSupports: (postId) =>
    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === postId ? { ...p, supports_count: (p.supports_count || 0) + 1 } : p
      ),
    })),

  // â”€â”€ Fondo Regional â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  qrScannerOpen: false,
  myQRModalOpen: false,
  regionalCauses: [],
  regionalBalance: '0.00',
  userVotedCause: null,

  setRegionalCauses: (regionalCauses) => set({ regionalCauses }),
  setRegionalBalance: (regionalBalance) => set({ regionalBalance }),
  setUserVotedCause: (causeId) => set({ userVotedCause: causeId }),
  setQrScannerOpen: (open) => set({ qrScannerOpen: open }),
  setMyQRModalOpen: (open) => set({ myQRModalOpen: open }),

  // ── Chat ──
  chatConversationMode: false,
  setChatConversationMode: (mode) => set({ chatConversationMode: mode }),

  // ── UI / Navegación ──
  feedScrollPosition: 0,
  setFeedScrollPosition: (pos) => set({ feedScrollPosition: pos }),

  activeFilter: 'all',
  setActiveFilter: (filter) => set({ activeFilter: filter }),

  isCommentModalOpen: false,
  commentTargetPost: null,
  openCommentModal: (post) => set({ isCommentModalOpen: true, commentTargetPost: post }),
  closeCommentModal: () => set({ isCommentModalOpen: false, commentTargetPost: null }),

  videoMode: 'default',
  setVideoMode: (mode) => set({ videoMode: mode }),
  toggleTheaterMode: () => set((state) => ({ videoMode: state.videoMode === 'theater' ? 'default' : 'theater' })),

  // ── Privacidad ──
  privacy: (() => {
    try {
      return JSON.parse(localStorage.getItem('Shekael_privacy') || '{}');
    } catch { return {}; }
  })(),

  setPrivacy: (updates) => set((state) => {
    const newPrivacy = { ...state.privacy, ...updates };
    localStorage.setItem('Shekael_privacy', JSON.stringify(newPrivacy));
    return { privacy: newPrivacy };
  }),

  // â”€â”€ Tema / Theme Cycling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  themeName: (() => {
    const stored = localStorage.getItem('Shekael_theme');
    const valid = ['light', 'everforest', 'everforest-soft', 'navy', 'catppuccin', 'tokyo-night', 'dark'];
    if (stored && valid.includes(stored)) return stored;
    if (stored === 'dark') return 'dark';
    return 'everforest-soft';
  })(),
  cycleTheme: () => set((state) => {
    const themes = ['light', 'everforest', 'everforest-soft', 'navy', 'catppuccin', 'tokyo-night', 'dark'];
    const currentIdx = themes.indexOf(state.themeName);
    const nextTheme = themes[(currentIdx + 1) % themes.length];
    localStorage.setItem('Shekael_theme', nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', nextTheme);
    }
    return { themeName: nextTheme };
  }),

  // â”€â”€ Misiones (Quests) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  questProgress: 0,
  questStatus: 'pending',
  questHints: [],
  questTasks: null,
  setQuestData: (data) => set({
    questProgress: data.progress ?? 0,
    questStatus: data.status ?? 'pending',
    questHints: Array.isArray(data.hints) ? data.hints : (data.hint ? [data.hint] : []),
    questTasks: data.tasks ?? null
  }),

  refreshQuest: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const res = await fetch(`${(import.meta.env.VITE_API_URL || location.origin)}/quests/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        get().setQuestData(data);
      }
    } catch (err) {
      console.error('[Store] Error refreshing quest status:', err);
    }
  },

  // â”€â”€ Toast global â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  toasts: [],
  addToast: (type, title, message) => set((state) => {
    const noLoading = state.toasts.filter(t => t.type !== 'loading');
    return { toasts: [...noLoading, { id: Date.now(), type, title, message }] };
  }),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),

  // â”€â”€ Subidas en curso (imagen/video) — para el dropdown de notificaciones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  uploads: [],
  addUpload: (kind) => set((state) => ({
    uploads: [...state.uploads.filter(u => u.kind !== kind), { id: Date.now(), kind, progress: 0, status: 'uploading' }]
  })),
  updateUpload: (kind, patch) => set((state) => ({
    uploads: state.uploads.map(u => u.kind === kind ? { ...u, ...patch } : u)
  })),
  removeUpload: (kind) => set((state) => ({
    uploads: state.uploads.filter(u => u.kind !== kind)
  })),

  // â”€â”€ Confirm Toast (con acciones Si/No) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  confirmToast: null,
  showConfirm: (title, message, onConfirm, options = {}) => set({
    confirmToast: { id: Date.now(), title, message, onConfirm, ...options }
  }),
  hideConfirm: () => set({ confirmToast: null }),

}));

export default useStore;

