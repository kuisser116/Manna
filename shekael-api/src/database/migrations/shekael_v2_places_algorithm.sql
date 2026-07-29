-- ============================================================
-- Shekael v2 — Migración: Lugares, Algoritmo + Geo, Intereses
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- Fecha: 2026-07-28
-- ============================================================

-- ============================================================
-- 1. TABLAS NUEVAS
-- ============================================================

-- 1.1 Lugares públicos (venues)
CREATE TABLE IF NOT EXISTS public_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,            -- restaurant, cafe, park, museum, store, etc.
  address TEXT,
  zone TEXT NOT NULL,        -- "Roma Norte, CDMX"
  city TEXT,
  state TEXT,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  osm_place_id TEXT,         -- OpenStreetMap place ID (opcional)
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para búsqueda por nombre
CREATE INDEX IF NOT EXISTS idx_public_venues_name ON public_venues USING gin(name gin_trgm_ops);
-- Índice para búsqueda geoespacial (lat/lng)
CREATE INDEX IF NOT EXISTS idx_public_venues_location ON public_venues (lat, lng);

-- 1.2 Intención de compra (Fase 3)
CREATE TABLE IF NOT EXISTS purchase_intent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,  -- TEXT porque users.id es TEXT en Supabase
  category TEXT NOT NULL,       -- tech, food, gaming, fashion, etc.
  score FLOAT DEFAULT 0,        -- 0.0 a 1.0
  signals_count INT DEFAULT 0,  -- número de señales que respaldan este score
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_purchase_intent_user ON purchase_intent (user_id, score DESC);

-- ============================================================
-- 2. COLUMNAS NUEVAS EN TABLAS EXISTENTES
-- ============================================================

-- 2.1 Posts — ubicación opcional
ALTER TABLE posts ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public_venues(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_zone TEXT;  -- "Roma Norte, CDMX"

CREATE INDEX IF NOT EXISTS idx_posts_venue ON posts (venue_id);
CREATE INDEX IF NOT EXISTS idx_posts_location_zone ON posts (location_zone);

-- 2.2 Users — intereses + ubicación en tiempo real
ALTER TABLE users ADD COLUMN IF NOT EXISTS interest_categories TEXT DEFAULT '[]'; -- JSON array: ["tech","food"]
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_lat FLOAT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_lng FLOAT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS data_consent BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS data_consent_tx TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS data_consent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_range TEXT;      -- "18-24", "25-34", etc.
ALTER TABLE users ADD COLUMN IF NOT EXISTS region TEXT;          -- "CDMX", "EdoMex", etc.

CREATE INDEX IF NOT EXISTS idx_users_current_location ON users (current_lat, current_lng);
CREATE INDEX IF NOT EXISTS idx_users_interests ON users USING gin(interest_categories);

-- 2.3 Businesses — ubicación más granular
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS delegation TEXT; -- "Cuauhtémoc", "Benito Juárez", etc.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS zone TEXT;        -- "Roma Norte", "Condesa", etc.

-- 2.4 Ads — geo-targeting para anuncios locales
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_radius_km FLOAT DEFAULT 50;  -- radio de alcance en km
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_lat FLOAT;                    -- centro del área objetivo
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_lng FLOAT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_state TEXT;                   -- "CDMX", "EdoMex", null = nacional

-- 2.5 Ad impressions — registrar ubicación del usuario al ver el ad
ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS user_lat FLOAT;
ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS user_lng FLOAT;
ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS user_zone TEXT;           -- "Roma Norte, CDMX"

-- ============================================================
-- 3. FUNCIONES ÚTILES
-- ============================================================

-- 3.1 Calcular distancia aproximada entre coordenadas (fórmula de haversine)
CREATE OR REPLACE FUNCTION geo_distance(
  lat1 FLOAT, lng1 FLOAT,
  lat2 FLOAT, lng2 FLOAT
) RETURNS FLOAT AS $$
  SELECT 6371 * 2 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    )
  );
$$ LANGUAGE sql IMMUTABLE;

-- 3.2 Derivar zona de un venue a partir de lat/lng (usa el estado guardado)
-- (para expandir en el futuro con reverse geocoding real)

-- ============================================================
-- 4. VERIFICACIÓN
-- ============================================================
-- Para verificar que todo se creó correctamente:
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE table_name IN ('public_venues', 'purchase_intent', 'posts', 'users', 'businesses', 'ads')
-- ORDER BY table_name, ordinal_position;
