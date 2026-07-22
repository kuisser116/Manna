import { createClient } from '@supabase/supabase-js';
import * as StellarSdk from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import fs from 'fs';

// Load .env manually
const envContent = fs.readFileSync('/home/kuki/kuki/trabajos_chidos/Projectos_personales/Shekael/shekael-api/.env', 'utf-8');
const envLines = envContent.split('\n').filter(l => l.trim() && !l.startsWith('#'));
for (const line of envLines) {
  const [key, ...rest] = line.split('=');
  const val = rest.join('=').trim();
  if (key && val) process.env[key.trim()] = val;
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
const NETWORK = StellarSdk.Networks.TESTNET;

const NEW_USDC_ISSUER = process.env.USDC_ISSUER;
const NEW_USDC_ASSET = new StellarSdk.Asset('USDC', NEW_USDC_ISSUER);
const MASTER_SECRET = process.env.MANNA_DEV_WALLET_SECRET;
const ISSUER_SECRET = process.env.USDC_ISSUER_SECRET;

async function main() {
  console.log('=== Fondear wallet de Kuki (KUISSER) ===\n');
  console.log(`Nuevo USDC issuer: ${NEW_USDC_ISSUER}`);

  // 1. Get Kuki's user from DB
  console.log('🔍 Buscando usuario KUISSER...');
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', '1681897@gmail.com');
  
  if (error || !users?.length) {
    console.error('❌ No se encontró:', error);
    process.exit(1);
  }
  
  const kuki = users[0];
  console.log(`   Usuario: ${kuki.display_name}`);
  console.log(`   Stellar: ${kuki.stellar_public_key}`);

  // 2. Decrypt Kuki's secret key
  console.log('\n🔓 Descifrando secret key...');
  const { decryptWithFallback } = await import('../src/services/crypto.service.js');
  let kukiSecret;
  try {
    kukiSecret = decryptWithFallback(kuki.id, kuki.stellar_public_key, kuki.stellar_secret_key_encrypted);
  } catch (e) {
    console.log(`   decryptWithFallback falló: ${e.message}, intentando decrypt simple...`);
    const { decrypt } = await import('../src/services/crypto.service.js');
    kukiSecret = decrypt(kuki.stellar_secret_key_encrypted);
  }
  
  const kukiKeypair = StellarSdk.Keypair.fromSecret(kukiSecret);
  if (kukiKeypair.publicKey() !== kuki.stellar_public_key) {
    console.error(`❌ La llave descifrada NO coincide:\n   Esperada: ${kuki.stellar_public_key}\n   Obtenida: ${kukiKeypair.publicKey()}`);
    process.exit(1);
  }
  console.log('✅ Secret key descifrada correctamente');

  // 3. Check if Kuki's wallet has trustline to new USDC
  console.log('\n🔄 Verificando trustline...');
  let kukiAccount = await server.loadAccount(kuki.stellar_public_key);
  const hasTrust = kukiAccount.balances.some(
    b => b.asset_code === 'USDC' && b.asset_issuer === NEW_USDC_ISSUER
  );

  if (!hasTrust) {
    console.log('⏳ Creando trustline al nuevo USDC...');
    const tx = new StellarSdk.TransactionBuilder(kukiAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK,
    })
      .addOperation(StellarSdk.Operation.changeTrust({
        asset: NEW_USDC_ASSET,
        limit: '922337203685.4775807'
      }))
      .setTimeout(30)
      .build();

    tx.sign(kukiKeypair);
    const result = await server.submitTransaction(tx);
    console.log(`✅ Trustline creada. Hash: ${result.hash}`);
    kukiAccount = await server.loadAccount(kuki.stellar_public_key);
  } else {
    console.log('✅ Trustline ya existe');
  }

  // 4. Send USDC from master wallet to Kuki
  console.log('\n💰 Enviando USDC desde cuenta maestra...');
  const masterKeypair = StellarSdk.Keypair.fromSecret(MASTER_SECRET);
  let masterAccount = await server.loadAccount(masterKeypair.publicKey());
  
  // Check master balance first
  const masterUsdcBal = masterAccount.balances.find(
    b => b.asset_code === 'USDC' && b.asset_issuer === NEW_USDC_ISSUER
  );
  console.log(`   Maestra tiene: ${masterUsdcBal?.balance || '0'} USDC`);

  const sendAmount = '50.0000000';
  const sendTx = new StellarSdk.TransactionBuilder(masterAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(StellarSdk.Operation.payment({
      destination: kuki.stellar_public_key,
      asset: NEW_USDC_ASSET,
      amount: sendAmount,
    }))
    .addMemo(StellarSdk.Memo.text('Shekael:wallet-funding'))
    .setTimeout(30)
    .build();

  sendTx.sign(masterKeypair);
  const sendResult = await server.submitTransaction(sendTx);
  console.log(`✅ ${sendAmount} USDC enviados. Hash: ${sendResult.hash}`);

  // 5. Verify final balance
  const finalAccount = await server.loadAccount(kuki.stellar_public_key);
  const finalBal = finalAccount.balances.find(
    b => b.asset_code === 'USDC' && b.asset_issuer === NEW_USDC_ISSUER
  );
  console.log(`\n💰 Balance final de KUISSER: ${finalBal?.balance || '0'} USDC`);
  console.log('✅ Todo listo!');
}

main().catch(err => {
  console.error('\n❌ Error:', err.response?.data?.extras?.result_codes || err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
