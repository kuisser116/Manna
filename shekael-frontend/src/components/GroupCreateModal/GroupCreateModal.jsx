import { useState, useEffect } from 'react';
import { createGroup } from '../../api/chats.api';
import useStore from '../../store';
import styles from './GroupCreateModal.module.css';

export default function GroupCreateModal({ onCreated, onClose }) {
  const [name, setName] = useState('');
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [creating, setCreating] = useState(false);
  const user = useStore(s => s.user);

  useEffect(() => {
    // Load existing contacts (people from conversations)
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const { default: axios } = await import('axios');
      const API_URL = import.meta.env.VITE_API_URL || location.origin;
      const token = localStorage.getItem('Shekael_token')?.replace(/"/g, '');
      const { data } = await axios.get(`${API_URL}/chats/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const unique = [];
      const seen = new Set();
      (data?.conversations || []).forEach(c => {
        if (c.otherUser?.id && !seen.has(c.otherUser.id) && c.otherUser.id !== user?.id) {
          seen.add(c.otherUser.id);
          unique.push(c.otherUser);
        }
      });
      setContacts(unique);
    } catch {}
  };

  const toggleUser = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { data } = await createGroup(name.trim(), '', selectedIds);
      onCreated?.(data.conversationId);
      onClose?.();
    } catch (e) { console.warn('Group create err:', e); }
    setCreating(false);
  };

  const filtered = contacts.filter(c =>
    c.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Nuevo grupo</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <input className={styles.input} placeholder="Nombre del grupo" value={name} onChange={e => setName(e.target.value)} maxLength={50} autoFocus />

        <div className={styles.selectedChips}>
          {selectedIds.map(id => {
            const u = contacts.find(x => x.id === id);
            return u ? <span key={id} className={styles.chip}>{u.display_name} <button onClick={() => toggleUser(id)}>x</button></span> : null;
          })}
        </div>

        <input className={styles.searchInput} placeholder="Buscar en contactos..." value={search} onChange={e => setSearch(e.target.value)} />

        <div className={styles.userList}>
          {filtered.map(u => (
            <div key={u.id} className={`${styles.userRow} ${selectedIds.includes(u.id) ? styles.selected : ''}`} onClick={() => toggleUser(u.id)}>
              <img src={u.avatar_url || '/default-avatar.png'} alt="" className={styles.avatar} />
              <span className={styles.userName}>{u.display_name}</span>
              {selectedIds.includes(u.id) && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-primary)" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </div>
          ))}
          {contacts.length === 0 && <p className={styles.empty}>No tienes contactos aun, invita a alguien primero</p>}
          {contacts.length > 0 && filtered.length === 0 && <p className={styles.empty}>Sin resultados</p>}
        </div>

        <button className={styles.createBtn} onClick={handleCreate} disabled={!name.trim() || creating}>
          {creating ? 'Creando...' : `Crear grupo (${selectedIds.length + 1})`}
        </button>
      </div>
    </div>
  );
}
