-- Migración: Expiración del bono promocional + tracking
-- Ejecutar en Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_post_approved_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_expired BOOLEAN DEFAULT false;
