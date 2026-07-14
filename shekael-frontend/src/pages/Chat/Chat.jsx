import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import bgPatternUrl from '../../assets/patterns/profile-bg-pattern.svg';
import useStore from '../../store';
import * as signalProtocol from '../../crypto/signalProtocol';
import { getUserProfile } from '../../api/users.api';
import _sodium, { ready as sodiumReady } from 'libsodium-wrappers';
import { getKeyPair } from '../../crypto/keyStore';
import {
  getConversations, getMessages, sendMessage,
  getMessageRequests, acceptRequest, rejectRequest, blockRequester,
  searchUsers, sendMessageRequest, updatePublicKey,
  uploadChatFile,
  searchChatMessages, deleteMessage, forwardMessage,
  togglePinConversation, setChatNickname, setChatBackground,
  togglePinMessage, getPinnedMessage
} from '../../api/chats.api';
import styles from './Chat.module.css';
import StickerPicker from '../../components/StickerPicker';
import AudioRecorder from '../../components/AudioRecorder';
import PollCreator from '../../components/PollCreator';
import PollResults from '../../components/PollResults';
import GroupCreateModal from '../../components/GroupCreateModal';
import AudioPlayer from '../../components/AudioPlayer';
import { generateInvite, joinGroup, leaveGroup, toggleSaveMessage } from '../../api/chats.api';


export default function Chat() {
  const navigate = useNavigate();
  const { user } = useStore();
  // signalProtocol usa keyStore singleton — no necesita hook

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
  const sharedSecretCache = useRef({}); // { [convId]: Uint8Array } ECDH shared secret

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

  // Emoji picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef(null);

  // Reenviar
  const [forwardTarget, setForwardTarget] = useState(null); // message being forwarded
  const [forwardConvId, setForwardConvId] = useState('');

  // Nuevos modales
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [showGroupCreate, setShowGroupCreate] = useState(false);

  // Pin
  const [pinnedMessage, setPinnedMessage] = useState(null);

  // Audio auto-play
  const [activeAudioId, setActiveAudioId] = useState(null);

  // Nickname edit
  const [showNicknameEdit, setShowNicknameEdit] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');

  // Filtro: 'all' | 'unread'
  const [convFilter, setConvFilter] = useState('all');
  const animatedMsgIdsRef = useRef(new Set());
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
      { opacity: 0, y: 16, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.35, stagger: 0.04, ease: 'power3.out' }
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
      { opacity: 0, x: -10 },
      { opacity: 1, x: 0, duration: 0.3, stagger: 0.025, ease: 'power2.out', overwrite: 'auto' }
    );
  }, [filteredConversations]);

  // Cerrar emoji picker al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

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

  // Cargar conversaciones y solicitudes al montar, sin esperar crypto
  useEffect(() => {
    loadData();
    // Polling de conversaciones cada 6s
    const convPoll = setInterval(async () => {
      try {
        const convRes = await getConversations();
        setConversations(convRes.data.conversations || []);
      } catch {}
    }, 6000);
    return () => clearInterval(convPoll);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [convRes, reqRes] = await Promise.all([
        getConversations(),
        getMessageRequests()
      ]);
      setConversations(convRes.data.conversations || []);
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

  // Derivar shared secret ECDH (permanente para la conversación)
  const deriveEcdhSecret = useCallback(async (convId, theirPublicKey) => {
    if (sharedSecretCache.current[convId]) {
      return sharedSecretCache.current[convId];
    }
    if (!theirPublicKey) {
      return null;
    }

    await sodiumReady;
    const kp = getKeyPair();
    if (!kp) {
      return null;
    }

    const sharedSecret = _sodium.crypto_box_beforenm(
      _sodium.from_base64(theirPublicKey),
      _sodium.from_base64(kp.privateKey)
    );
    sharedSecretCache.current[convId] = sharedSecret;
    return sharedSecret;
  }, []);

  // Legacy decrypt (ECDH directo) para mensajes viejos sin ratchet
  const legacyDecrypt = useCallback(async (encryptedContent, nonceB64, theirPublicKey) => {
    const ss = _sodium.crypto_box_beforenm(
      _sodium.from_base64(theirPublicKey),
      _sodium.from_base64(getKeyPair().privateKey)
    );
    return _sodium.to_string(
      _sodium.crypto_secretbox_open_easy(
        _sodium.from_base64(encryptedContent),
        _sodium.from_base64(nonceB64),
        ss
      )
    );
  }, []);

  // Legacy encrypt (ECDH directo) para compatibilidad con sistema anterior
  const legacyEncrypt = useCallback(async (plaintext, theirPublicKey) => {
    const ss = _sodium.crypto_box_beforenm(
      _sodium.from_base64(theirPublicKey),
      _sodium.from_base64(getKeyPair().privateKey)
    );
    const nonce = _sodium.randombytes_buf(_sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = _sodium.crypto_secretbox_easy(
      _sodium.from_string(plaintext), nonce, ss
    );
    return {
      encryptedContent: _sodium.to_base64(ciphertext),
      nonce: _sodium.to_base64(nonce)
    };
  }, []);

  // Load pinned message after selectConversation sets sharedSecretCache
  const loadPinnedMessage = useCallback(async (convId) => {
    try {
      const res = await getPinnedMessage(convId);
      const pm = res.data.pinnedMessage;
      if (!pm) { setPinnedMessage(null); return; }

      let decryptedText = null;
      const ss = sharedSecretCache.current[convId];
      if (ss && pm.msg_index) {
        try {
          decryptedText = _sodium.to_string(
            _sodium.crypto_secretbox_open_easy(
              _sodium.from_base64(pm.encrypted_content),
              _sodium.from_base64(pm.nonce),
              ss
            )
          );
        } catch { /* falló descifrado */ }
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

    prevMsgIdsRef.current = new Set();

    let msgs = [];
    let otherUser = conv.otherUser;

    try {
      const res = await getMessages(conv.id);
      msgs = (res?.data?.messages) || [];
      // Cachear llaves públicas
      if (otherUser?.public_key) {
        otherUserCache.current[conv.id] = otherUser;
      }

      // Intentar inicializar sesión Signal Protocol si no existe
      const hasSigSession = await signalProtocol.hasSession(conv.id);
      if (!hasSigSession && otherUser?.public_key) {
        // fetch pre-key bundle del otro usuario
        try {
          const token = localStorage.getItem('Shekael_token')?.replace(/"/g, '');
          const { default: axios } = await import('axios');
          const API_URL = import.meta.env.VITE_API_URL || location.origin;
          const bundleRes = await axios.get(`${API_URL}/auth/pre-keys/bundle/${otherUser.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const bundle = bundleRes.data;
          
          if (bundle.identityKey && bundle.signedPreKey) {
            const kp = getKeyPair();
            if (kp) {
              await signalProtocol.initSessionAsAlice(conv.id, bundle, kp);
              console.log('[Signal] Session initialized for', conv.id.substring(0,8));
            }
          }
        } catch (e) {
          console.warn('[Signal] Could not init session:', e.message);
        }
      }

      // Asegurar que tenemos public_key para fallback ECDH (mensajes legacy y audio)
      if (!otherUser?.public_key && otherUser?.id) {
        try {
          const res = await getUserProfile(otherUser.id);
          const fresh = res.data?.user || res.data;
          if (fresh?.public_key) {
            otherUser = { ...otherUser, public_key: fresh.public_key };
          }
        } catch {}
      }

      if (!otherUser?.public_key) {
        setMessages(msgs); scrollToBottom(); return;
      }

      // No hacemos X3DH recovery — los mensajes viejos se descifran con ECDH fallback
      let sharedSecret;
      if (!hasSigSession) {
        sharedSecret = await deriveEcdhSecret(conv.id, otherUser.public_key);
        if (!sharedSecret) {
          setMessages(msgs); scrollToBottom(); return;
        }
      }

      const decrypted = [];
      for (const msg of msgs) {
        // Mensaje sin cifrar (antes de que el otro tuviera llaves)
        if (msg.nonce === 'plaintext') {
          decrypted.push({ ...msg, decrypted: msg.encrypted_content || '' });
          continue;
        }
      // Intentar Signal Protocol primero (Double Ratchet)
        // Solo para mensajes que fueron cifrados con ratchet (msg_index >= 0)
        if (msg.msg_index >= 0 && await signalProtocol.hasSession(conv.id)) {
          try {
            const plaintext = await signalProtocol.decrypt(conv.id, {
              encryptedContent: msg.encrypted_content,
              nonce: msg.nonce,
              ephemeralPubKey: msg.sender_ephemeral_key,
              msgIndex: msg.msg_index || 0
            });
            decrypted.push({ ...msg, decrypted: plaintext });
            continue;
          } catch { /* fallback a ECDH */ }
        }
        // Fallback: ECDH directo (para mensajes del sistema anterior)
        try {
          const plaintext = await legacyDecrypt(msg.encrypted_content, msg.nonce, otherUser.public_key);
          decrypted.push({ ...msg, decrypted: plaintext });
          continue;
        } catch {
          decrypted.push({ ...msg, decrypted: '[Mensaje cifrado]' });
        }
      }

      setMessages(decrypted);
      // Inicializar ref de IDs para el polling
      decrypted.forEach(m => prevMsgIdsRef.current.add(m.id));
      scrollToBottom();
      loadPinnedMessage(conv.id);
    } catch (err) {
      console.error('Error loading messages:', err);
      if (msgs && msgs.length > 0) {
        setMessages(msgs.map(m => ({ ...m, decrypted: '[Mensaje cifrado]' })));
        scrollToBottom();
      }
    }
  }, [deriveEcdhSecret, loadPinnedMessage]);

  // Polling: buscar mensajes nuevos cada 4s
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

        const otherUser = otherUserCache.current[convId];
        const decrypted = [];
        for (const msg of newMsgs) {
          prevMsgIdsRef.current.add(msg.id);
          if (msg.nonce === 'plaintext') {
            decrypted.push({ ...msg, decrypted: msg.encrypted_content || '' });
            continue;
          }
          try {
            const pt = otherUser?.public_key
              ? await legacyDecrypt(msg.encrypted_content, msg.nonce, otherUser.public_key)
              : null;
            decrypted.push({ ...msg, decrypted: pt ?? '[Mensaje cifrado]' });
          } catch {
            decrypted.push({ ...msg, decrypted: '[Mensaje cifrado]' });
          }
        }

        setMessages(prev => [...prev, ...decrypted]);
        scrollToBottom();
      } catch { /* polling falló */ }
    }, 4000);

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
      // Intentar Signal Protocol primero
      // Solo para mensajes cifrados con ratchet (msg_index >= 0)
      if (msg.msg_index >= 0 && await signalProtocol.hasSession(convId)) {
        try {
          const plaintext = await signalProtocol.decrypt(convId, {
            encryptedContent: msg.encrypted_content,
            nonce: msg.nonce,
            ephemeralPubKey: msg.sender_ephemeral_key,
            msgIndex: msg.msg_index || 0
          });
          decrypted.push({ ...msg, decrypted: plaintext });
          continue;
        } catch { /* fallback a ECDH */ }
      }
      // Fallback: ECDH directo (para mensajes del sistema anterior)
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

    let otherUser = activeConv.otherUser || otherUserCache.current[activeConv.id];
    let usingPreKey = false;
    let ephemeralPubB64 = null;
    let preKeyUsedId = null;
    let sharedSecret;
    
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

    // Intentar usar Signal Protocol (Double Ratchet)
    let sigSession = await signalProtocol.hasSession(activeConv.id);
    
    if (!sigSession && otherUser?.public_key) {
      // No hay sesión — intentar iniciar X3DH
      try {
        const token = localStorage.getItem('Shekael_token')?.replace(/"/g, '');
        const { default: axios } = await import('axios');
        const API_URL = import.meta.env.VITE_API_URL || location.origin;
        const bundleRes = await axios.get(`${API_URL}/auth/pre-keys/bundle/${otherUser.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const bundle = bundleRes.data;
        
        if (bundle.identityKey && bundle.signedPreKey) {
          const kp = getKeyPair();
          if (kp) {
            const result = await signalProtocol.initSessionAsAlice(activeConv.id, bundle, kp);
            sigSession = true;
            ephemeralPubB64 = result.ephemeralPubB64;
            preKeyUsedId = result.preKeyUsedId;
            await sodiumReady;
            console.log('[Signal] Session established for', activeConv.id.substring(0,8));
          }
        }
      } catch (e) {
        console.warn('[Signal] Could not init session, trying ECDH:', e.message);
        // Fallback a ECDH
        if (otherUser?.public_key) {
          sharedSecret = await deriveEcdhSecret(activeConv.id, otherUser.public_key);
        }
      }
    }

    if (!sigSession && !sharedSecret) {
      // No hay forma de cifrar — enviar sin cifrar
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

    setSending(true);
    try {
      let encryptedContent, nonce, result;
      
      if (sigSession) {
        // Signal Protocol: Double Ratchet encrypt
        result = await signalProtocol.encrypt(activeConv.id, inputText);
        encryptedContent = result.encryptedContent;
        nonce = result.nonce;
        // Si el mensaje trae nueva llave efímera del ratchet, enviarla
        if (result.ephemeralPubKey) {
          ephemeralPubB64 = result.ephemeralPubKey;
        }
      } else {
        // Legacy: ECDH directo
        const legacyResult = await legacyEncrypt(inputText, otherUser.public_key);
        encryptedContent = legacyResult.encryptedContent;
        nonce = legacyResult.nonce;
      }

      const messageType = hasFile ? (selectedFile.type?.startsWith('image/') ? 'image' : 'file') : 'text';

      let replyPreview = null;
      if (replyTo) {
        replyPreview = (replyTo.decrypted || '').substring(0, 80);
      }

      const res = await sendMessage(
        activeConv.id,
        encryptedContent,
        nonce,
        sigSession ? (result.msgIndex ?? -1) : -1,
        ephemeralPubB64,
        preKeyUsedId,
        messageType,
        uploadedUrl,
        uploadedThumb,
        fileMeta.fileName,
        fileMeta.fileSize,
        fileMeta.mimeType
      );

      // Set reply info locally FIRST (optimistic), then try to persist on server
      if (replyTo && res.data.message?.id) {
        res.data.message.reply_to_id = replyTo.id;
        res.data.message.reply_preview = replyPreview;
        try {
          const token = localStorage.getItem('Shekael_token')?.replace(/"/g, '');
          const { default: axios } = await import('axios');
          const API_URL = import.meta.env.VITE_API_URL || location.origin;
          await axios.patch(`${API_URL}/chats/messages/${res.data.message.id}`, {
            reply_to_id: replyTo.id,
            reply_preview: replyPreview
          }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (patchErr) {
          console.warn('Reply PATCH failed but local state already has the data');
        }
      }

      const displayText = hasFile ? (inputText || '') : inputText;
      setMessages(prev => [...prev, { ...res.data.message, decrypted: displayText }]);
      prevMsgIdsRef.current.add(res.data.message.id);
      setInputText('');
      handleRemoveFile();
      cancelReply();
      scrollToBottom();
    } catch (err) {
      console.error('Error sending:', err);
      alert('Error al enviar el mensaje cifrado. Intenta de nuevo.');
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
  const unreadCount = 0; // Se puede implementar después con last_read_at

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
    <div className={styles.layout}>
      {/* Panel izquierdo: conversaciones */}
      <div className={styles.sidePanel}>
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
                  className={`${styles.convItem} ${activeConv?.id === conv.id ? styles.activeConv : ''} ${conv.isPinned ? styles.pinnedConv : ''}`}
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
                  </div>
                  <div className={styles.convInfo}>
                    <span className={styles.convName}>
                      {displayName}
                    </span>
                    <span className={styles.convPreview}>
                      {conv.lastMessage?.decrypted
                        ? conv.lastMessage.decrypted.substring(0, 40)
                        : 'Mensaje cifrado'}
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
      <div className={styles.chatPanel} style={{ '--pattern-url': `url(${bgPatternUrl})` }}>
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
              </div>
            </div>

            {/* Pinned message banner */}
            {pinnedMessage && (
              <div
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
              <div className={styles.chatSearchPanel}>
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
                      {isImage && msg.media_url && (
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
                      )}
                      {/* Documento */}
                      {isFile && msg.media_url && (
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
                              // Play next audio message
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
                      {/* Texto */}
                      {msgText && (
                        <div className={styles.messageBubble}>
                          {msgText}
                        </div>
                      )}
                      <span className={styles.messageTime}>
                        {new Date(msg.created_at).toLocaleTimeString('es-MX', {
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            </div>

            <div className={styles.inputArea}>
              {/* Reply preview */}
              {replyTo && (
                <div className={styles.replyPreview}>
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
                <div className={styles.filePreviewStrip}>
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
              )}
              <div className={styles.inputRow}>
                <button
                  className={styles.attachBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!keysReady || uploading}
                  title="Adjuntar imagen o archivo"
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
                <button
                  className={styles.emojiBtn}
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  disabled={!keysReady}
                  title="Emoji"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                    <line x1="9" y1="9" x2="9.01" y2="9"/>
                    <line x1="15" y1="9" x2="15.01" y2="9"/>
                  </svg>
                </button>
                <button
                  className={styles.toolBtn}
                  onClick={() => setShowStickerPicker(true)}
                  disabled={!keysReady}
                  title="Sticker"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z"/>
                    <path d="M12 2c6 0 10 4 10 10l-10 2-2 10C4 22 2 17.5 2 12c0-5.5 4.5-10 10-10z"/>
                    <circle cx="9" cy="9" r="1" fill="currentColor"/>
                    <circle cx="15" cy="9" r="1" fill="currentColor"/>
                  </svg>
                </button>
                <button
                  className={styles.toolBtn}
                  onClick={() => setShowAudioRecorder(true)}
                  disabled={!keysReady}
                  title="Audio"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="22"/>
                  </svg>
                </button>
                <button
                  className={styles.toolBtn}
                  onClick={() => setShowPollCreator(true)}
                  disabled={!keysReady}
                  title="Encuesta"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                    <line x1="7" y1="13" x2="10" y2="13"/>
                    <line x1="14" y1="13" x2="17" y2="13"/>
                    <line x1="7" y1="17" x2="10" y2="17"/>
                    <line x1="14" y1="17" x2="17" y2="17"/>
                  </svg>
                </button>
                {/* Emoji picker popover */}
                {showEmojiPicker && (
                  <div className={styles.emojiPicker} ref={emojiPickerRef}>
                    <div className={styles.emojiGrid}>
                      {EMOJIS.map((e, i) => (
                        <button
                          key={i}
                          className={styles.emojiItem}
                          onClick={() => insertEmoji(e)}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <input
                  type="text"
                  placeholder={selectedFile ? 'Agrega un pie de foto...' : replyTo ? 'Escribe una respuesta...' : 'Escribe un mensaje...'}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={styles.messageInput}
                  disabled={!keysReady || uploading}
                />
                <button
                  className={styles.sendBtn}
                  onClick={handleSend}
                  disabled={(!inputText.trim() && !selectedFile) || sending || uploading || !keysReady}
                >
                  {uploading ? (
                    <span className={styles.uploadingSpinner} />
                  ) : sending ? '...' : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>
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
      {showStickerPicker && (
        <StickerPicker
          onSelect={async (imageUrl) => {
            setShowStickerPicker(false);
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
          onClose={() => setShowStickerPicker(false)}
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


    </div>
  );
}


