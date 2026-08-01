import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ override: true, path: path.join(__dirname, '../../.env') });

const { Client } = pg;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const projectRef = url.match(/https:\/\/(.+)\.supabase\.co/)[1];

const sql = `
ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS engagement_score FLOAT DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_ad_impressions_user_month ON ad_impressions(user_id, created_at);
`;

const configs = [
    `postgresql://postgres:${encodeURIComponent(key)}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true`,
    `postgresql://postgres:${encodeURIComponent(key)}@db.${projectRef}.supabase.co:5432/postgres`,
    `postgresql://postgres:${encodeURIComponent(key)}@aws-0-us-west-1.pooler.supabase.com:6542/postgres?pgbouncer=true`,
];

async function run() {
    for (const connStr of configs) {
        const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 8000 });
        try {
            await client.connect();
            await client.query(sql);
            console.log('OK — migración ejecutada en:', connStr.split('@')[1]);
            await client.end();
            process.exit(0);
        } catch (e) {
            console.log('Falló', connStr.split('@')[1], ':', e.message.slice(0, 80));
            try { await client.end(); } catch {}
        }
    }
    process.exit(1);
}
run();
