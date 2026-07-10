-- Migración: Añadir columnas de términos a users + tabla de auditoría
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar columnas a users
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT DEFAULT 'v1.0';

-- 2. Crear tabla de auditoría legal de términos
CREATE TABLE IF NOT EXISTS terms_acceptance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  terms_hash TEXT, -- SHA-256 del contenido de los términos en esa versión
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para búsquedas rápidas por usuario
CREATE INDEX IF NOT EXISTS idx_terms_log_user ON terms_acceptance_log(user_id, accepted_at DESC);
