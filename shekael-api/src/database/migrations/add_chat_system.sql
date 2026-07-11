-- Migración: Sistema de Chat Seguro con E2EE
-- Ejecutar en Supabase SQL Editor

-- 1. Llave pública para cifrado E2EE (se genera desde el navegador)
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key TEXT;

-- 2. Conversaciones (una por cada par de usuarios)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Participantes de cada conversación + estado de aceptación
CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted BOOLEAN NOT NULL DEFAULT false,
  last_read_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);

-- 4. Mensajes cifrados (E2EE — el contenido nunca está en texto plano)
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_content TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Solicitudes de mensaje (para TODOS, incluso si se siguen)
CREATE TABLE IF NOT EXISTS message_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(from_user_id, to_user_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_message_requests_to ON message_requests(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_message_requests_from ON message_requests(from_user_id, status);
