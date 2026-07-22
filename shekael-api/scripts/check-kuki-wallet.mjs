import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { global: { fetch: (url, options) => fetch(url, { ...options }) } }
);

const { data: users, error } = await supabase.from('users').select('id, display_name, email, stellar_public_key, created_at').limit(10);
if (error) { console.error('Error:', error); process.exit(1); }
for (const u of users) {
  // Check if the wallet exists on Stellar
  const pk = u.stellar_public_key;
  let status = '❌ No existe en testnet';
  try {
    const resp = await fetch(`https://horizon-testnet.stellar.org/accounts/${pk}`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      const xlmBal = data.balances.find(b => b.asset_type === 'native')?.balance || '0';
      const usdcBal = data.balances.filter(b => b.asset_code === 'USDC');
      status = `✅ Activa | XLM: ${xlmBal} | USDC trustlines: ${usdcBal.length}`;
    }
  } catch {}
  
  console.log(`${(u.display_name||'?').padEnd(20)} | ${(u.email||'?').padEnd(30)} | ${(u.stellar_public_key||'N/A')} | ${status}`);
}
