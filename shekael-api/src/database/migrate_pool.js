/**
 * Migration: Create ad_pool_monthly table + update ad_impressions
 */
import dotenv from 'dotenv';
dotenv.config({ override: true });

const sql = `
CREATE TABLE IF NOT EXISTS ad_pool_monthly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month_year TEXT UNIQUE NOT NULL,
    total_pool_mxn DECIMAL(12,2) DEFAULT 0,
    user_pool_mxn DECIMAL(12,2) DEFAULT 0,
    creator_pool_mxn DECIMAL(12,2) DEFAULT 0,
    total_impressions INT DEFAULT 0,
    per_view_mxn DECIMAL(10,4) DEFAULT 0,
    is_settled BOOLEAN DEFAULT FALSE,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS pool_monthly_id UUID REFERENCES ad_pool_monthly(id);
ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS amount DECIMAL(10,4) DEFAULT 0;

INSERT INTO ad_pool_monthly (month_year, total_pool_mxn, user_pool_mxn, total_impressions, per_view_mxn, is_settled)
VALUES (to_char(NOW(), 'YYYY-MM'), 0, 0, 0, 0.05, false)
ON CONFLICT (month_year) DO NOTHING;

SELECT 'migration_ok' as result;
`;

async function run() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const projectRef = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)[1];

  let pgClient;
  try {
    const pgModule = await import('pg');
    pgClient = pgModule.default || pgModule;
  } catch (_) {
    console.error('pg module not found');
    process.exit(1);
  }

  if (pgClient) {
    const { Client } = pgClient;
    const configs = [
      `postgresql://postgres:${encodeURIComponent(supabaseKey)}@aws-0-us-west-1.pooler.supabase.com:6542/postgres`,
      `postgresql://postgres:${encodeURIComponent(supabaseKey)}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
      `postgresql://postgres:${encodeURIComponent(supabaseKey)}@db.${projectRef}.supabase.co:5432/postgres`,
    ];

    for (const connStr of configs) {
      try {
        const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 8000 });
        await client.connect();
        const res = await client.query(sql);
        await client.end();
        console.log('Migration OK via', connStr.substring(0, 40));
        if (res.rows?.length) console.log(res.rows[0]);
        process.exit(0);
      } catch (e) {
        console.log(`Conn failed: ${e.message.substring(0, 80)}`);
      }
    }
  }
  console.log('All connection methods failed');
  console.log('\nRun this SQL manually in Supabase SQL Editor:\n');
  console.log(sql);
  process.exit(1);
}
run();
