-- Migración: Agregar columna cover_url a la tabla users
-- Ejecutar en Supabase SQL Editor

ALTER TABLE users
ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT NULL;

-- Comentario para documentación
COMMENT ON COLUMN users.cover_url IS 'URL de la imagen de portada/banner del perfil. Almacenada en Cloudflare R2.';
