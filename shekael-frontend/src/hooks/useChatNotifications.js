import { useEffect, useRef } from 'react';
import useStore from '../store';

export default function useChatNotifications() {
  const user = useStore(s => s.user);
  const setUnreadRequests = useStore(s => s.setUnreadRequests);
  const addConversation = useStore(s => s.addConversation);
  const esRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    const API_URL = import.meta.env.VITE_API_URL || location.origin;
    const token = localStorage.getItem('Shekael_token')?.replace(/"/g, '') || '';
    const es = new EventSource(`${API_URL}/chats/events?token=${encodeURIComponent(token)}`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_messages') {
          // Disparar recarga de conversaciones
          window.dispatchEvent(new CustomEvent('shekael:new-messages', { detail: data.messages }));
        } else if (data.type === 'new_requests') {
          setUnreadRequests?.(data.requests?.length || 0);
          window.dispatchEvent(new CustomEvent('shekael:new-requests'));
        }
      } catch {}
    };

    es.onerror = () => {
      // Reconectar después de 3s
      setTimeout(() => {
        if (user) esRef.current = null;
      }, 3000);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [user?.id]);
}
