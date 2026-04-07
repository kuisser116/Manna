import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as StellarSdk from '@stellar/stellar-sdk';
import { decrypt } from '../src/services/crypto.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

async function run() {
    console.log('🏦 Iniciando Banco Central de Banco de México (Testnet) para Manná...');
    
    // 1. Crear la billetera emisora (El Banco Central)
    const issuerKeypair = StellarSdk.Keypair.random();
    console.log(`\n🏦 Nueva Llave Pública del Emisor: ${issuerKeypair.publicKey()}`);
    console.log(`⏳ Fondeando al Emisor con Friendbot...`);
    await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(issuerKeypair.publicKey())}`);
    console.log(`✅ Emisor listo en la Blockchain.`);

    const mxneAsset = new StellarSdk.Asset('MXNe', issuerKeypair.publicKey());

    // 2. Modificar el .env para que la API Gateway reconozca a este Emisor como el oficial
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/^MXNE_ISSUER=.*$/m, `MXNE_ISSUER=${issuerKeypair.publicKey()}`);
    envContent = envContent.replace(/^MXNC_ISSUER=.*$/m, `MXNC_ISSUER=${issuerKeypair.publicKey()}`);
    // También actualizamos USDC al mismo por si alguna parte del código viejo lo lee
    envContent = envContent.replace(/^USDC_ISSUER=.*$/m, `USDC_ISSUER=${issuerKeypair.publicKey()}`);
    fs.writeFileSync(envPath, envContent);
    console.log(`✅ Archivo .env actualizado exitosamente con el nuevo MXNE_ISSUER.`);

    // 3. Obtener todos los usuarios de la base de datos
    const { data: users, error } = await supabase.from('users').select('*');
    if (error || !users || users.length === 0) {
        console.error('Error o sin usuarios en la DB:', error);
        return;
    }

    console.log(`\n💸 Acuñando y repartiendo MXNe a ${users.length} usuarios...`);

    const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());

    for (const user of users) {
        if (!user.stellar_public_key) continue;

        try {
            console.log(`\n👤 Preparando cuenta: ${user.display_name || user.email}`);
            await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(user.stellar_public_key)}`);
            
            const secretKey = decrypt(user.stellar_secret_key_encrypted);
            const userKeypair = StellarSdk.Keypair.fromSecret(secretKey);
            const userAccount = await server.loadAccount(userKeypair.publicKey());
            
            // 4. Crear línea de confianza (Trustline) del usuario hacia el nuevo Emisor
            console.log(`   Creando Trustline para MXNe...`);
            const trustTx = new StellarSdk.TransactionBuilder(userAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: NETWORK_PASSPHRASE,
            })
            .addOperation(StellarSdk.Operation.changeTrust({ asset: mxneAsset }))
            .setTimeout(30)
            .build();
            trustTx.sign(userKeypair);
            await server.submitTransaction(trustTx);

            // 5. El emisor le manda 500 MXNe reales
            console.log(`   Transfiriendo 500 MXNe...`);
            const payTx = new StellarSdk.TransactionBuilder(issuerAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: NETWORK_PASSPHRASE,
            })
            .addOperation(StellarSdk.Operation.payment({
                destination: userKeypair.publicKey(),
                asset: mxneAsset,
                amount: '500.0000000'
            }))
            .setTimeout(30)
            .build();
            payTx.sign(issuerKeypair);
            await server.submitTransaction(payTx);
            
            console.log(`   ✅ 500 MXNe depositados con éxito a ${user.display_name}.`);
        } catch (err) {
            console.error(`   ❌ Error con ${user.email}:`, err.response?.data?.extras?.result_codes || err.message);
        }
    }
    
    console.log('\n✅ Proceso terminado.');
    console.log('⚠️ IMPORTANTE: DEBES REINICIAR EL SERVIDOR DE NODE (Ctrl+C y volver a iniciar) PARA QUE EL BACKEND LEA EL NUEVO ISSUER DEL .ENV');
}

run();
