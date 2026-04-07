import 'dotenv/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import getDB from './src/database/db.js';
import { decrypt } from './src/services/crypto.service.js';

const USER_ID = 'cd9a56be-24c5-49bd-a983-9fb23b36eb1c';
const MXNE_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const MXNE_ASSET = new StellarSdk.Asset('MXNe', MXNE_ISSUER);

async function runSwap() {
    const supabase = getDB();
    const { data: user, error } = await supabase.from('users').select('*').eq('id', USER_ID).single();
    
    if (!user || error) {
        console.error('User not found:', error);
        return;
    }

    const secretKey = decrypt(user.stellar_secret_key_encrypted);
    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');

    try {
        const account = await server.loadAccount(keypair.publicKey());
        
        // 1. Asegurar trustline de MXNe
        const hasTrust = account.balances.some(b => b.asset_code === 'MXNe');
        if (!hasTrust) {
            console.log('Creating MXNe trustline...');
            const tx = new StellarSdk.TransactionBuilder(account, { fee: '1000' })
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
        
        // 2. Realizar Swap (XLM -> MXNe)
        console.log('Swapping 5000 XLM to MXNe...');
        const swapTx = new StellarSdk.TransactionBuilder(freshAccount, { fee: '1000' })
            .addOperation(StellarSdk.Operation.pathPaymentStrictSend({
                sendAsset: StellarSdk.Asset.native(),
                sendAmount: '5000',
                destination: keypair.publicKey(),
                destAsset: MXNE_ASSET,
                destMin: '100', // Al menos 100 pesos
                path: []
            }))
            .setTimeout(30)
            .setNetworkPassphrase(StellarSdk.Networks.TESTNET)
            .build();
        
        swapTx.sign(keypair);
        await server.submitTransaction(swapTx);
        console.log('MXNe Swap successful!');

    } catch (err) {
        console.error('Swap failed:', err.response?.data?.extras?.result_codes || err.message);
    }
}

runSwap();
