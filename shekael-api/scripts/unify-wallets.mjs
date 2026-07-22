import { createClient } from '@supabase/supabase-js';
import * as StellarSdk from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import fs from 'fs';

const envPath = '/home/kuki/kuki/trabajos_chidos/Projectos_personales/Shekael/shekael-api/.env';
const envContent = fs.readFileSync(envPath, 'utf-8');
const envLines = envContent.split('\n').filter(l => l.trim() && !l.startsWith('#'));
for (const line of envLines) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}
process.env.MASTER_PUBLIC = 'GBHXN3ZOSHYDXA7JZ3VNARFIZRE4ESNE7AOGJ5JZWZZXQKOJ5SSNW7L7';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
const NETWORK = StellarSdk.Networks.TESTNET;
const NEW_USDC = new StellarSdk.Asset('USDC', process.env.USDC_ISSUER);

async function main() {
  // 1. Get Kuki's user from DB
  console.log('🔍 Buscando KUISSER...');
  const { data: users } = await supabase.from('users').select('*').eq('email', '1681897@gmail.com');
  const kuki = users[0];
  console.log(`   Stellar: ${kuki.stellar_public_key}`);

  // 2. Decrypt Kuki's secret
  console.log('🔓 Descifrando secret...');
  const { decryptWithFallback } = await import('../src/services/crypto.service.js');
  const kukiSecret = decryptWithFallback(kuki.id, kuki.stellar_public_key, kuki.stellar_secret_key_encrypted);

  // 3. Get old master secret from .env
  const oldMasterSecret = process.env.MANNA_DEV_WALLET_SECRET;
  const oldMasterPub = 'GBHXN3ZOSHYDXA7JZ3VNARFIZRE4ESNE7AOGJ5JZWZZXQKOJ5SSNW7L7';
  
  // 4. Check old master balance
  const oldAccount = await server.loadAccount(oldMasterPub);
  const oldUsdc = oldAccount.balances.find(b => b.asset_code === 'USDC' && b.asset_issuer === process.env.USDC_ISSUER);
  const oldXlm = oldAccount.balances.find(b => b.asset_type === 'native');
  console.log(`\n🏦 Vieja maestra: ${oldMasterPub}`);
  console.log(`   USDC: ${oldUsdc?.balance || '0'} | XLM: ${oldXlm?.balance || '0'}`);

  // 5. Need to check: does Kuki's wallet need a trustline to the new USDC?
  // (It should already have one from the previous script)
  console.log('\n🔄 Verificando Kuki tiene trustline al nuevo USDC...');
  const kukiAccount = await server.loadAccount(kuki.stellar_public_key);
  const hasTrust = kukiAccount.balances.some(b => b.asset_code === 'USDC' && b.asset_issuer === process.env.USDC_ISSUER);
  console.log(`   ${hasTrust ? '✅ Ya tiene' : '❌ No tiene, creando...'}`);

  // 6. Send remaining USDC from old master to Kuki
  const remainingUSDC = parseFloat(oldUsdc?.balance || '0');
  if (remainingUSDC > 0) {
    console.log(`\n💰 Moviendo ${remainingUSDC} USDC de maestra vieja → Kuki...`);
    const oldKeypair = StellarSdk.Keypair.fromSecret(oldMasterSecret);
    const tx = new StellarSdk.TransactionBuilder(oldAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK,
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: kuki.stellar_public_key,
        asset: NEW_USDC,
        amount: remainingUSDC.toFixed(7),
      }))
      .addMemo(StellarSdk.Memo.text('Shekael:wallet-migration'))
      .setTimeout(30)
      .build();
    tx.sign(oldKeypair);
    const res = await server.submitTransaction(tx);
    console.log(`✅ Enviados. Hash: ${res.hash}`);
  } else {
    console.log('\n💰 No hay USDC que mover de la maestra vieja');
  }

  // 7. Update .env - replace old master with Kuki's wallet
  console.log('\n📝 Actualizando .env...');
  let newEnv = envContent
    .replace(/MANNA_DEV_WALLET=.*/, `MANNA_DEV_WALLET=${kuki.stellar_public_key}`)
    .replace(/MANNA_BARN_WALLET=.*/, `MANNA_BARN_WALLET=${kuki.stellar_public_key}`)
    .replace(/MANNA_DEV_WALLET_SECRET=.*/, `MANNA_DEV_WALLET_SECRET=${kukiSecret}`)
    .replace(/BONUS_WALLET_SECRET=.*/, `BONUS_WALLET_SECRET=${kukiSecret}`);
  
  fs.writeFileSync(envPath, newEnv);
  console.log('✅ .env actualizado con KUISSER como cuenta maestra');

  // 8. Output summary
  console.log(`\n=== RESUMEN ===`);
  console.log(`Cuenta maestra ahora: ${kuki.stellar_public_key}`);
  console.log(`Tu wallet personal = cuenta maestra ✅`);
  console.log(`\n⚠️  Recuerda recargar Shekael para ver el saldo.`);
}

main().catch(err => console.error('❌', err));
