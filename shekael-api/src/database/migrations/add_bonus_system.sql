-- Migration: Add bonus system for new users and approval status for posts
-- Shekael Phase 2 — Bolsas Promocionales + Approve System

-- 1. Users table: track bonus state
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_total_mxn DECIMAL DEFAULT 50;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_released_mxn DECIMAL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_activated BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_post_approved_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN DEFAULT false;

-- 2. Posts table: approval workflow
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_by TEXT REFERENCES users(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS rejected_by TEXT REFERENCES users(id);

-- 3. Index for pending posts query
CREATE INDEX IF NOT EXISTS idx_posts_approval_status ON posts(approval_status);
CREATE INDEX IF NOT EXISTS idx_posts_author_approval ON posts(author_id, approval_status);
