-- ============================================================
-- Shekael v2 — RPC Functions para el Algoritmo
-- Correr en Supabase Dashboard SQL Editor
-- ============================================================

-- 1. Incrementar un contador en post_value_scores (UPSERT)
-- Ejemplo: SELECT increment_post_value('post123', 'like_count', 1);
CREATE OR REPLACE FUNCTION increment_post_value(
    p_post_id TEXT,
    p_column TEXT,
    p_amount INT
) RETURNS void AS $$
BEGIN
    EXECUTE format(
        'INSERT INTO post_value_scores (post_id, %I) 
         VALUES ($1, $2)
         ON CONFLICT (post_id) 
         DO UPDATE SET %I = COALESCE(post_value_scores.%I, 0) + $2,
                       updated_at = NOW()',
        p_column, p_column, p_column
    ) USING p_post_id, p_amount;
END;
$$ LANGUAGE plpgsql;

-- 2. Recalcular value_score y trending_score de un post
CREATE OR REPLACE FUNCTION recalc_post_scores(p_post_id TEXT)
RETURNS void AS $$
DECLARE
    v_saves INT;
    v_share_dm INT;
    v_share_feed INT;
    v_comments INT;
    v_completions INT;
    v_dwell DECIMAL(10,2);
    v_likes INT;
    v_views INT;
    v_age_hours DECIMAL(10,2);
    v_raw DECIMAL(10,4);
    v_trending DECIMAL(10,4);
    v_first_seen TIMESTAMPTZ;
BEGIN
    -- Obtener contadores actuales
    SELECT 
        COALESCE(save_count, 0),
        COALESCE(share_dm_count, 0),
        COALESCE(share_feed_count, 0),
        COALESCE(comment_count, 0),
        COALESCE(completion_count, 0),
        COALESCE(dwell_total_seconds, 0),
        COALESCE(like_count, 0),
        COALESCE(view_count, 0)
    INTO v_saves, v_share_dm, v_share_feed, v_comments, v_completions, v_dwell, v_likes, v_views
    FROM post_value_scores
    WHERE post_id = p_post_id;

    -- Obtener la primera señal del post
    SELECT MIN(created_at) INTO v_first_seen
    FROM engagement_signals
    WHERE post_id = p_post_id;

    IF v_first_seen IS NULL THEN
        v_age_hours := 0;
    ELSE
        v_age_hours := EXTRACT(EPOCH FROM (NOW() - v_first_seen)) / 3600;
    END IF;

    -- Calcular raw_score
    v_raw := (
        v_saves * 10 +
        v_share_dm * 8 +
        v_share_feed * 6 +
        v_comments * 4 +
        v_completions * 3 +
        (v_dwell / 30) * 2 +
        v_likes * 1 +
        v_views * 0.1
    );

    -- Aplicar decaimiento
    IF v_age_hours > 1 THEN
        v_raw := v_raw / POWER(v_age_hours, 0.3);
    END IF;

    -- Trending: señales de las últimas 24h con sus pesos
    SELECT COALESCE(SUM(
        CASE e.signal_type
            WHEN 'save' THEN 10
            WHEN 'share_dm' THEN 8
            WHEN 'share_feed' THEN 6
            WHEN 'comment' THEN 4
            WHEN 'completion' THEN 3
            WHEN 'dwell_30s' THEN 2
            WHEN 'dwell_5s' THEN 0.5
            WHEN 'like' THEN 1
            WHEN 'view' THEN 0.1
            ELSE 0
        END
    ), 0) INTO v_trending
    FROM engagement_signals e
    WHERE e.post_id = p_post_id
      AND e.created_at > NOW() - INTERVAL '24 hours';

    -- Actualizar scores
    UPDATE post_value_scores
    SET value_score = v_raw,
        trending_score = v_trending,
        updated_at = NOW()
    WHERE post_id = p_post_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Recalcular scores de todos los posts (para cron diario)
CREATE OR REPLACE FUNCTION recalc_all_post_scores()
RETURNS void AS $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT post_id FROM post_value_scores LOOP
        PERFORM recalc_post_scores(rec.post_id);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
