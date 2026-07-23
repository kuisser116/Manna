import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ override: true, path: path.join(__dirname, '../../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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
    // Try rpc methods
    const methods = ['execute_sql', 'exec_sql', 'run_sql', 'pgm_execute', 'query'];
    for (const method of methods) {
        try {
            const { data, error } = await supabase.rpc(method, { query: sql, sql_text: sql, sql: sql });
            if (error) {
                console.log(`${method}: ${error.message.substring(0, 80)}`);
            } else {
                console.log(`${method}: OK`, data);
                process.exit(0);
            }
        } catch(e) {
            console.log(`${method}: ${e.message?.substring(0, 80)}`);
        }
    }

    // Try using supabase's from() with a known table and creating by raw SQL
    // Alternative: just INSERT a record into a known table as pool config
    console.log('\n=== No RPC method works. Using alternative approach ===');
    
    // Store pool config as a record in ad_pool_config table
    // Try to insert into a system_config table if it exists
    const { data: tables, error: tablesError } = await supabase
        .rpc('get_tables')
        .catch(() => ({ data: null, error: 'no get_tables' }));
    console.log('Tables:', tablesError || tables?.slice(0, 5));

    // Alternative: check if we can use the SQL query through raw post
    console.log('\nRun this SQL in Supabase Dashboard SQL Editor:\n');
    console.log(sql);
}
run();
