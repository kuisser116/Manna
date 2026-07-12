import { useState, useEffect } from 'react';
import { getStickers, uploadSticker, toggleStickerFav } from '../api/chats.api';
import styles from './StickerPicker.module.css';

export default function StickerPicker({ onSelect, onClose }) {
  const [stickers, setStickers] = useState([]);
  const [tab, setTab] = useState('defaults');

  useEffect(() => {
    loadStickers();
  }, []);

  const loadStickers = async () => {
    try {
      const { data } = await getStickers();
      setStickers(data?.stickers || []);
    } catch (e) { console.warn('Stickers load err:', e); }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadSticker(file);
      loadStickers();
      setTab('mine');
    } catch (e) { console.warn('Sticker upload err:', e); }
  };

  const handleFav = async (id) => {
    try {
      await toggleStickerFav(id);
      loadStickers();
    } catch (e) { console.warn('Fav err:', e); }
  };

  const defaults = stickers.filter(s => s.is_default);
  const mine = stickers.filter(s => !s.is_default);
  const favs = stickers.filter(s => s.is_favorite);

  let list = [];
  if (tab === 'defaults') list = defaults;
  else if (tab === 'mine') list = mine;
  else if (tab === 'fav') list = favs;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.picker} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Stickers</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {tab === 'mine' && (
          <label className={styles.uploadArea}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Subir sticker</span>
            <input type="file" accept="image/*" hidden onChange={handleUpload} />
          </label>
        )}

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'defaults' ? styles.activeTab : ''}`} onClick={() => setTab('defaults')}>Default</button>
          <button className={`${styles.tab} ${tab === 'mine' ? styles.activeTab : ''}`} onClick={() => setTab('mine')}>Mis stickers</button>
          <button className={`${styles.tab} ${tab === 'fav' ? styles.activeTab : ''}`} onClick={() => setTab('fav')}>Favoritos</button>
        </div>

        <div className={styles.grid}>
          {list.map(s => (
            <div key={s.id} className={styles.stickerWrap}>
              <img src={s.image_url} alt="sticker" className={styles.sticker} onClick={() => onSelect(s.image_url)} />
              {!s.is_default && (
                <button className={styles.favBtn} onClick={() => handleFav(s.id)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill={s.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>
              )}
            </div>
          ))}
          {list.length === 0 && <p className={styles.empty}>Sin stickers todavia</p>}
        </div>
      </div>
    </div>
  );
}
