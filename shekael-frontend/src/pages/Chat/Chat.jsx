import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../store';
import useChatCrypto from '../../hooks/useChatCrypto';
import useRatchetSession from '../../hooks/useRatchetSession';
import { getUserProfile } from '../../api/users.api';
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
  const ratchet = useRatchetSession();

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
  const ratchetReadyRef = useRef(false); // si ya se recuperó la sesión del ratchet

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

  // Derivar shared secret ECDH (permanente para la conversación)
  const deriveEcdhSecret = useCallback(async (convId, theirPublicKey) => {
    if (sharedSecretCache.current[convId]) return sharedSecretCache.current[convId];
    if (!theirPublicKey) return null;

    await sodiumReady;
    const kp = await crypto.loadKeyPair();
    if (!kp) return null;

    const sharedSecret = _sodium.crypto_box_beforenm(
      _sodium.from_base64(theirPublicKey),
      _sodium.from_base64(kp.privateKey)
    );
    sharedSecretCache.current[convId] = sharedSecret;
    return sharedSecret;
  }, [crypto]);

  // Cargar mensajes al seleccionar conversación
  const selectConversation = useCallback(async (conv) => {
    setActiveConv(conv);
    setShowSearch(false);
    setMessages([]);
    ratchetReadyRef.current = false;

    try {
      const res = await getMessages(conv.id);
      const msgs = res.data.messages || [];

      // Cachear llaves públicas
      const otherUser = conv.otherUser;
      if (otherUser?.public_key) {
        otherUserCache.current[conv.id] = otherUser;
      }

      // Buscar si hay mensajes con pre-key (X3DH — mensajes offline)
      const x3dhMsg = msgs.find(m => m.sender_ephemeral_key && m.pre_key_used_id != null);
      let sharedSecret;

      if (x3dhMsg) {
        // Este mensaje se cifró con una pre-key nuestra → recuperar shared secret via X3DH
        try {
          await sodiumReady;
          // Buscar la pre-key privada en IndexedDB
          const pdb = await new Promise((resolve, reject) => {
            const req = indexedDB.open('ShekaelPreKeys', 1);
            req.onupgradeneeded = () => {
              if (!req.result.objectStoreNames.contains('prekeys'))
                req.result.createObjectStore('prekeys', { keyPath: 'id' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          const ptx = pdb.transaction('prekeys', 'readonly');
          const pstore = ptx.objectStore('prekeys');
          // Intentar one-time pre-key primero
          const storedKey = await new Promise((resolve) => {
            const req = pstore.get(`otpk_${x3dhMsg.pre_key_used_id}`);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          });
          const myPreKey = storedKey || await new Promise((resolve) => {
            const req = pstore.get('signed');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          });
          pdb.close();

          if (myPreKey) {
            // Necesitamos la identity key del remitente
            let senderPubKey = otherUser?.public_key;
            if (!senderPubKey) {
              try {
                const senderRes = await getUserProfile(x3dhMsg.sender_id);
                senderPubKey = (senderRes.data?.user || senderRes.data)?.public_key;
              } catch {}
            }
            if (senderPubKey) {
              sharedSecret = await ratchet.recoverFromPreKey(
                conv.id,
                myPreKey.privateKey,
                x3dhMsg.sender_ephemeral_key,
                senderPubKey
              );
            }
          }
        } catch (e) {
          console.warn('X3DH recovery failed:', e);
        }
      }

      if (!sharedSecret) {
        // Modo normal: derivar shared secret ECDH
        if (!otherUser?.public_key) {
          setMessages(msgs);
          return;
        }
        sharedSecret = await deriveEcdhSecret(conv.id, otherUser.public_key);
      }

      if (!sharedSecret) {
        setMessages(msgs);
        return;
      }

      // Recuperar sesión del ratchet + descifrar mensajes
      const keys = await ratchet.recoverSession(conv.id, sharedSecret, msgs);

      // Descifrar cada mensaje con su llave derivada del ratchet
      const decrypted = [];
      for (const msg of msgs) {
        const msgKey = msg.msg_index ? keys.get(msg.msg_index) : null;
        if (msgKey) {
          try {
            const plaintext = _sodium.to_string(
              _sodium.crypto_secretbox_open_easy(
                _sodium.from_base64(msg.encrypted_content),
                _sodium.from_base64(msg.nonce),
                msgKey
              )
            );
            decrypted.push({ ...msg, decrypted: plaintext });
            continue;
          } catch {
            decrypted.push({ ...msg, decrypted: '[Mensaje cifrado]' });
            continue;
          }
        }
        // Sin msgIndex o sin llave — intentar descifrado legacy
        try {
          const plaintext = await crypto.decrypt(
            msg.encrypted_content,
            msg.nonce,
            otherUser.public_key
          );
          decrypted.push({ ...msg, decrypted: plaintext });
        } catch {
          decrypted.push({ ...msg, decrypted: '[Mensaje cifrado]' });
        }
      }

      ratchetReadyRef.current = true;
      setMessages(decrypted);
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }, [crypto, ratchet, deriveEcdhSecret]);

  // Descifrar mensajes entrantes nuevos (cuando se reciben sin recargar la página)
  const decryptMessages = async (msgs, otherUser, convId) => {
    if (!otherUser?.public_key) return msgs;
    const decrypted = [];

    for (const msg of msgs) {
      try {
        // Si tiene msgIndex, usar ratchet
        if (msg.msg_index && sharedSecretCache.current[convId]) {
          const sharedSecret = sharedSecretCache.current[convId];
          const msgKey = await ratchet.deriveKeyForIndex(convId, sharedSecret, msg.msg_index);
          const plaintext = _sodium.to_string(
            _sodium.crypto_secretbox_open_easy(
              _sodium.from_base64(msg.encrypted_content),
              _sodium.from_base64(msg.nonce),
              msgKey
            )
          );
          decrypted.push({ ...msg, decrypted: plaintext });
        } else {
          // Fallback legacy
          const plaintext = await crypto.decrypt(
            msg.encrypted_content,
            msg.nonce,
            otherUser.public_key
          );
          decrypted.push({ ...msg, decrypted: plaintext });
        }
      } catch {
        decrypted.push({ ...msg, decrypted: '[Mensaje cifrado]' });
      }
    }
    return decrypted;
  };

  // Enviar mensaje con ratchet (forward secrecy) + soporte offline vía pre-keys
  const handleSend = async () => {
    if (!inputText.trim() || sending || !activeConv) return;
    if (!keysReady) return;

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

    if (!otherUser?.public_key) {
      // Intento 2: usar pre-key para mensaje offline
      try {
        const { fetchPreKey } = await import('../../api/chats.api');
        const pkRes = await fetchPreKey(otherUser.id);
        const pkData = pkRes.data;

        if (pkData.preKey) {
          // Tenemos una pre-key — hacer X3DH
          await sodiumReady;
          const kp = await crypto.loadKeyPair();
          if (!kp) throw new Error('No keypair');

          const x3dhResult = await ratchet.deriveFullX3DH(
            kp.privateKey,
            pkData.identityKey || pkData.preKey.publicKey,
            pkData.preKey.publicKey
          );
          sharedSecret = x3dhResult.sharedSecret;
          ephemeralPubB64 = x3dhResult.ephemeralPublicKey;
          preKeyUsedId = pkData.preKey.key_id;
          usingPreKey = true;
        } else if (pkData.identityKey) {
          // Solo identity key disponible
          sharedSecret = await deriveEcdhSecret(activeConv.id, pkData.identityKey);
          otherUser = { ...otherUser, public_key: pkData.identityKey };
          otherUserCache.current[activeConv.id] = otherUser;
        }
      } catch { /* sin pre-keys ni identity */ }
    } else {
      // Tiene public_key, derivar shared secret normal
      sharedSecret = await deriveEcdhSecret(activeConv.id, otherUser.public_key);
    }

    if (!sharedSecret) {
      alert('El usuario aun no ha configurado el cifrado. Pidele que entre a la seccion de chats para activarlo.');
      return;
    }

    // Asegurar que la sesión del ratchet existe (sin resetear si ya había estado)
    if (!ratchetReadyRef.current) {
      const existing = await ratchet.loadState(activeConv.id);
      if (!existing) {
        await ratchet.initSession(activeConv.id, sharedSecret);
      }
      ratchetReadyRef.current = true;
    }

    setSending(true);
    try {
      const { msgKey, msgIndex } = await ratchet.nextKey(activeConv.id);

      await sodiumReady;
      const nonce = _sodium.randombytes_buf(_sodium.crypto_secretbox_NONCEBYTES);
      const ciphertext = _sodium.crypto_secretbox_easy(
        _sodium.from_string(inputText),
        nonce,
        msgKey
      );

      const res = await sendMessage(
        activeConv.id,
        _sodium.to_base64(ciphertext),
        _sodium.to_base64(nonce),
        msgIndex,
        ephemeralPubB64,
        preKeyUsedId
      );
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


