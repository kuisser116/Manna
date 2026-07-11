-- Migración: Tabla post_views para tracking de posts vistos por usuario
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS post_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_post_views_user ON post_views(user_id, seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id);
