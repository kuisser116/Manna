-- ═══════════════════════════════════════════════════
-- Algoritmo de Valor — Shekael
-- Correr en Supabase Dashboard SQL Editor
-- ═══════════════════════════════════════════════════

-- 1. Tabla de señales de engagement
CREATE TABLE IF NOT EXISTS engagement_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    post_id TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    source TEXT DEFAULT 'shekael',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_user ON engagement_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_signals_post ON engagement_signals(post_id);
CREATE INDEX IF NOT EXISTS idx_signals_type ON engagement_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_user_type ON engagement_signals(user_id, signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_created ON engagement_signals(created_at);

-- 2. Tabla de scores de afinidad usuario→creador
CREATE TABLE IF NOT EXISTS affinity_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL,
    affinity_score DECIMAL(5,2) DEFAULT 0,
    interaction_count INT DEFAULT 0,
    last_interaction TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_affinity_user ON affinity_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_affinity_score ON affinity_scores(affinity_score DESC);

-- 3. Tabla de scores de valor por post
CREATE TABLE IF NOT EXISTS post_value_scores (
    post_id TEXT PRIMARY KEY,
    source TEXT DEFAULT 'shekael',
    save_count INT DEFAULT 0,
    share_dm_count INT DEFAULT 0,
    share_feed_count INT DEFAULT 0,
    like_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    view_count INT DEFAULT 0,
    dwell_total_seconds DECIMAL(10,2) DEFAULT 0,
    completion_count INT DEFAULT 0,
    value_score DECIMAL(10,4) DEFAULT 0,
    trending_score DECIMAL(10,4) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_value_score ON post_value_scores(value_score DESC);
CREATE INDEX IF NOT EXISTS idx_trending_score ON post_value_scores(trending_score DESC);

-- 4. Función para calcular value_score
CREATE OR REPLACE FUNCTION calculate_value_score(
    p_saves INT,
    p_share_dm INT,
    p_share_feed INT,
    p_comments INT,
    p_completions INT,
    p_dwell_30s INT,
    p_likes INT,
    p_views INT,
    p_age_hours INT
) RETURNS DECIMAL(10,4) AS $$
DECLARE
    raw_score DECIMAL(10,4);
BEGIN
    raw_score := (
        p_saves * 10 +
        p_share_dm * 8 +
        p_share_feed * 6 +
        p_comments * 4 +
        p_completions * 3 +
        p_dwell_30s * 2 +
        p_likes * 1 +
        p_views * 0.1
    );
    IF p_age_hours > 0 THEN
        raw_score := raw_score / POWER(p_age_hours, 0.3);
    END IF;
    RETURN raw_score;
END;
$$ LANGUAGE plpgsql;
