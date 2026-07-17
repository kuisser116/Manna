-- Migración: Sistema de Comercios (Fase 1)
-- Ejecutar en Supabase SQL Editor

-- 1. Tabla de comercios
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  address TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  phone TEXT,
  website TEXT,
  stellar_public_key TEXT,
  qr_code TEXT, -- código QR generado para pagos
  avatar_url TEXT,
  cover_url TEXT,
  password_hash TEXT, -- contraseña para operaciones sensibles
  show_products BOOLEAN NOT NULL DEFAULT true,
  show_reviews BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_businesses_category ON businesses(category);
CREATE INDEX IF NOT EXISTS idx_businesses_location ON businesses(location_lat, location_lng);

-- 2. Tabla de productos
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  category TEXT,
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);

-- 3. Tabla de reseñas
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, user_id) -- un review por usuario por comercio
);

CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews(business_id, created_at DESC);

-- 4. Seguidores de comercios
CREATE TABLE IF NOT EXISTS business_followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_biz_followers_biz ON business_followers(business_id);
CREATE INDEX IF NOT EXISTS idx_biz_followers_user ON business_followers(user_id);

-- 5. Función para calcular rating promedio
CREATE OR REPLACE FUNCTION get_business_rating(biz_id UUID)
RETURNS TABLE(average NUMERIC, total BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT ROUND(AVG(rating)::numeric, 1) AS average, COUNT(*)::bigint AS total
  FROM reviews
  WHERE business_id = biz_id;
END;
$$ LANGUAGE plpgsql;
