import styles from './Chat.module.css';

export default function ChatHeader({
  isMobile,
  activeConv,
  typingUsers,
  onBack,
  onNicknameEdit,
  showChatSearch,
  onToggleChatSearch,
  showChatMenu,
  onToggleChatMenu,
  menuRef,
  onClearHistory,
  onGoToProfile,
  onOpenBgPicker,
}) {
  return (
    <div className={styles.chatHeader}>
      <div className={styles.chatHeaderUser}>
        {isMobile && (
          <button
            className={styles.mobileBackBtn}
            onClick={onBack}
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
            onClick={activeConv.isBusinessChat ? undefined : onNicknameEdit}
            title={activeConv.isBusinessChat ? 'Conversación con un comercio' : 'Cambiar apodo'}
          >
            {activeConv.isBusinessChat
              ? `Comercio · ${activeConv.businessName || activeConv.otherUser?.display_name || 'Negocio'}`
              : activeConv.myNickname || activeConv.otherUser?.display_name || 'Usuario'}
            {!activeConv.isBusinessChat && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.editIcon}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            )}
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
          onClick={onToggleChatSearch}
          title="Buscar en el chat"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </button>
        <div className={styles.menuWrapper} ref={menuRef}>
          <button
            className={styles.chatActionBtn}
            onClick={onToggleChatMenu}
            title="Más opciones"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>
          {showChatMenu && (
            <div className={styles.chatMenu}>
              <button className={styles.chatMenuItem} onClick={onClearHistory}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Eliminar historial
              </button>
              <button className={styles.chatMenuItem} onClick={onGoToProfile}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                Ir a perfil
              </button>
              <button className={styles.chatMenuItem} onClick={onOpenBgPicker}>
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
  );
}
