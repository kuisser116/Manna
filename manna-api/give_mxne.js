import 'dotenv/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { getDB } from './src/database/db.js';
import { decrypt } from './src/services/crypto.service.js';

const PUBLIC_KEY = 'GAF6WT7SUU43US6M542RPKELAZMMTIJW4QZHNX7AQTBNLBCRCHP6MMP';

async function giveMXNe() {
    const supabase = getDB();
    const { data: user, error } = await supabase.from('users').select('*').eq('stellar_public_key', PUBLIC_KEY).single();
    
    if (!user || error) {
        console.error('User not found by public key:', error || 'No user match');
        return;
    }

    console.log(`Fondeando MXNe para ${user.email}...`);

    const secretKey = decrypt(user.stellar_secret_key_encrypted);
    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
    
    // El emisor de MXNe en Testnet según stellar.service.js
    const MXNE_ISSUER = 'GAPL3WK52DTYQB23DP7IU3OJAR2YTBXMTAYF54ZG5V377YY7GU2G2UNW';
    const MXNE_ASSET = new StellarSdk.Asset('MXNe', MXNE_ISSUER);

    try {
        const account = await server.loadAccount(keypair.publicKey());
        
        // 1. Asegurar trustline de MXNe
        const hasTrust = account.balances.some(b => b.asset_code === 'MXNe');
        if (!hasTrust) {
            console.log('Creating MXNe trustline...');
            const tx = new StellarSdk.TransactionBuilder(account, { fee: StellarSdk.BASE_FEE })
                .addOperation(StellarSdk.Operation.changeTrust({ asset: MXNE_ASSET }))
                .setTimeout(30)
                .setNetworkPassphrase(StellarSdk.Networks.TESTNET)
                .build();
            tx.sign(keypair);
            await server.submitTransaction(tx);
            console.log('Trustline created.');
            await new Promise(r => setTimeout(r, 2000));
        }

        const freshAccount = await server.loadAccount(keypair.publicKey());
        
        // 2. Realizar Swap (XLM -> MXNe) - Cambiamos 2000 XLM por MXNe
        console.log('Swapping XLM to MXNe...');
        const swapTx = new StellarSdk.TransactionBuilder(freshAccount, { fee: StellarSdk.BASE_FEE })
            .addOperation(StellarSdk.Operation.pathPaymentStrictSend({
                sendAsset: StellarSdk.Asset.native(),
                sendAmount: '2000',
                destination: keypair.publicKey(),
                destAsset: MXNE_ASSET,
                destMin: '550', // Queremos al menos 550 MXNe
                path: []
            }))
            .setTimeout(30)
            .setNetworkPassphrase(StellarSdk.Networks.TESTNET)
            .build();
        
        swapTx.sign(keypair);
        const result = await server.submitTransaction(swapTx);
        console.log('¡MXNe Swap exitoso! Hash:', result.hash);
        process.exit(0);

    } catch (err) {
        console.error('Swap failed:', err.response?.data?.extras?.result_codes || err.message);
        process.exit(1);
    }
}

giveMXNe();
