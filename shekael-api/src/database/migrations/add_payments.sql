-- Migración: Sistema de Pagos QR y Retiros (Fase 2 & 3)
-- Ejecutar en Supabase SQL Editor

-- 1. Tabla de pagos entre usuarios y comercios
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount_mxne DECIMAL(12, 2) NOT NULL,
  original_amount DECIMAL(12, 2) NOT NULL, -- monto antes del descuento
  discount_applied DECIMAL(12, 2) NOT NULL DEFAULT 0,
  stellar_tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_from ON payments(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_to_biz ON payments(to_business_id, created_at DESC);

-- 2. Tabla de solicitudes de retiro para comercios
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  amount_mxne DECIMAL(12, 2) NOT NULL,
  amount_mxn DECIMAL(12, 2) NOT NULL,       -- equivalente en MXN
  stellar_tx_hash TEXT,
  bank_account_info TEXT,                    -- CLABE o información bancaria
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_biz ON withdrawals(business_id, created_at DESC);

-- 3. Función para calcular descuento (5% hasta $50 MXN de tope)
CREATE OR REPLACE FUNCTION calculate_discount(amount DECIMAL)
RETURNS DECIMAL AS $$
DECLARE
  discount DECIMAL;
BEGIN
  discount := amount * 0.05; -- 5%
  IF discount > 50 THEN
    discount := 50; -- tope $50 MXN
  END IF;
  RETURN ROUND(discount, 2);
END;
$$ LANGUAGE plpgsql;
