/**
 * Migration runner for Shekael
 * Uses Supabase Management REST API + service_role key
 */
import dotenv from 'dotenv';
dotenv.config({ override: true });

async function runMigration() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const projectRef = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)[1];

  const sql = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT;

CREATE TABLE IF NOT EXISTS post_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_post_views_user ON post_views(user_id, seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id);
  `.trim();

  // Try 1: Direct SQL endpoint via raw REST call with service key as JWT
  try {
    const payload = JSON.stringify({ query: sql });
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=ignore-duplicates'
      },
      body: payload
    });
    const text = await res.text();
    if (res.ok || res.status === 204) {
      console.log('Migration executed successfully via REST API');
      process.exit(0);
    }
    console.log(`REST API returned ${res.status}: ${text.substring(0, 200)}`);
  } catch (e) {
    console.log('REST method failed:', e.message);
  }

  // Try 2: Try to use RPC call 
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({})
    });
  } catch (_) {}

  // Try 3: pg client with JWT as password on direct connection
  let pgClient;
  try {
    const pgModule = await import('pg');
    pgClient = pgModule.default || pgModule;
  } catch (_) {
    console.log('pg module not available');
  }

  if (pgClient) {
    const { Client } = pgClient;
    // Try session mode pooler with JWT
    const configs = [
      // Session mode pooler with "postgres" user and JWT password
      `postgresql://postgres:${encodeURIComponent(supabaseKey)}@aws-0-us-west-1.pooler.supabase.com:6542/postgres`,
      // Transaction mode pooler with jwt
      `postgresql://postgres:${encodeURIComponent(supabaseKey)}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
      // Direct db connection
      `postgresql://postgres:${encodeURIComponent(supabaseKey)}@db.${projectRef}.supabase.co:5432/postgres`,
    ];

    for (const connStr of configs) {
      try {
        const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 5000 });
        await client.connect();
        await client.query(sql);
        await client.end();
        console.log('Migration executed successfully via PostgreSQL connection');
        process.exit(0);
      } catch (e) {
        console.log(`Connection ${connStr.substring(0, 60)}... failed: ${e.message}`);
      }
    }
  }

  // All methods failed - output SQL for manual execution
  console.log('\n========================================');
  console.log('Could not auto-execute migration.');
  console.log('Please run this SQL in Supabase SQL Editor:');
  console.log('========================================\n');
  console.log(sql);
  console.log('\n========================================');
  process.exit(1);
}

runMigration();
