import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../store';
import useChatCrypto from '../../hooks/useChatCrypto';
import _sodium, { ready as sodiumReady } from 'libsodium-wrappers';
import {
  getConversations, getMessages, sendMessage,
  getMessageRequests, acceptRequest, rejectRequest, blockRequester,
  searchUsers, sendMessageRequest, updatePublicKey
} from '../../api/chats.api';
import styles from './Chat.module.css';

export default function Chat() {
  const navigate = useNavigate();
  const { user } = useStore();
  const crypto = useChatCrypto();

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

  // Inicializar crypto — genera llaves con libsodium (import estático)
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Esperar a que libsodium esté listo
        await sodiumReady;
        if (cancelled) return;

        // 2. Verificar si ya hay llaves locales
        await crypto.loadKeyPair();
        let has = await crypto.hasKeys().catch(() => false);

        if (has) {
          setKeysReady(true);
          return;
        }

        // 3. Generar nuevo par de llaves
        const kp = _sodium.crypto_box_keypair();
        const keyPair = {
          publicKey: _sodium.to_base64(kp.publicKey),
          privateKey: _sodium.to_base64(kp.privateKey)
        };

        // 4. Guardar en IndexedDB
        try {
          const db = await openKeyDB();
          const tx = db.transaction('keys', 'readwrite');
          const store = tx.objectStore('keys');
          await new Promise((resolve, reject) => {
            const req = store.put({ id: 'main', ...keyPair });
            req.onsuccess = resolve;
            req.onerror = reject;
          });
          db.close();
        } catch (e) {
          console.warn('No se pudo guardar en IndexedDB:', e);
        }

        // 5. Subir llave pública al servidor (best-effort)
        try {
          await updatePublicKey(keyPair.publicKey);
        } catch {
          console.warn('No se pudo subir la llave pública');
        }

        if (!cancelled) setKeysReady(true);
      } catch (e) {
        console.error('Error al inicializar cifrado:', e);
        if (!cancelled) setKeysReady(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Helper IndexedDB (mismo que useChatCrypto pero acá no depende de nada)
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

  // Cargar mensajes al seleccionar conversación
  const selectConversation = useCallback(async (conv) => {
    setActiveConv(conv);
    setShowSearch(false);
    setMessages([]);

    try {
      const res = await getMessages(conv.id);
      const msgs = res.data.messages || [];

      // Cachear llaves públicas y descifrar
      const otherUser = conv.otherUser;
      if (otherUser?.public_key) {
        otherUserCache.current[conv.id] = otherUser;
      }

      // Intentar descifrar mensajes
      const decrypted = await decryptMessages(msgs, otherUser);
      setMessages(decrypted || msgs);
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }, []);

  // Descifrar lote de mensajes
  const decryptMessages = async (msgs, otherUser) => {
    if (!otherUser?.public_key) return msgs;
    const decrypted = [];
    for (const msg of msgs) {
      try {
        const plaintext = await crypto.decrypt(
          msg.encrypted_content,
          msg.nonce,
          otherUser.public_key
        );
        decrypted.push({ ...msg, decrypted: plaintext });
      } catch {
        // Si falla descifrado, mostrar como cifrado
        decrypted.push({ ...msg, decrypted: '[Mensaje cifrado]' });
      }
    }
    return decrypted;
  };

  // Enviar mensaje (siempre cifrado)
  const handleSend = async () => {
    if (!inputText.trim() || sending || !activeConv) return;
    if (!keysReady) return;

    const otherUser = activeConv.otherUser || otherUserCache.current[activeConv.id];
    if (!otherUser?.public_key) {
      alert('El usuario aún no ha configurado el cifrado. Intenta más tarde.');
      return;
    }

    setSending(true);
    try {
      const { encryptedContent, nonce } = await crypto.encrypt(inputText, otherUser.public_key);
      const res = await sendMessage(activeConv.id, encryptedContent, nonce);
      setMessages(prev => [...prev, { ...res.data.message, decrypted: inputText }]);
      setInputText('');
      scrollToBottom();
    } catch (err) {
      console.error('Error sending:', err);
      alert('Error al enviar el mensaje cifrado. Intenta de nuevo.');
    } finally {
      setSending(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

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
          <h2>Chats</h2>
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
          ) : conversations.length === 0 ? null : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`${styles.convItem} ${activeConv?.id === conv.id ? styles.activeConv : ''}`}
                onClick={() => selectConversation(conv)}
              >
                <div className={styles.avatarSmall}>
                  {conv.otherUser?.avatar_url ? (
                    <img src={conv.otherUser.avatar_url} alt="" />
                  ) : (
                    <div className={styles.avatarPlaceholder}>
                      {conv.otherUser?.display_name?.[0] || '?'}
                    </div>
                  )}
                </div>
                <div className={styles.convInfo}>
                  <span className={styles.convName}>
                    {conv.otherUser?.display_name || 'Usuario'}
                  </span>
                  <span className={styles.convPreview}>
                    {conv.lastMessage?.decrypted
                      ? conv.lastMessage.decrypted.substring(0, 40)
                      : 'Mensaje cifrado'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Panel derecho: conversación activa */}
      <div className={styles.chatPanel}>
        {!activeConv ? (
          <div className={styles.noChat}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p>Selecciona una conversación</p>
          </div>
        ) : (
          <>
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
                <span>{activeConv.otherUser?.display_name || 'Usuario'}</span>
              </div>

            </div>

            {!keysReady && (
              <div className={styles.keysWarning}>
                <span>⚠️ Generando llaves de cifrado...</span>
              </div>
            )}

            <div className={styles.messagesList} ref={msgListRef}>
              {messages.length === 0 ? (
                <div className={styles.noMessages}>
                  <p>No hay mensajes aún</p>
                  <p className={styles.emptyHint}>Envía el primer mensaje</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`${styles.message} ${msg.sender_id === user?.id ? styles.ownMessage : styles.otherMessage}`}
                  >
                    <div className={styles.messageBubble}>
                      {msg.decrypted || '[Cifrado]'}
                    </div>
                    <span className={styles.messageTime}>
                      {new Date(msg.created_at).toLocaleTimeString('es-MX', {
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className={styles.inputArea}>
              <input
                type="text"
                placeholder="Escribe un mensaje..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                className={styles.messageInput}
                disabled={!keysReady}
              />
              <button
                className={styles.sendBtn}
                onClick={handleSend}
                disabled={!inputText.trim() || sending || !keysReady}
              >
                {sending ? '...' : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                  </svg>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


