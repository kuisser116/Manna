import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase.js';
import bgPatternUrl from '../../assets/patterns/profile-bg-pattern.svg';
import useStore from '../../store';
import { getUserProfile } from '../../api/users.api';
import { verifyPin } from '../../api/auth.api';
import PinKeypad, { pinHash } from '../../components/PinKeypad/PinKeypad';
import _sodium, { ready as sodiumReady } from 'libsodium-wrappers';
import { getKeyPair } from '../../crypto/keyStore';
import {
  getConversations, getMessages, sendMessage,
  getMessageRequests, acceptRequest, rejectRequest, blockRequester,
  searchUsers, sendMessageRequest, updatePublicKey,
  uploadChatFile,
  searchChatMessages, deleteMessage, forwardMessage, editMessage,
  togglePinConversation, setChatNickname, setChatBackground,
  togglePinMessage, getPinnedMessage, markAsRead
} from '../../api/chats.api';
import styles from './Chat.module.css';
import StickerPicker from '../../components/StickerPicker';
import AudioRecorder from '../../components/AudioRecorder';
import PollCreator from '../../components/PollCreator';
import PollResults from '../../components/PollResults';
import GroupCreateModal from '../../components/GroupCreateModal';
import AudioPlayer from '../../components/AudioPlayer';
import { generateInvite, joinGroup, leaveGroup, toggleSaveMessage } from '../../api/chats.api';
import {
  connectSocket, disconnectSocket, joinConversation, leaveConversation, emitTyping,
  onMessageSent, onMessageEdited, onMessageDeleted, clearCallbacks, onTyping,
  onConversationUpdated
} from '../../services/socket';


export default function Chat() {
  const navigate = useNavigate();
  const { user, setChatConversationMode } = useStore();
  const [isMobile] = useState(() => window.innerWidth <= 700);
  // keyStore singleton — no necesita hook

  // Estado
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [requests, setRequests] = useState([]);
  const [showRequests, setShowRequests] = useState(false);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [keysReady, setKeysReady] = useState(false);
  const messagesEndRef = useRef(null);
  const msgListRef = useRef(null);
  const otherUserCache = useRef({});

  // Estado para adjuntos
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const fileInputRef = useRef(null);

  // Reply
  const [replyTo, setReplyTo] = useState(null);

  // Menú contextual
  const [contextMenu, setContextMenu] = useState(null);

  // Búsqueda en el chat
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatSearchResults, setChatSearchResults] = useState([]);
  const [showChatSearch, setShowChatSearch] = useState(false);

  // Nuevos modales
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showPickerTab, setShowPickerTab] = useState(''); // 'emojis' | 'stickers' | ''

  // Reenviar
  const [forwardTarget, setForwardTarget] = useState(null);
  const [forwardConvId, setForwardConvId] = useState('');
  const [showGroupCreate, setShowGroupCreate] = useState(false);

  // Typing indicator
  const [typingUsers, setTypingUsers] = useState({});
  const typingTimersRef = useRef({});
  const messageInputRef = useRef(null);

  // Edit message
  const [editingMessage, setEditingMessage] = useState(null); // message object being edited or null

  // Pin
  const [pinnedMessage, setPinnedMessage] = useState(null);

  // Audio auto-play
  const [activeAudioId, setActiveAudioId] = useState(null);

  // Nickname edit
  const [showNicknameEdit, setShowNicknameEdit] = useState(false);

  // Chat menu (hamburguesa)
  const [showChatMenu, setShowChatMenu] = useState(false);
  const menuRef = useRef(null);

  // PIN confirm para borrar historial
  const [showPinConfirm, setShowPinConfirm] = useState(false);
  const [pinError, setPinError] = useState('');

  // Fondo de conversación
  const [bgConfiguring, setBgConfiguring] = useState(false);
  const [bgFile, setBgFile] = useState(null);
  const [bgPreview, setBgPreview] = useState(null);
  const [bgOpacity, setBgOpacity] = useState(5); // 1-10, default 5
  const [bgOriginalPreview, setBgOriginalPreview] = useState(null);
  const bgInputRef = useRef(null);
  const [nicknameInput, setNicknameInput] = useState('');

  // Filtro: 'all' | 'unread'
  const [convFilter, setConvFilter] = useState('all');
  const animatedMsgIdsRef = useRef(new Set());

  // Refs para animaciones de entrada
  const chatLayoutRef = useRef(null);
  const sidePanelRef = useRef(null);
  const chatPanelRef = useRef(null);
  const inputAreaRef = useRef(null);

  // Refs para animaciones de elementos toggle
  const audioRecorderWrapRef = useRef(null);
  const replyPreviewWrapRef = useRef(null);
  const editPreviewWrapRef = useRef(null);
  const pinnedBannerWrapRef = useRef(null);
  const attachMenuWrapRef = useRef(null);
  const chatSearchWrapRef = useRef(null);
  const filePreviewWrapRef = useRef(null);

  // Registrar CustomEase una vez
  const easeRegisteredRef = useRef(false);

  // ── GSAP: animación de entrada al cargar la página ──
  useEffect(() => {
    if (!easeRegisteredRef.current) {
      try { CustomEase.create('shekael-bounce', 'M0,0 C0.3,0.9 0.4,1.2 0.5,1 C0.6,0.8 0.7,1.1 1,1'); } catch {}
      easeRegisteredRef.current = true;
    }

    const sections = [];
    if (sidePanelRef.current) sections.push(sidePanelRef.current);
    if (chatPanelRef.current) sections.push(chatPanelRef.current);

    gsap.fromTo(sections,
      { opacity: 0, y: 30, scale: 0.96, filter: 'blur(6px)' },
      { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.7, stagger: 0.12, ease: 'shekael-bounce', clearProps: 'filter' }
    );
  }, []);

  // ── GSAP: animar barra de audio al aparecer/desaparecer ──
  useEffect(() => {
    const el = audioRecorderWrapRef.current;
    if (!el) return;
    if (showAudioRecorder) {
      gsap.fromTo(el,
        { opacity: 0, y: -10, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'shekael-bounce' }
      );
    } else {
      gsap.to(el, { opacity: 0, y: -8, scale: 0.95, duration: 0.2, ease: 'power2.in' });
    }
  }, [showAudioRecorder]);

  // ── GSAP: animar barra de responder (reply) ──
  useEffect(() => {
    const el = replyPreviewWrapRef.current;
    if (!el) return;
    if (replyTo) {
      gsap.fromTo(el,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }
      );
    }
  }, [replyTo]);

  // ── GSAP: animar barra de editar ──
  useEffect(() => {
    const el = editPreviewWrapRef.current;
    if (!el) return;
    if (editingMessage) {
      gsap.fromTo(el,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }
      );
    }
  }, [editingMessage]);

  // ── GSAP: animar banner de mensaje fijado ──
  useEffect(() => {
    const el = pinnedBannerWrapRef.current;
    if (!el) return;
    if (pinnedMessage) {
      gsap.fromTo(el,
        { opacity: 0, y: -12, filter: 'blur(4px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.4, ease: 'shekael-bounce', clearProps: 'filter' }
      );
    }
  }, [pinnedMessage]);

  // ── GSAP: animar menú de adjuntar ──
  useEffect(() => {
    const el = attachMenuWrapRef.current;
    if (!el) return;
    if (showAttachMenu) {
      gsap.fromTo(el,
        { opacity: 0, scale: 0.92, y: 4 },
        { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: 'power3.out' }
      );
    }
  }, [showAttachMenu]);

  // ── GSAP: animar buscador en el chat ──
  useEffect(() => {
    const el = chatSearchWrapRef.current;
    if (!el) return;
    if (showChatSearch) {
      gsap.fromTo(el,
        { height: 0, opacity: 0 },
        { height: 'auto', opacity: 1, duration: 0.3, ease: 'power3.out' }
      );
    }
  }, [showChatSearch]);

  // ── GSAP: animar preview de archivo ──
  useEffect(() => {
    const el = filePreviewWrapRef.current;
    if (!el) return;
    if (selectedFile) {
      gsap.fromTo(el,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }
      );
    }
  }, [selectedFile]);
  const filteredConversations = convFilter === 'unread'
    ? conversations.filter(c => c.lastReadAt && c.lastMessage?.created_at > c.lastReadAt)
    : conversations;

  // ── GSAP: animar mensajes nuevos ──
  const messagesEndRefCallback = useCallback(() => {
    // Se ejecuta después de cada render con mensajes
    const msgEls = msgListRef.current?.querySelectorAll(`.${styles.message}`);
    if (!msgEls?.length) return;
    const toAnimate = [];
    msgEls.forEach(el => {
      const id = el.id?.replace('msg-', '');
      if (id && !animatedMsgIdsRef.current.has(id)) {
        toAnimate.push(el);
      }
    });
    if (toAnimate.length === 0) return;
    gsap.fromTo(toAnimate,
      { opacity: 0, y: 24, scale: 0.92, filter: 'blur(4px)' },
      { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.5, stagger: 0.05, ease: 'shekael-bounce', clearProps: 'filter' }
    );
    toAnimate.forEach(el => {
      const id = el.id?.replace('msg-', '');
      if (id) animatedMsgIdsRef.current.add(id);
    });
  }, []);

  // ── GSAP: animar lista de conversaciones ──
  useEffect(() => {
    const items = msgListRef.current?.parentElement?.querySelectorAll(`.${styles.convItem}`);
    if (!items?.length) return;
    gsap.fromTo(items,
      { opacity: 0, x: -16, filter: 'blur(3px)' },
      { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.45, stagger: 0.035, ease: 'shekael-bounce', clearProps: 'filter', overwrite: 'auto' }
    );
  }, [filteredConversations]);

  // Cerrar context menu al hacer click fuera
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // Escape para cerrar lightbox
    // Escape para cerrar lightbox
  useEffect(() => {
    if (!lightboxUrl) return;
    const handler = (e) => { if (e.key === 'Escape') setLightboxUrl(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxUrl]);

  // Inicializar crypto — verificar keyStore (puesto por LockScreen)
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await sodiumReady;
        if (cancelled) return;

        // Verificar si ya hay llaves en keyStore (puestas por LockScreen)
        const existingKp = getKeyPair();
        if (existingKp && existingKp.privateKey) {
          setKeysReady(true);
          return;
        }

        // No hay llaves — el LockScreen las pedirá al desbloquear
        // Mientras tanto, no podemos cifrar mensajes
        setKeysReady(false);
      } catch (e) {
        console.error('Error al inicializar cifrado:', e);
        if (!cancelled) setKeysReady(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Legacy IndexedDB functions (mantenidas por si hay migración)
  function openKeyDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('ShekaelKeys', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('keys')) {
          db.createObjectStore('keys', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Socket.IO: conectar cuando hay usuario ──
  const decryptRef = useRef(null);
  const activeConvRef = useRef(activeConv);
  activeConvRef.current = activeConv;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  useEffect(() => {
    const token = localStorage.getItem('Shekael_token')?.replace(/["']/g, '');
    if (!token) return;
    connectSocket(token);

    // Solicitar permiso de notificaciones
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Listeners para eventos en tiempo real
    onMessageSent(async (msg) => {
      console.log('[WS RECV] message:sent id:', msg?.id?.substring(0,8));
      const conv = activeConvRef.current;
      if (!conv?.id || msg.conversation_id !== conv.id) return;
      if (msg.sender_id === user?.id) return;

      // Descifrar con public_key fresca de la API (no cache)
      let decryptedText = null;
      const decryptFn = decryptRef.current;
      const otherUserId = msg.sender_id;

      if (otherUserId) {
        try {
          const profRes = await getUserProfile(otherUserId);
          const fresh = profRes.data?.user || profRes.data;
          if (fresh?.public_key) {
            try {
              decryptedText = await legacyDecrypt(msg.encrypted_content, msg.nonce, fresh.public_key);
            } catch {}
            if (decryptedText) console.log('[WS KEY] descifrado OK');
          }
        } catch {}
      }

      // Agregar al state UNA SOLA VEZ
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        prevMsgIdsRef.current.add(msg.id);
        return [...prev, {
          ...msg,
          decrypted: decryptedText || (msg.message_type === 'audio' ? '' : '[Mensaje cifrado]')
        }];
      });
      // Mantener active conv como leído
      setConversations(prev => prev.map(c =>
        c.id === conv.id ? { ...c, lastReadAt: new Date().toISOString() } : c
      ));
      if (decryptedText) scrollToBottom();
    });

    onMessageEdited(async (data) => {
      setMessages(prev => prev.map(m =>
        m.id === data.messageId
          ? { ...m, encrypted_content: data.encrypted_content, nonce: data.nonce, edited_at: data.edited_at, decrypted: null }
          : m
      ));
      // Descifrar el nuevo contenido
      const conv = activeConvRef.current;
      if (!conv?.id) return;
      let pt = null;
      const otherUser = otherUserCache.current[conv.id];
      if (otherUser?.public_key) {
        try { pt = await legacyDecrypt(data.encrypted_content, data.nonce, otherUser.public_key); } catch {}
      }
      if (pt) {
        setMessages(prev => prev.map(m =>
          m.id === data.messageId ? { ...m, decrypted: pt } : m
        ));
      } else {
        setMessages(prev => prev.map(m =>
          m.id === data.messageId ? { ...m, decrypted: '[Mensaje cifrado]' } : m
        ));
      }
    });

    onMessageDeleted((data) => {
      setMessages(prev => prev.map(m =>
        m.id === data.messageId ? { ...m, deleted_at: new Date().toISOString(), encrypted_content: null } : m
      ));
    });

    onConversationUpdated((data) => {
      const currentUser = useStore.getState().user;
      setConversations(prev => {
        const updated = prev.map(c => {
          if (c.id !== data.conversationId) return c;
          const isActive = activeConvRef.current?.id === data.conversationId;
          const isOwn = data.lastMessage?.sender_id === currentUser?.id;
          return {
            ...c,
            lastMessage: data.lastMessage,
            updated_at: new Date().toISOString(),
            unreadCount: isOwn ? (c.unreadCount || 0) : (isActive ? 0 : (c.unreadCount || 0) + 1)
          };
        });
        // Pinned siempre arriba, luego por updated_at
        updated.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
        });
        return updated;
      });

      // Notificación de escritorio solo para mensajes de otros
      if ('Notification' in window && Notification.permission === 'granted' && data.lastMessage?.sender_id !== user?.id) {
        const conv = conversationsRef.current?.find(c => c.id === data.conversationId);
        if (conv && activeConvRef.current?.id !== data.conversationId && data.lastMessage?.sender_id !== user?.id) {
          const senderName = conv.otherUser?.display_name || 'Alguien';
          const msgType = data.lastMessage?.message_type || 'text';
          const body = msgType === 'image' ? '📷 Foto'
            : msgType === 'audio' ? '🎤 Audio'
            : msgType === 'file' ? '📎 Archivo'
            : data.lastMessage?.decrypted?.substring(0, 100) || '💬 Nuevo mensaje';
          new Notification(senderName, {
            body,
            icon: conv.otherUser?.avatar_url || undefined,
            tag: data.conversationId
          });
        }
      }
    });

    onTyping(async ({ userId, conversationId, typing }) => {
      const conv = activeConvRef.current;
      if (!conv?.id || conversationId !== conv.id || userId === user?.id) return;

      if (typing) {
        setTypingUsers(prev => ({ ...prev, [userId]: Date.now() }));
        // Auto-limpiar después de 4s (timeout de seguridad)
        if (typingTimersRef.current[userId]) {
          clearTimeout(typingTimersRef.current[userId]);
        }
        typingTimersRef.current[userId] = setTimeout(() => {
          setTypingUsers(prev => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
        }, 4000);
      } else {
        setTypingUsers(prev => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
        if (typingTimersRef.current[userId]) {
          clearTimeout(typingTimersRef.current[userId]);
        }
      }
    });

    return () => {
      clearCallbacks();
      disconnectSocket();
    };
  }, []); // Solo al montar

  // ── Unirse/salir de room al cambiar conversación ──
  useEffect(() => {
    if (activeConv?.id) {
      joinConversation(activeConv.id);
    }
    return () => {
      if (activeConv?.id) {
        leaveConversation(activeConv.id);
      }
    };
  }, [activeConv?.id]);

  // Cargar conversaciones y solicitudes al montar, sin esperar crypto
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [convRes, reqRes] = await Promise.all([
        getConversations(),
        getMessageRequests()
      ]);
      setConversations(convRes.data.conversations || []);
      // Unirse a todas las salas para recibir eventos WS
      (convRes.data.conversations || []).forEach(c => joinConversation(c.id));
      const pendingReqs = reqRes.data.requests || [];
      setRequests(pendingReqs);
      // Mostrar automáticamente el panel de solicitudes si hay pendientes
      if (pendingReqs.length > 0) {
        setShowRequests(true);
      }
    } catch (err) {
      console.error('Error loading chat data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Cifrado E2EE con ECDH (crypto_box_beforenm + crypto_secretbox) ──
  // Ambos lados pueden cifrar y descifrar porque derivan el mismo shared secret

  // Cifrar: shared secret desde (myPriv + theirPub)
  const legacyEncrypt = useCallback(async (plaintext, theirPubB64) => {
    const kp = getKeyPair();
    if (!kp) throw new Error('No keypair');
    const ss = _sodium.crypto_box_beforenm(_sodium.from_base64(theirPubB64), _sodium.from_base64(kp.privateKey));
    const nonce = _sodium.randombytes_buf(_sodium.crypto_secretbox_NONCEBYTES);
    const ct = _sodium.crypto_secretbox_easy(_sodium.from_string(plaintext), nonce, ss);
    return { encryptedContent: _sodium.to_base64(ct), nonce: _sodium.to_base64(nonce) };
  }, []);

  // Descifrar: shared secret desde (myPriv + theirPub)
  const legacyDecrypt = useCallback(async (encryptedContent, nonceB64, theirPubB64) => {
    const kp = getKeyPair();
    if (!kp) throw new Error('No keypair');
    const ss = _sodium.crypto_box_beforenm(_sodium.from_base64(theirPubB64), _sodium.from_base64(kp.privateKey));
    return _sodium.to_string(_sodium.crypto_secretbox_open_easy(
      _sodium.from_base64(encryptedContent),
      _sodium.from_base64(nonceB64),
      ss
    ));
  }, []);
  decryptRef.current = legacyDecrypt;

  // Load pinned message
  const loadPinnedMessage = useCallback(async (convId) => {
    try {
      const res = await getPinnedMessage(convId);
      const pm = res.data.pinnedMessage;
      if (!pm) { setPinnedMessage(null); return; }
      let decryptedText = null;
      const kp = getKeyPair();
      if (kp && pm.encrypted_content) {
        try {
          decryptedText = _sodium.to_string(_sodium.crypto_box_seal_open(
            _sodium.from_base64(pm.encrypted_content),
            _sodium.from_base64(kp.publicKey),
            _sodium.from_base64(kp.privateKey)
          ));
        } catch {
          try {
            decryptedText = _sodium.to_string(_sodium.crypto_secretbox_open_easy(
              _sodium.from_base64(pm.encrypted_content),
              _sodium.from_base64(pm.nonce || ''),
              _sodium.crypto_box_beforenm(_sodium.from_base64(pm.sender_public_key || ''), _sodium.from_base64(kp.privateKey))
            ));
          } catch {}
        }
      }
      setPinnedMessage({ ...pm, decryptedText });
    } catch {
      setPinnedMessage(null);
    }
  }, []);

  // Cargar mensajes al seleccionar conversación
  const selectConversation = useCallback(async (conv) => {
    setActiveConv(conv);
    setShowSearch(false);
    setMessages([]);
    setInputText('');
    // setShowReply removed - not declared;
    setReplyTo(null);
    setSelectedFile(null);
    setFilePreview(null);
    if (!conv?.id) return;

    // Marcar como leído
    markAsRead(conv.id).catch(() => {});
    setConversations(prev => prev.map(c =>
      c.id === conv.id ? { ...c, lastReadAt: new Date().toISOString(), unreadCount: 0 } : c
    ));

    prevMsgIdsRef.current = new Set();

    let msgs = [];
    let otherUser = conv.otherUser;

    try {
      const res = await getMessages(conv.id);
      msgs = (res?.data?.messages) || [];

      // Obtener la llave pública MÁS RECIENTE del otro usuario
      if (otherUser?.id) {
        try {
          const profRes = await getUserProfile(otherUser.id);
          const fresh = profRes.data?.user || profRes.data;
          if (fresh?.public_key) {
            if (conv.otherUser?.public_key && conv.otherUser.public_key !== fresh.public_key) {
              console.warn('[KEY_ROTATE] otherUser public_key changed from', conv.otherUser.public_key.substring(0,20), 'to', fresh.public_key.substring(0,20));
            }
            otherUser = { ...otherUser, public_key: fresh.public_key };
          }
        } catch {}
      }
      // Cachear siempre (sea desde conv.otherUser o desde fresh)
      if (otherUser?.public_key) {
        otherUserCache.current[conv.id] = otherUser;
        console.log('[CACHE KEY] conv:', conv.id?.substring(0,8), 'key:', otherUser.public_key?.substring(0,20));
      }

      const decrypted = [];
      for (const msg of msgs) {
        if (msg.nonce === 'plaintext') {
          decrypted.push({ ...msg, decrypted: msg.encrypted_content || '' });
          continue;
        }
        let plaintext = null;
        if (otherUser?.public_key && msg.encrypted_content) {
          try { plaintext = await legacyDecrypt(msg.encrypted_content, msg.nonce, otherUser.public_key); } catch {}
        }
        decrypted.push({
          ...msg,
          decrypted: plaintext || (msg.message_type === 'audio' ? '' : '[Mensaje cifrado]')
        });
      }

      // Filtrar mensajes anteriores al clearedAt (limpieza local)
      // Usar conv.id (el parámetro) no activeConv.id (estado asíncrono)
      let visibleMsgs = decrypted;
      try {
        const cKey = `shekael_chat_cleared_${conv.id}`;
        const cData = JSON.parse(localStorage.getItem(cKey));
        if (cData?.clearedAt) {
          const clearedTime = new Date(cData.clearedAt).getTime();
          if (!isNaN(clearedTime)) {
            visibleMsgs = decrypted.filter(m => new Date(m.created_at).getTime() >= clearedTime);
          }
        }
      } catch {}
      setMessages(visibleMsgs);
      // Inicializar ref de IDs para el polling
      visibleMsgs.forEach(m => prevMsgIdsRef.current.add(m.id));
      scrollToBottom();
      loadPinnedMessage(conv.id);
    } catch (err) {
      console.error('Error loading messages:', err);
      if (msgs && msgs.length > 0) {
        setMessages(msgs.map(m => ({ ...m, decrypted: m.message_type === 'audio' ? '' : '[Mensaje cifrado]' })));
        scrollToBottom();
      }
    }
  }, [loadPinnedMessage]);

  // Sincronizar modo conversación (oculta TopBar/Sidebar en móvil)
  useEffect(() => {
    setChatConversationMode(isMobile && !!activeConv);
    return () => setChatConversationMode(false);
  }, [isMobile, activeConv, setChatConversationMode]);

  // Polling: buscar mensajes nuevos (fallback 60s, solo si WS falla)
  const prevMsgIdsRef = useRef(new Set());
  useEffect(() => {
    if (!activeConv?.id || !user?.id) return;
    const convId = activeConv.id;

    const poll = setInterval(async () => {
      try {
        const res = await getMessages(convId, 0);
        const raw = res.data.messages || [];
        if (!raw.length) return;

        // Filtrar solo los nuevos
        const newMsgs = raw.filter(m => !prevMsgIdsRef.current.has(m.id));
        if (!newMsgs.length) return;

        const decrypted = [];
        for (const msg of newMsgs) {
          prevMsgIdsRef.current.add(msg.id);
          if (msg.nonce === 'plaintext') {
            decrypted.push({ ...msg, decrypted: msg.encrypted_content || '' });
            continue;
          }
          let pt = null;
          try {
            const pk = otherUserCache.current[convId]?.public_key;
            if (pk && getKeyPair()) {
              pt = await legacyDecrypt(msg.encrypted_content, msg.nonce, pk);
            }
          } catch {}
          if (pt) {
            decrypted.push({ ...msg, decrypted: pt });
          } else if (msg.message_type === 'audio') {
            decrypted.push({ ...msg, decrypted: '' });
          } else {
            decrypted.push({ ...msg, decrypted: '[Mensaje cifrado]' });
          }
        }

        setMessages(prev => [...prev, ...decrypted]);
        scrollToBottom();
      } catch { /* polling falló */ }
    }, 60000);

    return () => clearInterval(poll);
  }, [activeConv?.id, user?.id, legacyDecrypt]);

  // Reintentar cargar llaves si están pendientes
  useEffect(() => {
    if (keysReady) return;
    const retry = setInterval(() => {
      if (getKeyPair()?.privateKey) {
        setKeysReady(true);
      }
    }, 2000);
    return () => clearInterval(retry);
  }, [keysReady]);

  // Descifrar mensajes entrantes nuevos (cuando se reciben sin recargar la página)
  const decryptMessages = async (msgs, otherUser, convId) => {
    if (!otherUser?.public_key) return msgs;
    const decrypted = [];

    for (const msg of msgs) {
      // Mensaje sin cifrar (antes de que el otro tuviera llaves)
      if (msg.nonce === 'plaintext') {
        decrypted.push({ ...msg, decrypted: msg.encrypted_content || '' });
        continue;
      }
      // ECDH directo
      try {
        const plaintext = await legacyDecrypt(msg.encrypted_content, msg.nonce, otherUser.public_key);
        decrypted.push({ ...msg, decrypted: plaintext });
      } catch {
        decrypted.push({ ...msg, decrypted: '[Mensaje cifrado]' });
      }
    }
    return decrypted;
  };
  const handleSend = async () => {
    const hasFile = !!selectedFile;
    if (!inputText.trim() && !hasFile) return;
    if (sending || uploading || !activeConv) return;
    if (!keysReady) return;

    // ── Edit mode ──
    if (editingMessage) {
      const otherUser = otherUserCache.current[activeConv.id] || activeConv.otherUser;
      if (!otherUser?.public_key) {
        // Intentar obtener llave pública
        try {
          const res = await getUserProfile(otherUser?.id);
          const fresh = res.data?.user || res.data;
          if (fresh?.public_key) {
            otherUserCache.current[activeConv.id] = { ...otherUser, public_key: fresh.public_key };
          }
        } catch {}
      }

      try {
        setSending(true);
        let encryptedContent, nonce;

        // Re-cifrar con sealed box
        const result = await legacyEncrypt(inputText, otherUser?.public_key || '');
        encryptedContent = result.encryptedContent;
        nonce = result.nonce;

        const res = await editMessage(editingMessage.id, encryptedContent, nonce);
        if (res.data?.edited) {
          setMessages(prev => prev.map(m =>
            m.id === editingMessage.id
              ? { ...m, decrypted: inputText, encrypted_content: encryptedContent, nonce, edited_at: res.data.edited_at }
              : m
          ));
        }
        setEditingMessage(null);
        setInputText('');
        cancelReply();
      } catch (err) {
        console.error('Error editing message:', err);
        alert('Error al editar el mensaje');
      }
      setSending(false);
      return;
    }

    // Subir archivo primero si hay
    let uploadedUrl = null, uploadedThumb = null;
    let fileMeta = {};
    if (hasFile) {
      setUploading(true);
      try {
        const res = await uploadChatFile(selectedFile);
        uploadedUrl = res.data.url;
        uploadedThumb = res.data.thumbUrl;
        fileMeta = {
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: selectedFile.type
        };
      } catch (err) {
        console.error('Error uploading file:', err);
        alert('Error al subir el archivo. Intenta de nuevo.');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    let otherUser = otherUserCache.current[activeConv.id] || activeConv.otherUser;
    
    // Si no tenemos la llave pública, intentar obtenerla del servidor
    if (!otherUser?.public_key && otherUser?.id) {
      try {
        const res = await getUserProfile(otherUser.id);
        const fresh = res.data?.user || res.data;
        if (fresh?.public_key) {
          otherUser = { ...otherUser, public_key: fresh.public_key };
          otherUserCache.current[activeConv.id] = otherUser;
        }
      } catch { /* fallo, seguimos sin llave */ }
    }

    if (!otherUser?.public_key) {
      // No hay public_key — enviar sin cifrar
      setSending(true);
      try {
        const messageType = hasFile ? (selectedFile.type?.startsWith('image/') ? 'image' : 'file') : 'text';
        const res = await sendMessage(
          activeConv.id,
          inputText, // plaintext como encryptedContent
          'plaintext', // nonce especial para identificar
          -1, // msgIndex -1 = sin cifrar
          null, // ephemeralPubB64
          null, // preKeyUsedId
          messageType,
          uploadedUrl,
          uploadedThumb,
          fileMeta.fileName,
          fileMeta.fileSize,
          fileMeta.mimeType
        );
        if (res.data?.message) {
          setMessages(prev => [...prev, { ...res.data.message, decrypted: inputText }]);
          prevMsgIdsRef.current.add(res.data.message.id);
        }
        setInputText('');
        handleRemoveFile();
        cancelReply();
        scrollToBottom();
      } catch (err) {
        console.error('Error sending (no keys):', err);
      }
      setSending(false);
      return;
    }
    const messageType = hasFile ? (selectedFile.type?.startsWith("image/") ? "image" : "file") : "text";
    let replyPreview = null;
    if (replyTo) {
      replyPreview = (replyTo.decrypted || "").substring(0, 80);
    }

    const displayText = hasFile ? (inputText || "") : inputText;
    setSending(true);
    // Optimistic: mostrar mensaje al instante
    const tempId = "temp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    setMessages(prev => [...prev, {
      id: tempId,
      conversation_id: activeConv.id,
      sender_id: user?.id,
      message_type: messageType,
      encrypted_content: "", nonce: "",
      media_url: uploadedUrl,
      media_thumb_url: uploadedThumb,
      file_name: fileMeta.fileName,
      file_size: fileMeta.fileSize,
      mime_type: fileMeta.mimeType,
      created_at: new Date().toISOString(),
      decrypted: displayText,
      _sending: true,
    }]);
    scrollToBottom();
    try {
      const sealResult = await legacyEncrypt(inputText, otherUser.public_key);
      const encryptedContent = sealResult.encryptedContent;
      const nonce = sealResult.nonce;

      const res = await sendMessage(
        activeConv.id,
        encryptedContent,
        nonce,
        -1,
        null,
        null,
        messageType,
        uploadedUrl,
        uploadedThumb,
        fileMeta.fileName,
        fileMeta.fileSize,
        fileMeta.mimeType
      );

      // Set reply info locally FIRST, then try to persist on server
      if (replyTo && res.data.message?.id) {
        res.data.message.reply_to_id = replyTo.id;
        res.data.message.reply_preview = replyPreview;
        try {
          const token = localStorage.getItem("Shekael_token")?.replace(/\"/g, "");
          const { default: axios } = await import("axios");
          const API_URL = import.meta.env.VITE_API_URL || location.origin;
          await axios.patch(`${API_URL}/chats/messages/${res.data.message.id}`, {
            reply_to_id: replyTo.id,
            reply_preview: replyPreview
          }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (patchErr) {
          console.warn("Reply PATCH failed but local state already has the data");
        }
      }

      // Reemplazar mensaje optimista con el real
      setMessages(prev => prev.map(m =>
        m.id === tempId
          ? { ...res.data.message, decrypted: displayText }
          : m
      ));
      prevMsgIdsRef.current.add(res.data.message.id);
      setInputText("");
      handleRemoveFile();
      cancelReply();
      scrollToBottom();
    } catch (err) {
      console.error("Error sending:", err);
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, _sending: false, _error: true, decrypted: m.decrypted || "Error al enviar" } : m
      ));
    } finally {
      setSending(false);
    }
  };

  // ── Efecto: animar mensajes nuevos ──
  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => messagesEndRefCallback());
  }, [messages, messagesEndRefCallback]);

  const scrollToBottom = () => {
    if (msgListRef.current) {
      msgListRef.current.scrollTop = msgListRef.current.scrollHeight;
    }
  };

  // Scroll instantáneo al fondo cuando cambian los mensajes (antes del paint)
  useLayoutEffect(() => {
    if (messages.length > 0 && msgListRef.current) {
      msgListRef.current.scrollTop = msgListRef.current.scrollHeight;
    }
  }, [messages]);

  // Búsqueda de usuarios
  const handleSearch = async (q) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await searchUsers(q);
      setSearchResults(res.data.users || []);
    } catch { setSearchResults([]); }
  };

  // Enviar solicitud de mensaje
  const handleSendRequest = async (toUserId) => {
    try {
      await sendMessageRequest(toUserId);
      setSearchResults(prev => prev.map(u =>
        u.id === toUserId ? { ...u, requestStatus: 'pending', isRequester: true } : u
      ));
    } catch (err) {
      console.error('Error sending request:', err);
    }
  };

  // Aceptar/rechazar/bloquear solicitud
  const handleAccept = async (reqId) => {
    try {
      const res = await acceptRequest(reqId);
      setRequests(prev => prev.filter(r => r.id !== reqId));
      loadData(); // Recargar conversaciones
      if (res.data.conversationId) {
        // Entrar a la nueva conversación
        const newConv = { id: res.data.conversationId, otherUser: res.data.otherUser };
        selectConversation(newConv);
        setShowRequests(false);
      }
    } catch (err) { console.error(err); }
  };

  const handleReject = async (reqId) => {
    try {
      await rejectRequest(reqId);
      setRequests(prev => prev.filter(r => r.id !== reqId));
    } catch (err) { console.error(err); }
  };

  const handleBlock = async (reqId) => {
    try {
      await blockRequester(reqId);
      setRequests(prev => prev.filter(r => r.id !== reqId));
    } catch (err) { console.error(err); }
  };

  // Calcular no leídos
  // Calcular si hay mensajes sin leer en esta conversación
  const hasUnread = (conv) => {
    const u = useStore.getState().user;
    // Si el último mensaje lo enviaste vos, no es no leído
    if (conv.lastMessage?.sender_id === u?.id) return false;
    if (typeof conv.unreadCount === 'number' && conv.unreadCount > 0) return true;
    if (!conv.lastMessage?.created_at) return false;
    if (!conv.lastReadAt) return true;
    return new Date(conv.lastMessage.created_at) > new Date(conv.lastReadAt);
  };

  // ── Reply ──

  const startReply = (msg) => {
    setReplyTo(msg);
    setInputText('');
    if (fileInputRef.current) fileInputRef.current.focus();
  };

  const cancelReply = () => setReplyTo(null);

  // ── Context Menu ──

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message: msg });
  };

  // ── Eliminar ──

  const handleDeleteMessage = async (msgId) => {
    setContextMenu(null);
    try {
      await deleteMessage(msgId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  // ── Reenviar ──

  const startForward = (msg) => {
    setContextMenu(null);
    setForwardTarget(msg);
    setForwardConvId('');
  };

  const handleForward = async () => {
    if (!forwardTarget || !forwardConvId) return;
    try {
      await forwardMessage(forwardTarget.id, forwardConvId);
      setForwardTarget(null);
    } catch (err) {
      console.error('Error forwarding:', err);
      alert('Error al reenviar mensaje');
    }
  };

  // ── Pin conversación ──

  const handlePinConv = async (convId) => {
    try {
      const res = await togglePinConversation(convId);
      setConversations(prev => prev.map(c =>
        c.id === convId ? { ...c, isPinned: res.data.pinned } : c
      ));
    } catch (err) {
      console.error('Error pinning conversation:', err);
    }
  };

  // ── Pin mensaje ──

  const handlePinMsg = async (msgId) => {
    setContextMenu(null);
    try {
      await togglePinMessage(activeConv.id, msgId);
      const res = await getPinnedMessage(activeConv.id);
      setPinnedMessage(res.data.pinnedMessage);
    } catch (err) {
      console.error('Error pinning message:', err);
    }
  };

  const handleUnpinMsg = async () => {
    try {
      await togglePinMessage(activeConv.id, null);
      setPinnedMessage(null);
    } catch (err) {
      console.error('Error unpinning message:', err);
    }
  };

  const handleStartEdit = (msg) => {
    setContextMenu(null);
    setEditingMessage(msg);
    setInputText(msg.decrypted || msg.encrypted_content || '');
    // Focus input
    setTimeout(() => messageInputRef.current?.focus(), 100);
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setInputText('');
  };

  // ── Nickname ──

  const handleNicknameSave = async () => {
    if (!activeConv) return;
    try {
      await setChatNickname(activeConv.id, nicknameInput);
      setConversations(prev => prev.map(c =>
        c.id === activeConv.id ? { ...c, myNickname: nicknameInput } : c
      ));
      setShowNicknameEdit(false);
    } catch (err) {
      console.error('Error setting nickname:', err);
    }
  };

  // ── Cerrar menú al hacer clic fuera ──
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowChatMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Ir a perfil ──
  const handleGoToProfile = () => {
    setShowChatMenu(false);
    if (activeConv?.otherUser?.id) {
      navigate(`/profile/${activeConv.otherUser.id}`);
    }
  };

  // ── PIN confirm para borrar historial ──
  const handleOpenPinConfirm = () => {
    setShowChatMenu(false);
    setPinError('');
    setShowPinConfirm(true);
  };

  const handlePinComplete = async (pin) => {
    await verifyPin(pinHash(pin));
    // PIN correcto → limpiar vista (no toca la BD)
    const key = `shekael_chat_cleared_${activeConv.id}`;
    localStorage.setItem(key, JSON.stringify({ clearedAt: new Date().toISOString() }));
    setMessages([]);
    setShowPinConfirm(false);
  };

  // ── Fondo de conversación ──
  const handleOpenBgPicker = () => {
    setShowChatMenu(false);
    setBgFile(null);
    // Guardar el fondo actual como original para poder cancelar
    setBgOriginalPreview(bgPreview);
    // Abre el file picker directamente
    bgInputRef.current?.click();
  };

  const handleBgFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen no debe superar 5MB');
      return;
    }
    setBgFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBgPreview(ev.target.result);
      setBgConfiguring(true);
    };
    reader.readAsDataURL(file);
  };

  const handleBgSave = () => {
    if (!bgPreview || !activeConv) return;
    try {
      const data = {
        dataUrl: bgPreview,
        opacity: bgOpacity
      };
      localStorage.setItem(`shekael_chat_bg_${activeConv.id}`, JSON.stringify(data));
      setBgConfiguring(false);
      setBgFile(null);
    } catch (e) {
      console.error('Error guardando fondo:', e);
    }
  };

  const handleBgCancel = () => {
    // Restaurar el original (lo que había antes de abrir el picker)
    setBgPreview(bgOriginalPreview);
    setBgFile(null);
    setBgConfiguring(false);
  };

  // Obtener fondo guardado al cambiar de conversación
  useEffect(() => {
    if (activeConv?.id) {
      const saved = localStorage.getItem(`shekael_chat_bg_${activeConv.id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setBgPreview(parsed.dataUrl);
          setBgOpacity(parsed.opacity ?? 5);
        } catch {}
      } else {
        setBgPreview(null);
        setBgOpacity(5);
      }
    }
  }, [activeConv?.id]);

  // ── Buscar en el chat (cliente-side, porque los mensajes están cifrados E2EE) ──

  const handleChatSearch = (q) => {
    setChatSearchQuery(q);
    if (!activeConv || q.length < 2) { setChatSearchResults([]); return; }
    const qLower = q.toLowerCase();
    const results = messages.filter(m =>
      !m.deleted_at &&
      m.decrypted &&
      m.decrypted.toLowerCase().includes(qLower)
    );
    setChatSearchResults(results);
  };

  // ── Insertar emoji ──

  const insertEmoji = (emoji) => {
    setInputText(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const EMOJIS = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😗','😙','😚','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','😡','😠','🤬','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💞','💗','💖','✨','🔥','⭐','🌟','💯','🎉','🎊','🎈','❤️‍🔥','💋','💀','👋','✋','🖐️','✌️','🤞','👍','👎','👊','✊','🤛','🤜','👏','🙌','🤲','🤝','🙏','✍️','💅','👀','🗣️','👤','👥','💬','💭','🫂','🏆','🥇','🥈','🥉'];

  // ── Adjuntar archivos ──

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);

    // Preview para imágenes
    if (file.type?.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setFilePreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Tecla Enter para enviar
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.layout} ref={chatLayoutRef}>
      {/* Panel izquierdo: conversaciones */}
      <div ref={sidePanelRef} className={`${styles.sidePanel} ${isMobile && activeConv ? styles.sidePanelHidden : ''}`}>
        <div className={styles.sideHeader}>
          <div className={styles.sideHeaderTop}>
            <h2>{user?.displayName || user?.email?.split('@')[0] || 'Chats'}</h2>
            <div className={styles.headerActions}>
            <button
              className={`${styles.requestBtn} ${requests.length > 0 ? styles.hasRequests : ''}`}
              onClick={() => setShowRequests(!showRequests)}
              title="Solicitudes"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12c0 1.82.487 3.53 1.338 5L2 22l5-1.338A9.96 9.96 0 0 0 12 22z"/>
                <path d="M8 12h8M12 8v8"/>
              </svg>
              {requests.length > 0 && <span className={styles.badge}>{requests.length}</span>}
            </button>
            <button
              className={`${styles.searchToggle} ${showSearch ? styles.active : ''}`}
              onClick={() => setShowSearch(!showSearch)}
              title="Nuevo chat"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
            <button
              className={styles.toolBtn}
              onClick={() => setShowGroupCreate(true)}
              title="Nuevo grupo"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </button>
          </div>
        </div>
          <div className={styles.filterTabs}>
            <button
              className={`${styles.filterTab} ${convFilter === 'all' ? styles.filterActive : ''}`}
              onClick={() => setConvFilter('all')}
            >
              Todos
            </button>
            <button
              className={`${styles.filterTab} ${convFilter === 'unread' ? styles.filterActive : ''}`}
              onClick={() => setConvFilter('unread')}
            >
              No leídos
            </button>
          </div>
        </div>

        {/* Búsqueda de usuarios */}
        {showSearch && (
          <div className={styles.searchPanel}>
            <input
              type="text"
              placeholder="Buscar usuario..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className={styles.searchInput}
              autoFocus
            />
            <div className={styles.searchResults}>
              {searchResults.map(u => (
                <div key={u.id} className={styles.searchUser}>
                  <div className={styles.searchUserAvatar}>
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" />
                    ) : (
                      <div className={styles.avatarPlaceholder}>
                        {u.display_name?.[0] || '?'}
                      </div>
                    )}
                  </div>
                  <div className={styles.searchUserInfo}>
                    <span className={styles.searchUserName}>{u.display_name}</span>
                    <span className={styles.userStatus}>
                      {u.requestStatus === 'pending' ? 'Solicitud enviada' :
                       u.requestStatus === 'accepted' ? 'En contacto' :
                       u.requestStatus === 'rejected' ? 'Solicitud rechazada' :
                       u.requestStatus === 'blocked' ? 'Bloqueado' : ''}
                    </span>
                  </div>
                  {!u.requestStatus && (
                    <button
                      className={styles.sendRequestBtn}
                      onClick={() => handleSendRequest(u.id)}
                    >
                      Enviar solicitud
                    </button>
                  )}
                </div>
              ))}
              {searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className={styles.noResults}>No se encontraron usuarios</div>
              )}
            </div>
          </div>
        )}

        {/* Solicitudes pendientes */}
        {showRequests && (
          <div className={styles.requestsPanel}>
            <h3>Solicitudes pendientes</h3>
            {requests.length === 0 ? (
              <p className={styles.noRequests}>No tienes solicitudes pendientes</p>
            ) : (
              requests.map(req => (
                <div key={req.id} className={styles.requestItem}>
                  <div className={styles.requestUser}>
                    <div className={styles.avatarSmall}>
                      {req.from_user?.avatar_url ? (
                        <img src={req.from_user.avatar_url} alt="" />
                      ) : (
                        <div className={styles.avatarPlaceholder}>
                          {req.from_user?.display_name?.[0] || '?'}
                        </div>
                      )}
                    </div>
                    <span className={styles.requestUserName}>
                      {req.from_user?.display_name || 'Usuario'}
                    </span>
                  </div>
                  <div className={styles.requestActions}>
                    <button className={styles.acceptBtn} onClick={() => handleAccept(req.id)} title="Aceptar">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </button>
                    <button className={styles.rejectBtn} onClick={() => handleReject(req.id)} title="Rechazar">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                    <button className={styles.blockBtn} onClick={() => handleBlock(req.id)} title="Bloquear">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Lista de conversaciones */}
        <div className={styles.conversationsList}>
          {loading ? (
            <div className={styles.loadingState}>Cargando...</div>
          ) : conversations.length === 0 && !showSearch ? (
            <div className={styles.emptyState}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.25">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p>Todavía no hay nada</p>
              <p className={styles.emptyHint}>
                Busca a alguien presionando{' '}
                <button className={styles.emptyActionBtn} onClick={() => setShowSearch(true)}>
                  + Nuevo chat
                </button>
              </p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className={styles.noResults}>
              {convFilter === 'unread' ? 'No hay chats no leídos' : 'Sin conversaciones'}
            </div>
          ) : (
            filteredConversations.map(conv => {
              const displayName = conv.myNickname || conv.otherUser?.display_name || 'Usuario';
              return (
                <div
                  key={conv.id}
                  className={`${styles.convItem} ${activeConv?.id === conv.id ? styles.activeConv : ''} ${conv.isPinned ? styles.pinnedConv : ''} ${hasUnread(conv) ? styles.unreadConv : ''}`}
                  onClick={() => selectConversation(conv)}
                >
                  <div className={styles.avatarSmall}>
                    {conv.otherUser?.avatar_url ? (
                      <img src={conv.otherUser.avatar_url} alt="" />
                    ) : (
                      <div className={styles.avatarPlaceholder}>
                        {displayName[0] || '?'}
                      </div>
                    )}
                    {hasUnread(conv) && (
                      <span className={styles.unreadBadge}>
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className={styles.convInfo}>
                    <span className={styles.convName}>
                      {displayName}
                    </span>
                    <span className={`${styles.convPreview} ${hasUnread(conv) ? styles.convPreviewUnread : ''}`}>
                      {conv.lastMessage?.decrypted
                        ? conv.lastMessage.decrypted.substring(0, 40)
                        : conv.lastMessage?.message_type === 'image' ? 'Foto'
                        : conv.lastMessage?.message_type === 'audio' ? 'Audio'
                        : conv.lastMessage?.message_type === 'file' ? 'Archivo'
                        : 'Mensaje'}
                    </span>
                  </div>
                  <button
                    className={styles.pinBtn}
                    onClick={(e) => { e.stopPropagation(); handlePinConv(conv.id); }}
                    title={conv.isPinned ? 'Desfijar' : 'Fijar'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={conv.isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/>
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Panel derecho: conversación activa */}
      <div ref={chatPanelRef} className={`${styles.chatPanel}${bgPreview ? ` ${styles.hasCustomBg}` : ''}${isMobile && activeConv ? ` ${styles.chatPanelFullscreen}` : ''}`} style={{
        '--pattern-url': `url(${bgPatternUrl})`,
        ...(bgPreview ? {
          '--custom-bg-url': `url(${bgPreview})`,
          '--custom-bg-opacity': bgOpacity / 10,
        } : {}),
      }}>
        {!activeConv ? (
          <div className={styles.noChat}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p>Selecciona una conversación</p>
          </div>
        ) : (
          <>
            <div className={styles.messagesList} ref={msgListRef}>
              <div className={styles.stickyGroup}>
              <div className={styles.chatHeader}>
              <div className={styles.chatHeaderUser}>
                {isMobile && (
                  <button
                    className={styles.mobileBackBtn}
                    onClick={() => { setActiveConv(null); setChatConversationMode(false); }}
                    title="Volver a chats"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>
                    </svg>
                  </button>
                )}
                <div className={styles.avatarSmall}>
                  {activeConv.otherUser?.avatar_url ? (
                    <img src={activeConv.otherUser.avatar_url} alt="" />
                  ) : (
                    <div className={styles.avatarPlaceholder}>
                      {activeConv.otherUser?.display_name?.[0] || '?'}
                    </div>
                  )}
                </div>
                <div className={styles.chatHeaderInfo}>
                  <span
                    className={styles.chatHeaderName}
                    onClick={() => {
                      setNicknameInput(activeConv.myNickname || '');
                      setShowNicknameEdit(true);
                    }}
                    title="Cambiar apodo"
                  >
                    {activeConv.myNickname || activeConv.otherUser?.display_name || 'Usuario'}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.editIcon}>
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </span>
                  {typingUsers[activeConv.otherUser?.id] && (
                    <div className={styles.typingIndicator}>
                      <span className={styles.typingDots}>
                        <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
                      </span>
                      Escribiendo...
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.chatHeaderActions}>
                <button
                  className={styles.chatActionBtn}
                  onClick={() => setShowChatSearch(!showChatSearch)}
                  title="Buscar en el chat"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                </button>
                <div className={styles.menuWrapper} ref={menuRef}>
                  <button
                    className={styles.chatActionBtn}
                    onClick={() => setShowChatMenu(!showChatMenu)}
                    title="Más opciones"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                    </svg>
                  </button>
                  {showChatMenu && (
                    <div className={styles.chatMenu}>
                      <button className={styles.chatMenuItem} onClick={handleOpenPinConfirm}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        Eliminar historial
                      </button>
                      <button className={styles.chatMenuItem} onClick={handleGoToProfile}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                        Ir a perfil
                      </button>
                      <button className={styles.chatMenuItem} onClick={handleOpenBgPicker}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                        Cambiar fondo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pinned message banner */}
            {pinnedMessage && (
              <div ref={pinnedBannerWrapRef}
                className={styles.pinnedBanner}
                onClick={() => {
                  const el = document.getElementById(`msg-${pinnedMessage.id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.style.background = 'var(--color-primary-glow)';
                    setTimeout(() => { el.style.background = ''; }, 1500);
                  }
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/>
                </svg>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.pinnedArrow}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                <span className={styles.pinnedText}>
                  {pinnedMessage.decryptedText ||
                   pinnedMessage.media_url && pinnedMessage.message_type !== 'audio' ? (<span className={styles.replyMediaInline}><img src={pinnedMessage.media_thumb_url||pinnedMessage.media_url} alt="" className={styles.replyThumb} /> Foto</span>) : (pinnedMessage.file_name || pinnedMessage.message_type === 'audio' ? 'Audio' : 'Mensaje fijado')}
                </span>
                <button className={styles.pinnedClose} onClick={(e) => { e.stopPropagation(); handleUnpinMsg(); }} title="Desfijar">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}

            {/* Chat search */}
            {showChatSearch && (
              <div ref={chatSearchWrapRef} className={styles.chatSearchPanel}>
                <input
                  type="text"
                  placeholder="Buscar en esta conversación..."
                  autoFocus
                  className={styles.chatSearchInput}
                  value={chatSearchQuery}
                  onChange={(e) => handleChatSearch(e.target.value)}
                />
                {chatSearchQuery.length >= 2 && (
                  <div className={styles.chatSearchResults}>
                    {chatSearchResults.map(m => (
                      <div
                        key={m.id}
                        className={styles.chatSearchItem}
                        onClick={() => {
                          const el = document.getElementById(`msg-${m.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.style.background = 'var(--color-primary-glow)';
                            setTimeout(() => { el.style.background = ''; }, 1500);
                          }
                          setShowChatSearch(false);
                          setChatSearchQuery('');
                        }}
                      >
                        <span className={styles.chatSearchContent}>
                          {(m.decrypted || m.file_name || 'Mensaje').substring(0, 60)}
                        </span>
                        <span className={styles.chatSearchDate}>
                          {new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                    {chatSearchResults.length === 0 && (
                      <div className={styles.noResults}>Sin resultados</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!keysReady && (
              <div className={styles.keysWarning}>
                <span>Generando llaves de cifrado...</span>
              </div>
            )}
            </div>
            <div className={styles.messagesContent}>
              {messages.length === 0 ? (
                <div className={styles.noMessages}>
                  <p>No hay mensajes aún</p>
                  <p className={styles.emptyHint}>Envía el primer mensaje</p>
                </div>
              ) : (
                messages.filter(m => !m.deleted_at).map(msg => {
                  const isImage = msg.message_type === 'image';
                  const isFile = msg.message_type === 'file';
                  const isAudio = msg.message_type === 'audio';
                  const isPoll = msg.message_type === 'poll';
                  const msgText = msg.decrypted || (isImage || isFile || isAudio || isPoll ? '' : '[Cifrado]');

                  // Encontrar replied message para mostrar preview
                  const repliedMsg = msg.reply_to_id
                    ? messages.find(m => m.id === msg.reply_to_id)
                    : null;

                  return (
                    <div
                      key={msg.id}
                      id={`msg-${msg.id}`}
                      className={`${styles.message} ${msg.sender_id === user?.id ? styles.ownMessage : styles.otherMessage}`}
                      onContextMenu={(e) => handleContextMenu(e, msg)}
                    >
                      {/* Reply indicator */}
                      {msg.reply_to_id && (
                        <div
                          className={styles.replyIndicator}
                          onClick={() => {
                            const el = document.getElementById(`msg-${msg.reply_to_id}`);
                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}
                        >
                          <div className={styles.replyBar} />
                          <div className={styles.replyContent}>
                            <span className={styles.replyName}>
                              {repliedMsg?.sender_id === user?.id ? 'Tú' : 'Respondiendo'}
                            </span>
                            <span className={styles.replyText}>
                              {msg.media_url ? (
                                <span className={styles.replyMediaInline}>
                              <img src={msg.media_thumb_url||msg.media_url} alt="" className={styles.replyThumb} />
                              Foto
                            </span>
                              ) : (msg.reply_preview || 'Mensaje original').substring(0, 60)}
                            </span>
                          </div>
                        </div>
                      )}
                      {/* Imagen */}
                      {/* Imagen + caption */}
                      {isImage && msg.media_url && (
                        <div className={styles.mediaCard}>
                          <div
                            className={styles.mediaBubble}
                            onClick={() => setLightboxUrl(msg.media_url)}
                          >
                            <img
                              src={msg.media_thumb_url || msg.media_url}
                              alt={msgText || 'Imagen'}
                              className={styles.mediaImage}
                              loading="lazy"
                            />
                          </div>
                          {msgText && <div className={styles.mediaCaption}>{msgText}</div>}
                        </div>
                      )}
                      {/* Documento + caption */}
                      {isFile && msg.media_url && (
                        <div className={styles.mediaCard}>
                          <div className={styles.fileBubble}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                            </svg>
                            <div className={styles.fileInfo}>
                              <span className={styles.fileName}>{msg.file_name || 'Archivo'}</span>
                              {msg.file_size && (
                                <span className={styles.fileSize}>
                                  {(msg.file_size / 1024 / 1024).toFixed(1)} MB
                                </span>
                              )}
                            </div>
                          </div>
                          {msgText && <div className={styles.mediaCaption}>{msgText}</div>}
                        </div>
                      )}
                      {/* Audio */}
                      {isAudio && msg.media_url && (
                        <div className={styles.audioBubble}>
                          <AudioPlayer
                            src={msg.media_url}
                            mimeType={msg.mime_type}
                            initialDuration={msg.duration}
                            isActive={activeAudioId === msg.id}
                            onActivate={() => setActiveAudioId(msg.id)}
                            onComplete={() => {
                              const audioMessages = messages.filter(m => m.message_type === 'audio' && m.media_url);
                              const currentIdx = audioMessages.findIndex(m => m.id === msg.id);
                              const nextAudio = audioMessages[currentIdx + 1];
                              if (nextAudio) {
                                setActiveAudioId(nextAudio.id);
                              } else {
                                setActiveAudioId(null);
                              }
                            }}
                          />
                        </div>
                      )}
                      {/* Texto (solo si NO hay imagen/file para evitar duplicados) */}
                      {!isImage && !isFile && msgText && (
                        <div className={styles.messageBubble}>
                          {msgText}
                        </div>
                      )}
                      <span className={styles.messageTime}>
                        {msg.edited_at && <span className={styles.editedIndicator}>editado </span>}
                        {new Date(msg.created_at).toLocaleTimeString('es-MX', {
                          hour: '2-digit', minute: '2-digit'
                        })}
                        {msg.sender_id === user?.id && (
                          <span className={styles.statusIcon}>
                            {msg._sending ? (
                              <span className={styles.sendingIndicator}>◌</span>
                            ) : msg.delivered_at ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-text-dim)" stroke="none">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M7 12l3 3 7-7" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 12l5 5 11-11"/>
                              </svg>
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            </div>

            {/* ── Background config bar ── */}
            {bgConfiguring && bgPreview && (
              <div className={styles.bgConfigBar}>
                <div className={styles.bgConfigBarContent}>
                  <div className={styles.bgConfigBarSlider}>
                    <span>1</span>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={bgOpacity}
                      onChange={e => setBgOpacity(Number(e.target.value))}
                    />
                    <span>10</span>
                  </div>
                  <div className={styles.bgConfigBarActions}>
                    <button onClick={handleBgCancel}>Cancelar</button>
                    <button onClick={handleBgSave}>Listo</button>
                  </div>
                </div>
              </div>
            )}

            {/* Hidden file input for background (siempre montado) */}
            <input
              type="file"
              accept="image/*"
              onChange={handleBgFileSelect}
              ref={bgInputRef}
              style={{ display: 'none' }}
            />

            <div ref={inputAreaRef} className={styles.inputArea}>
              {/* Edit indicator */}
              {editingMessage && (
                <div ref={editPreviewWrapRef} className={styles.replyPreview}>
                  <div className={styles.replyPreviewBar} style={{background: 'var(--color-primary, #3b82f6)'}} />
                  <div className={styles.replyPreviewContent}>
                    <span className={styles.replyPreviewLabel}>Editando mensaje</span>
                    <span className={styles.replyPreviewText}>
                      {editingMessage.decrypted?.substring(0, 60) || '...'}
                    </span>
                  </div>
                  <button className={styles.removeFileBtn} onClick={() => { setEditingMessage(null); setInputText(''); }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              )}
              {/* Reply preview */}
              {replyTo && (
                <div ref={replyPreviewWrapRef} className={styles.replyPreview}>
                  <div className={styles.replyPreviewBar} />
                  <div className={styles.replyPreviewContent}>
                    <span className={styles.replyPreviewLabel}>Respondiendo</span>
                    <span className={styles.replyPreviewText}>
                      {replyTo.decrypted
                        ? replyTo.decrypted.substring(0, 60)
                        : replyTo.media_url && replyTo.message_type !== 'audio' ? (<span className={styles.replyMediaInline}><img src={replyTo.media_thumb_url||replyTo.media_url} alt="" className={styles.replyThumb} /> Foto</span>) : (replyTo.file_name || replyTo.message_type === 'audio' ? 'Audio' : 'Mensaje')}
                    </span>
                  </div>
                  <button className={styles.removeFileBtn} onClick={cancelReply}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              )}
              {/* Preview de archivo seleccionado */}
              {selectedFile && (
                <div ref={filePreviewWrapRef} className={styles.filePreviewStrip}>
                  {filePreview ? (
                    <div className={styles.previewImageWrap}>
                      <img src={filePreview} alt="Preview" className={styles.previewImage} />
                    </div>
                  ) : (
                    <div className={styles.previewFileInfo}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className={styles.previewFileName}>{selectedFile.name}</span>
                    </div>
                  )}
                  <button className={styles.removeFileBtn} onClick={handleRemoveFile}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                  {filePreview && inputText && (
                    <span className={styles.previewCaption}>{inputText}</span>
                  )}
                </div>
              )}

              {showAudioRecorder && (
                <div ref={audioRecorderWrapRef}>
                <AudioRecorder
                  onSend={async (audio) => {
                    try {
                      setSending(true);
                      const otherUser = otherUserCache.current[activeConv.id];
                      const { encryptedContent, nonce } = await legacyEncrypt('', otherUser?.public_key);
                      const res = await sendMessage(
                        activeConv.id, encryptedContent, nonce,
                        -1, null, null, 'audio', audio.url, null,
                        audio.fileName, audio.fileSize, audio.mimeType, audio.duration
                      );
                      if (res.data?.message) {
                        setMessages(prev => [...prev, { ...res.data.message, decrypted: '' }]);
                        prevMsgIdsRef.current.add(res.data.message.id);
                      }
                    } catch (e) { console.error('Audio send err:', e); alert('Error:\n' + (e.message || e)); }
                    setSending(false);
                  }}
                  onClose={() => setShowAudioRecorder(false)}
                />
                </div>
              )}
              <div className={styles.inputRow}>
                <button
                  className={styles.attachBtn}
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  disabled={!keysReady || uploading}
                  title="Adjuntar"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                {showAttachMenu && (
                  <div ref={attachMenuWrapRef}>
                  <div className={styles.attachMenu}>
                    <button onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
                      Archivo
                    </button>
                    <button onClick={() => { setShowPollCreator(true); setShowAttachMenu(false); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                      Encuesta
                    </button>
                  </div>
                </div>
                )}
                <button
                  className={styles.toolBtn}
                  onClick={() => setShowStickerPicker(!showStickerPicker)}
                  disabled={!keysReady}
                  title="Emojis y Stickers"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                    <line x1="9" y1="9" x2="9.01" y2="9"/>
                    <line x1="15" y1="9" x2="15.01" y2="9"/>
                  </svg>
                </button>
                {showStickerPicker && (
                  <div className={styles.attachMenu}>
                    <button onClick={() => { setShowPickerTab('emojis'); setShowStickerPicker(false); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg>
                      Emojis
                    </button>
                    <button onClick={() => { setShowPickerTab('stickers'); setShowStickerPicker(false); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z"/></svg>
                      Stickers
                    </button>
                  </div>
                )}
                {/* Emoji picker inline cuando se selecciona Emojis */}
                {showPickerTab === 'emojis' && (
                  <div className={styles.emojiPicker}>
                    <div className={styles.emojiHeader}>
                      <span>Emojis</span>
                      <button className={styles.emojiClose} onClick={() => setShowPickerTab('')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    <div className={styles.emojiGrid}>
                      {EMOJIS.map((e, i) => (
                        <button key={i} className={styles.emojiItem} onClick={() => insertEmoji(e)}>{e}</button>
                      ))}
                    </div>
                  </div>
                )}
                <input
                  type="text"
                  placeholder={editingMessage ? 'Editar mensaje...' : selectedFile ? 'Agrega un pie de foto...' : replyTo ? 'Escribe una respuesta...' : 'Escribe un mensaje...'}
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    if (activeConv?.id && !editingMessage) emitTyping(activeConv.id, true);
                  }}
                  onKeyDown={handleKeyDown}
                  className={styles.messageInput}
                  disabled={!keysReady || uploading}
                  ref={messageInputRef}
                />
                <button
                  className={`${styles.sendBtn} ${showAudioRecorder ? styles.sendBtnRecording : ''}`}
                  onMouseDown={(e) => {
                    if (inputText.trim() || selectedFile) return;
                    e.currentTarget._longPressTimer = setTimeout(() => {
                      setShowAudioRecorder(true);
                    }, 400);
                  }}
                  onMouseUp={(e) => {
                    const timer = e.currentTarget._longPressTimer;
                    if (timer) {
                      clearTimeout(timer);
                      delete e.currentTarget._longPressTimer;
                      if (inputText.trim() || selectedFile) handleSend();
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (e.currentTarget._longPressTimer) {
                      clearTimeout(e.currentTarget._longPressTimer);
                      delete e.currentTarget._longPressTimer;
                    }
                  }}
                  onTouchStart={(e) => {
                    if (inputText.trim() || selectedFile) return;
                    e.preventDefault();
                    const touch = e.touches[0];
                    e.currentTarget._touchY = touch.clientY;
                    e.currentTarget._longPressTimer = setTimeout(() => {
                      setShowAudioRecorder(true);
                    }, 400);
                  }}
                  onTouchMove={(e) => {
                    const timer = e.currentTarget._longPressTimer;
                    if (!timer && !showAudioRecorder) return;
                    const touch = e.touches[0];
                    const dy = (e.currentTarget._touchY || touch.clientY) - touch.clientY;
                    if (dy > 60) {
                      setShowAudioRecorder(false);
                      if (timer) { clearTimeout(timer); delete e.currentTarget._longPressTimer; }
                    }
                  }}
                  onTouchEnd={(e) => {
                    const timer = e.currentTarget._longPressTimer;
                    if (timer) {
                      clearTimeout(timer);
                      delete e.currentTarget._longPressTimer;
                      if (inputText.trim() || selectedFile) handleSend();
                    }
                    delete e.currentTarget._touchY;
                  }}
                  disabled={sending || uploading || !keysReady}
                >
                  {showAudioRecorder ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="2" width="6" height="12" rx="3"/>
                      <path d="M5 10a7 7 0 0 0 14 0"/>
                      <line x1="12" y1="19" x2="12" y2="22"/>
                    </svg>
                  ) : uploading ? (
                    <span className={styles.uploadingSpinner} />
                  ) : sending ? '...' : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 19V5m0 0l-7 7m7-7l7 7" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className={styles.contextMenuItem} onClick={() => { startReply(contextMenu.message); setContextMenu(null); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Responder
          </button>
          <button className={styles.contextMenuItem} onClick={() => startForward(contextMenu.message)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            Reenviar
          </button>
          {contextMenu.message.sender_id === user?.id && (
            <>
              <button className={styles.contextMenuItem} onClick={() => handleStartEdit(contextMenu.message)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Editar
              </button>
              <button className={styles.contextMenuItem} onClick={() => handlePinMsg(contextMenu.message.id)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/>
                </svg>
                Fijar mensaje
              </button>
              <button className={`${styles.contextMenuItem} ${styles.dangerItem}`} onClick={() => handleDeleteMessage(contextMenu.message.id)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Eliminar
              </button>
            </>
          )}
        </div>
      )}

      {/* Nickname edit modal */}
      {showNicknameEdit && (
        <div className={styles.modalOverlay} onClick={() => setShowNicknameEdit(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3>Apodo para este chat</h3>
            <input
              autoFocus
              className={styles.modalInput}
              placeholder="Escribe un apodo..."
              value={nicknameInput}
              onChange={e => setNicknameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleNicknameSave(); }}
            />
            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} onClick={() => setShowNicknameEdit(false)}>Cancelar</button>
              <button className={styles.modalSaveBtn} onClick={handleNicknameSave}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Forward picker modal */}
      {forwardTarget && (
        <div className={styles.modalOverlay} onClick={() => setForwardTarget(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3>Reenviar mensaje</h3>
            <p className={styles.forwardSelectLabel}>Selecciona una conversación:</p>
            <div className={styles.forwardConvList}>
              {conversations.filter(c => c.id !== activeConv?.id).map(conv => {
                const dName = conv.myNickname || conv.otherUser?.display_name || 'Usuario';
                return (
                  <div
                    key={conv.id}
                    className={`${styles.forwardConvItem} ${forwardConvId === conv.id ? styles.forwardConvActive : ''}`}
                    onClick={() => setForwardConvId(conv.id)}
                  >
                    <div className={styles.avatarSmall}>
                      {conv.otherUser?.avatar_url ? (
                        <img src={conv.otherUser.avatar_url} alt="" />
                      ) : (
                        <div className={styles.avatarPlaceholder}>
                          {dName[0] || '?'}
                        </div>
                      )}
                    </div>
                    <span>{dName}</span>
                  </div>
                );
              })}
              {conversations.length <= 1 && (
                <p className={styles.noResults}>No hay otras conversaciones</p>
              )}
            </div>
            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} onClick={() => setForwardTarget(null)}>Cancelar</button>
              <button className={styles.modalSaveBtn} onClick={handleForward} disabled={!forwardConvId}>
                Reenviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox para imágenes */}
      {lightboxUrl && (
        <div className={styles.lightbox} onClick={() => setLightboxUrl(null)}>
          <button className={styles.lightboxClose} onClick={() => setLightboxUrl(null)}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <img src={lightboxUrl} alt="" className={styles.lightboxImage} />
        </div>
      )}

      {/* Sticker picker */}
      {showPickerTab === 'stickers' && (
        <StickerPicker
          onSelect={async (imageUrl) => {
            setShowPickerTab('');
            try {
              setSending(true);
              const { encryptedContent, nonce } = await legacyEncrypt('', otherUser?.public_key);
              const res = await sendMessage(
                activeConv.id, encryptedContent, nonce,
                -1, null, null, 'image', imageUrl, imageUrl,
                null, null, 'image/png'
              );
              if (res.data?.message) {
                setMessages(prev => [...prev, { ...res.data.message, decrypted: '' }]);
                prevMsgIdsRef.current.add(res.data.message.id);
              }
            } catch (e) { console.error('Sticker send err:', e); alert('Error al enviar sticker:\n' + (e.message || e)); }
            setSending(false);
          }}
          onClose={() => setShowPickerTab('')}
        />
      )}



      {/* Poll creator */}
      {showPollCreator && activeConv && (
        <PollCreator
          conversationId={activeConv.id}
          onCreated={async (poll) => {
            // Enviar mensaje del sistema con el poll_id
            try {
              const { encryptedContent, nonce } = await legacyEncrypt('Encuesta: ' + poll?.question, otherUserCache.current[activeConv.id]?.public_key);
              const res = await sendMessage(
                activeConv.id, encryptedContent, nonce,
                -1, null, null, 'poll', null, null,
                null, null, null, null, poll?.id
              );
              if (res.data?.message) {
                setMessages(prev => [...prev, { ...res.data.message, decrypted: 'Encuesta: ' + poll?.question, poll_id: poll?.id }]);
                prevMsgIdsRef.current.add(res.data.message.id);
              }
            } catch (e) { console.error('Poll msg send err:', e); }
            loadData();
          }}
          onClose={() => setShowPollCreator(false)}
        />
      )}

      {/* Group create modal */}
      {showGroupCreate && (
        <GroupCreateModal
          onCreated={(convId) => {
            setShowGroupCreate(false);
            // Select the new group conversation
            loadConversations();
          }}
          onClose={() => setShowGroupCreate(false)}
        />
      )}

      {/* PIN confirmation modal (reusable PinKeypad) */}
      {showPinConfirm && (
        <PinKeypad
          mode="enter"
          title="Confirmar PIN"
          subtitle="Ingresa tu PIN para borrar el historial"
          onComplete={handlePinComplete}
          onCancel={() => { setShowPinConfirm(false); setPinError(''); }}
          error={pinError}
          loading={false}
        />
      )}

    </div>
  );
}


