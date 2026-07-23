import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ override: true, path: '/home/kuki/kuki/trabajos_chidos/Projectos_personales/Shekael/shekael-api/.env' });

const { Client } = pg;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const projectRef = url.match(/https:\/\/(.+)\.supabase\.co/)[1];

console.log('Project ref:', projectRef);
console.log('URL:', url);

// Try direct connection
const host = `db.${projectRef}.supabase.co`;
console.log('Host:', host);

const configs = [
    {
        host: host,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: key,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 8000
    },
    {
        connectionString: `postgresql://postgres:${encodeURIComponent(key)}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require`,
        connectionTimeoutMillis: 8000
    },
    {
        host: host,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: key,
        ssl: true,
        connectionTimeoutMillis: 8000
    }
];

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

ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS pool_monthly_id UUID;
ALTER TABLE ad_impressions ADD COLUMN IF NOT EXISTS amount DECIMAL(10,4) DEFAULT 0;

INSERT INTO ad_pool_monthly (month_year, total_pool_mxn, user_pool_mxn, total_impressions, per_view_mxn, is_settled)
VALUES (to_char(NOW(), 'YYYY-MM'), 0, 0, 0, 0.05, false)
ON CONFLICT (month_year) DO NOTHING;
`;

async function run() {
    for (const cfg of configs) {
        const client = new Client(cfg);
        try {
            await client.connect();
            console.log('Connected!');
            await client.query(sql);
            console.log('Migration OK');
            const { rows } = await client.query("SELECT NOW() as t");
            console.log('Time:', rows[0].t);
            await client.end();
            process.exit(0);
        } catch(e) {
            console.log(`Failed: ${e.message.substring(0, 120)}`);
            try { await client.end(); } catch(_) {}
        }
    }
    console.log('All failed');
    process.exit(1);
}
run();
