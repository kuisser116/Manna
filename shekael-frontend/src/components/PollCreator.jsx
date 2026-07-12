import { useState } from 'react';
import { createPoll } from '../api/chats.api';
import styles from './PollCreator.module.css';

export default function PollCreator({ conversationId, onCreated, onClose }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  const addOption = () => setOptions([...options, '']);
  const removeOption = (i) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, idx) => idx !== i));
  };
  const setOption = (i, v) => {
    const copy = [...options];
    copy[i] = v;
    setOptions(copy);
  };

  const handleCreate = async () => {
    if (!question.trim()) return;
    const validOptions = options.map(o => o.trim()).filter(Boolean);
    if (validOptions.length < 2) return;

    try {
      const { data } = await createPoll(conversationId, question.trim(), validOptions);
      onCreated?.(data?.poll || { question: question.trim() });
      onClose?.();
    } catch (e) { console.warn('Poll create err:', e); }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Crear encuesta</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <input
          className={styles.input}
          placeholder="Pregunta"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          maxLength={200}
        />

        <div className={styles.options}>
          {options.map((opt, i) => (
            <div key={i} className={styles.optionRow}>
              <input
                className={styles.optionInput}
                placeholder={`Opción ${i + 1}`}
                value={opt}
                onChange={e => setOption(i, e.target.value)}
                maxLength={100}
              />
              <button className={styles.removeBtn} onClick={() => removeOption(i)} disabled={options.length <= 2}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>

        <button className={styles.addBtn} onClick={addOption}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Añadir opción
        </button>

        <button
          className={styles.createBtn}
          onClick={handleCreate}
          disabled={!question.trim() || options.filter(o => o.trim()).length < 2}
        >
          Crear encuesta
        </button>
      </div>
    </div>
  );
}
