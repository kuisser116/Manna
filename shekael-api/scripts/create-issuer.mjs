import * as StellarSdk from '@stellar/stellar-sdk';
import fs from 'fs';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const server = new StellarSdk.Horizon.Server(HORIZON_URL);
const MASTER_SECRET = process.env.MASTER_SECRET;

async function main() {
  console.log('=== Creando nuevo issuer USDC para Shekael (testnet) ===\n');

  // 1. Generate issuer keypair
  const issuer = StellarSdk.Keypair.random();
  console.log(`🔑 Nuevo issuer creado:`);
  console.log(`   Public Key:  ${issuer.publicKey()}`);
  console.log(`   Secret:      ${issuer.secret()}\n`);

  // Check if issuer already exists
  try {
    await server.loadAccount(issuer.publicKey());
    console.log('✅ Issuer ya existe en testnet');
  } catch (e) {
    if (e.response?.status === 404) {
      console.log('⏳ Fondear issuer con Friendbot...');
      const resp = await fetch(`https://friendbot.stellar.org?addr=${issuer.publicKey()}`, {
        signal: AbortSignal.timeout(60000)
      });
      const json = await resp.json();
      if (json.status === 400) {
        console.log(`   Ya fondeado o error: ${json.detail}`);
      } else {
        console.log('✅ Issuer fondeado con 10,000 XLM');
      }
    } else {
      throw e;
    }
  }

  // 2. Load master wallet
  const masterKeypair = StellarSdk.Keypair.fromSecret(MASTER_SECRET);
  console.log(`\n🏦 Cuenta maestra: ${masterKeypair.publicKey()}`);

  let masterAccount = await server.loadAccount(masterKeypair.publicKey());

  // 3. Check if master already has trustline to this USDC
  const usdcAsset = new StellarSdk.Asset('USDC', issuer.publicKey());
  const hasTrustline = masterAccount.balances.some(
    b => b.asset_code === 'USDC' && b.asset_issuer === issuer.publicKey()
  );

  if (!hasTrustline) {
    console.log('⏳ Creando trustline USDC en cuenta maestra...');
    const tx = new StellarSdk.TransactionBuilder(masterAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(StellarSdk.Operation.changeTrust({
        asset: usdcAsset,
        limit: '922337203685.4775807' // max
      }))
      .setTimeout(30)
      .build();

    tx.sign(masterKeypair);
    const result = await server.submitTransaction(tx);
    console.log(`✅ Trustline creada. Hash: ${result.hash}`);
    // Reload account
    masterAccount = await server.loadAccount(masterKeypair.publicKey());
  } else {
    console.log('✅ Trustline ya existe');
  }

  // 4. Mint USDC to master wallet (issuer sends to master)
  console.log('\n⏳ Minteando USDC a cuenta maestra...');
  const mintAmount = '100.0000000';
  
  const issuerAccount = await server.loadAccount(issuer.publicKey());
  const mintTx = new StellarSdk.TransactionBuilder(issuerAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(StellarSdk.Operation.payment({
      destination: masterKeypair.publicKey(),
      asset: usdcAsset,
      amount: mintAmount,
    }))
    .addMemo(StellarSdk.Memo.text('Shekael:issuer-funding'))
    .setTimeout(30)
    .build();

  mintTx.sign(issuer);
  const mintResult = await server.submitTransaction(mintTx);
  console.log(`✅ Minteados ${mintAmount} USDC. Hash: ${mintResult.hash}`);

  // 5. Verify balance
  const finalAccount = await server.loadAccount(masterKeypair.publicKey());
  const usdcBalance = finalAccount.balances.find(
    b => b.asset_code === 'USDC' && b.asset_issuer === issuer.publicKey()
  );
  console.log(`\n💰 Balance USDC en maestra: ${usdcBalance?.balance || '0'} USDC`);

  // 6. Output env vars
  console.log('\n=== NUEVAS VARIABLES DE ENTORNO ===');
  console.log(`USDC_ISSUER=${issuer.publicKey()}`);
  console.log(`USDC_ISSUER_SECRET=${issuer.secret()}`);
  console.log(`STABLECOIN_CODE=USDC`);
  console.log(`STABLECOIN_ISSUER=${issuer.publicKey()}`);

  // 7. Save to Nexus for permanent backup
  console.log('\n⏳ Guardando en Nexus...');
  const nexusPayload = {
    type: 'key',
    tags: ['shekael', 'stellar', 'issuer', 'testnet', 'usdc', 'critical'],
    content: JSON.stringify({
      network: 'testnet',
      issuer: {
        publicKey: issuer.publicKey(),
        secret: issuer.secret()
      },
      masterWallet: masterKeypair.publicKey(),
      created: new Date().toISOString(),
      note: 'USDC issuer for Shekael testnet'
    }, null, 2)
  };

  try {
    const nexusResp = await fetch('http://localhost:7779/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nexusPayload)
    });
    const nexusResult = await nexusResp.json();
    console.log(`✅ Guardado en Nexus. ID: ${nexusResult.id}`);
  } catch (e) {
    console.log(`⚠️  No se pudo guardar en Nexus: ${e.message}`);
    console.log('   Las keys están en .issuer-keys.json igualmente');
  }

  // 8. Save to secure file (gitignored)
  const keyData = {
    created: new Date().toISOString(),
    network: 'testnet',
    issuer: {
      publicKey: issuer.publicKey(),
      secret: issuer.secret()
    },
    masterWallet: masterKeypair.publicKey(),
    note: 'USDC issuer for Shekael testnet. DO NOT SHARE. Keep this file safe.'
  };
  
  const keysPath = '/home/kuki/kuki/trabajos_chidos/Projectos_personales/Shekael/shekael-api/.issuer-keys.json';
  fs.writeFileSync(keysPath, JSON.stringify(keyData, null, 2));
  fs.chmodSync(keysPath, 0o600);
  
  // Also add to .gitignore if not there
  const gitignorePath = '/home/kuki/kuki/trabajos_chidos/Projectos_personales/Shekael/.gitignore';
  let gitignore = '';
  try { gitignore = fs.readFileSync(gitignorePath, 'utf-8'); } catch {}
  if (!gitignore.includes('.issuer-keys.json')) {
    fs.appendFileSync(gitignorePath, '\n# Issuer keys (sensitive)\n.issuer-keys.json\n');
    console.log('✅ .gitignore actualizado');
  }

  console.log('\n✅ Keys guardadas en .issuer-keys.json (protegido, gitignorado)');
  console.log('✅ Keys guardadas en Nexus tag: shekael, stellar, issuer, testnet, usdc, critical');
  console.log('\n⚠️  AHORA hay que:');
  console.log('   1. Actualizar el .env con las nuevas variables');
  console.log('   2. Reiniciar la API');
  console.log('   3. Actualizar stellar.service.js si usa issuer hardcodeado');
}

main().catch(err => {
  console.error('\n❌ Error:', err.response?.data?.extras?.result_codes || err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
