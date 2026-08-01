import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ override: true, path: '/home/kuki/kuki/trabajos_chidos/Projectos_personales/Shekael/shekael-api/.env' });

const sql = fs.readFileSync('/home/kuki/kuki/trabajos_chidos/Projectos_personales/Shekael/shekael-api/src/database/migrations/add_bonus_system.sql', 'utf-8');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { global: { fetch: (url, options) => fetch(url, { ...options }) } }
);

async function main() {
  console.log('🔄 Ejecutando migración...');
  
  // Supabase JS client can run raw SQL via .rpc()
  // But we'll use REST approach
  const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/`;
  
  // Try direct SQL endpoint
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
      'Prefer': 'resolution=ignore-duplicates'
    },
    body: JSON.stringify({ query: sql })
  });
  
  if (res.ok || res.status === 204) {
    console.log('✅ Migración ejecutada vía REST');
  } else {
    const text = await res.text();
    console.log(`⚠️  REST: ${res.status} — ${text.substring(0, 200)}`);
    console.log('\n📝 Ejecuta este SQL manualmente en Supabase SQL Editor:\n');
    console.log(sql);
  }
}

main().catch(console.error);
