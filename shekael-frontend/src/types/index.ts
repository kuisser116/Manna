// ═══════════════════════════════════════════
// Shekael — Tipos compartidos
// ═══════════════════════════════════════════

export interface User {
  id: string;
  email?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  stellarPublicKey?: string;
  is_admin?: boolean;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  createdAt?: string;
}

export interface Post {
  id: string;
  user_id: string;
  title?: string;
  content?: string;
  media_url?: string;
  media_type?: 'image' | 'video' | 'text';
  created_at: string;
  likes_count?: number;
  comments_count?: number;
  views_count?: number;
  is_ad?: boolean;
  author?: User;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'image' | 'audio' | 'sticker';
  created_at: string;
  reply_to?: string | null;
  sender?: User;
}

export interface Conversation {
  id: string;
  is_group: boolean;
  group_name?: string;
  created_at: string;
  updated_at: string;
  participants?: ConversationParticipant[];
  lastMessage?: Message | null;
}

export interface ConversationParticipant {
  user_id: string;
  nickname?: string;
  users?: User;
}

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'support' | 'save' | 'follow' | 'message' | 'ad_rejected' | 'ad_approved';
  post_id?: string;
  actor_id: string;
  actor_name: string;
  actor_avatar?: string;
  is_read: boolean;
  created_at: string;
}

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'warning' | 'loading';
  title: string;
  message?: string;
}

export interface Transaction {
  id: string;
  sender_id: string;
  recipient_id: string;
  amount: number;
  memo?: string;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
}
