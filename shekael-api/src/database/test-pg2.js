import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ override: true, path: '/home/kuki/kuki/trabajos_chidos/Projectos_personales/Shekael/shekael-api/.env' });

const { Client } = pg;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const projectRef = url.match(/https:\/\/(.+)\.supabase\.co/)[1];

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
`;

const configs = [
    // Try with project-ref in username
    `postgresql://postgres.${projectRef}:${encodeURIComponent(key)}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
    // Direct connection
    `postgresql://postgres:${encodeURIComponent(key)}@db.${projectRef}.supabase.co:5432/postgres`,
    // With port 6542
    `postgresql://postgres.${projectRef}:${encodeURIComponent(key)}@aws-0-us-west-1.pooler.supabase.com:6542/postgres`,
];

async function run() {
    for (const connStr of configs) {
        const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 8000 });
        try {
            await client.connect();
            console.log('Connected via:', connStr.substring(0, 60));
            await client.query(sql);
            console.log('Migration SQL OK');
            const { rows } = await client.query("SELECT 'done' as status");
            console.log(rows[0]);
            await client.end();
            process.exit(0);
        } catch(e) {
            console.log(`Failed: ${e.message.substring(0, 100)}`);
        }
    }
    console.log('All failed');
    process.exit(1);
}
run();
