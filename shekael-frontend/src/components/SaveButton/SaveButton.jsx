import { useState, useCallback } from 'react';
import { Bookmark } from 'lucide-react';
import { trackSignal } from '../../api/algorithm.api';

export default function SaveButton({ postId, source = 'shekael', className = '' }) {
    const [isSaved, setIsSaved] = useState(() => {
        try {
            const saved = localStorage.getItem('shekael_saved');
            if (saved) {
                const ids = JSON.parse(saved);
                return ids.includes(postId);
            }
        } catch {}
        return false;
    });

    const handleSave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();

        const newSaved = !isSaved;
        setIsSaved(newSaved);

        // Persistir en localStorage
        try {
            const raw = localStorage.getItem('shekael_saved');
            let ids = raw ? JSON.parse(raw) : [];
            if (newSaved) {
                if (!ids.includes(postId)) ids.push(postId);
            } else {
                ids = ids.filter(id => id !== postId);
            }
            if (ids.length > 500) ids = ids.slice(-500);
            localStorage.setItem('shekael_saved', JSON.stringify(ids));
        } catch {}

        // Trackear señal
        trackSignal(postId, newSaved ? 'save' : 'view', source);
    }, [postId, source, isSaved]);

    return (
        <button
            onClick={handleSave}
            className={className}
            title={isSaved ? 'Guardado' : 'Guardar'}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px 8px', color: isSaved ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: 13,
            }}
        >
            <Bookmark size={16} fill={isSaved ? 'var(--color-primary)' : 'none'} />
            {isSaved ? 'Guardado' : 'Guardar'}
        </button>
    );
}
