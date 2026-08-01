import styles from './ChatContextMenu.module.css';

export default function ChatContextMenu({
  contextMenu,
  user,
  onReply,
  onForward,
  onEdit,
  onPin,
  onDelete,
  onClose,
}) {
  if (!contextMenu) return null;

  return (
    <div
      className={styles.menu}
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button
        className={styles.item}
        onClick={() => { onReply(contextMenu.message); onClose(); }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Responder
      </button>

      <button className={styles.item} onClick={() => onForward(contextMenu.message)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
          <polyline points="16 6 12 2 8 6"/>
          <line x1="12" y1="2" x2="12" y2="15"/>
        </svg>
        Reenviar
      </button>

      {contextMenu.message.sender_id === user?.id && (
        <>
          <button className={styles.item} onClick={() => { onEdit(contextMenu.message); onClose(); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Editar
          </button>
          <button className={styles.item} onClick={() => { onPin(contextMenu.message.id); onClose(); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/>
            </svg>
            Fijar mensaje
          </button>
          <button className={`${styles.item} ${styles.danger}`} onClick={() => { onDelete(contextMenu.message.id); onClose(); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Eliminar
          </button>
        </>
      )}
    </div>
  );
}
