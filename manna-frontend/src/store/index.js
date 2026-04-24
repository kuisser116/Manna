import { create } from 'zustand';

const useStore = create((set, get) => ({
  // ── Auth ──────────────────────────────────
  user: null,
  token: null,

  setUser: (user) => set({ user }),

  setToken: (token) => {
    if (token) {
      localStorage.setItem('Ehise_token', token);
    } else {
      localStorage.removeItem('Ehise_token');
    }
    set({ token });
  },

  initAuth: async () => {
    const token = localStorage.getItem('Ehise_token');
    if (!token) return;
    set({ token });
    // Restaurar objeto user desde backend (con stellarPublicKey completo)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        set({ user: data.user });
      } else {
        // Token inválido o expirado — limpiar sesión
        localStorage.removeItem('Ehise_token');
        set({ token: null, user: null });
      }
    } catch {
      // API no disponible — mantener token, user queda null
      console.warn('No se pudo restaurar sesión desde /auth/me');
    }
  },

  logout: () => {
    localStorage.removeItem('Ehise_token');
    set({ user: null, token: null, balance: '0.00', mxneBalance: '0.00', posts: [], sessionSeenAds: new Set(), postsSinceLastAd: 0 });
  },

  // ── Wallet ────────────────────────────────
  balance: '0.00',
  mxneBalance: '0.00',
  balanceMXN: '0.00',
  currency: 'XLM',
  balanceLoading: false,

  setBalance: (balance, currency, balanceMXN, mxneBalance = '0.00') => set({
    balance,
    currency: currency || 'XLM',
    balanceMXN: balanceMXN || '0.00',
    mxneBalance: mxneBalance || '0.00'
  }),
  setBalanceLoading: (balanceLoading) => set({ balanceLoading }),

  posts: [],
  feedLoading: false,
  feedError: null,
  sessionSeenAds: new Set(),
  postsSinceLastAd: 0,

  setPosts: (posts) => set({ posts }),
  addPost: (post) => set((state) => ({ posts: [post, ...state.posts] })),
  setFeedLoading: (feedLoading) => set({ feedLoading }),
  setFeedError: (feedError) => set({ feedError }),
  addSeenAd: (adId) => set((state) => {
    const newAds = new Set(state.sessionSeenAds);
    newAds.add(adId);
    return { sessionSeenAds: newAds, postsSinceLastAd: 0 };
  }),
  setPostsSinceLastAd: (n) => set({ postsSinceLastAd: n }),

  updatePostSupports: (postId) =>
    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === postId ? { ...p, supports_count: (p.supports_count || 0) + 1 } : p
      ),
    })),

  // ── Fondo Regional ───────────────────────
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

  // ── UI / Navegación ───────────────────────
  feedScrollPosition: 0,
  setFeedScrollPosition: (pos) => set({ feedScrollPosition: pos }),

  isCommentModalOpen: false,
  commentTargetPost: null,
  openCommentModal: (post) => set({ isCommentModalOpen: true, commentTargetPost: post }),
  closeCommentModal: () => set({ isCommentModalOpen: false, commentTargetPost: null }),

  videoMode: 'default',
  setVideoMode: (mode) => set({ videoMode: mode }),
  toggleTheaterMode: () => set((state) => ({ videoMode: state.videoMode === 'theater' ? 'default' : 'theater' })),

  // ── Tema / Dark Mode ───────────────────────
  isDarkMode: localStorage.getItem('Ehise_theme') === 'dark',
  toggleDarkMode: () => set((state) => {
    const isDark = !state.isDarkMode;
    localStorage.setItem('Ehise_theme', isDark ? 'dark' : 'light');
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    return { isDarkMode: isDark };
  }),

  // ── Misiones (Quests) ──────────────────────
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
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/quests/status`, {
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

}));

export default useStore;
