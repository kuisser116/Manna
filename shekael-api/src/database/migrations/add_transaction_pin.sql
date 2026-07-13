-- Migración: Añadir PIN de seguridad para transacciones
-- Ejecutar en Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT DEFAULT NULL;
