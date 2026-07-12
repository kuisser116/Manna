import { useState, useEffect, useRef } from 'react';
import { createGroup } from '../api/chats.api';
import useStore from '../store';
import styles from './GroupCreateModal.module.css';

export default function GroupCreateModal({ onCreated, onClose }) {
  const [step, setStep] = useState(1); // 1 = nombre, 2 = miembros
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [creating, setCreating] = useState(false);
  const user = useStore(s => s.user);
  const inputRef = useRef(null);

  useEffect(() => {
    if (step === 1) inputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (search.length < 2) { setUsers([]); return; }
    const timer = setTimeout(async () => {
      try {
        const { default: axios } = await import('axios');
        const API_URL = import.meta.env.VITE_API_URL || location.origin;
        const token = localStorage.getItem('Shekael_token')?.replace(/"/g, '');
        // Usar chats api search users
        const { data } = await axios.get(`${API_URL}/chats/users/search?q=${encodeURIComponent(search)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUsers(data?.users?.filter(u => u.id !== user?.id) || []);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [search, user?.id]);

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

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {step === 1 && (
          <>
            <div className={styles.header}>
              <span className={styles.title}>Nuevo grupo</span>
              <button className={styles.closeBtn} onClick={onClose}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <input ref={inputRef} className={styles.input} placeholder="Nombre del grupo" value={name} onChange={e => setName(e.target.value)} maxLength={50} autoFocus />
            <button className={styles.createBtn} disabled={!name.trim()} onClick={() => setStep(2)}>
              Siguiente
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <div className={styles.header}>
              <span className={styles.title}>Agregar miembros</span>
              <button className={styles.closeBtn} onClick={onClose}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={styles.selectedChips}>
              {selectedIds.map(id => {
                const u = users.find(x => x.id === id);
                return u ? <span key={id} className={styles.chip}>{u.display_name} <button onClick={() => toggleUser(id)}>x</button></span> : null;
              })}
            </div>
            <input className={styles.input} placeholder="Buscar usuarios..." value={search} onChange={e => setSearch(e.target.value)} />
            <div className={styles.userList}>
              {users.map(u => (
                <div key={u.id} className={`${styles.userRow} ${selectedIds.includes(u.id) ? styles.selected : ''}`} onClick={() => toggleUser(u.id)}>
                  <img src={u.avatar_url || '/default-avatar.png'} alt="" className={styles.avatar} />
                  <span className={styles.userName}>{u.display_name}</span>
                  {selectedIds.includes(u.id) && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-primary)" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.footerBtns}>
              <button className={styles.backBtn} onClick={() => setStep(1)}>Atras</button>
              <button className={styles.createBtn} onClick={handleCreate} disabled={creating}>
                {creating ? 'Creando...' : `Crear grupo (${selectedIds.length + 1})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
