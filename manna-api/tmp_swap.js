import 'dotenv/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import getDB from './src/database/db.js';
import { decrypt } from './src/services/crypto.service.js';

const USER_ID = 'cd9a56be-24c5-49bd-a983-9fb23b36eb1c';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC_ASSET = new StellarSdk.Asset('USDC', USDC_ISSUER);

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
        
        // 1. Asegurar trustline de forma manual si no está
        const hasTrust = account.balances.some(b => b.asset_code === 'USDC');
        if (!hasTrust) {
            console.log('Creating USDC trustline...');
            const tx = new StellarSdk.TransactionBuilder(account, { fee: '1000' })
                .addOperation(StellarSdk.Operation.changeTrust({ asset: USDC_ASSET }))
                .setTimeout(30)
                .setNetworkPassphrase(StellarSdk.Networks.TESTNET)
                .build();
            tx.sign(keypair);
            await server.submitTransaction(tx);
            console.log('Trustline created.');
            // Reload account
            await new Promise(r => setTimeout(r, 2000));
        }

        const freshAccount = await server.loadAccount(keypair.publicKey());
        
        // 2. Realizar PathPayment (XLM -> USDC)
        console.log('Swapping 5000 XLM to USDC...');
        const swapTx = new StellarSdk.TransactionBuilder(freshAccount, { fee: '1000' })
            .addOperation(StellarSdk.Operation.pathPaymentStrictSend({
                sendAsset: StellarSdk.Asset.native(),
                sendAmount: '5000',
                destination: keypair.publicKey(),
                destAsset: USDC_ASSET,
                destMin: '10', // Queremos al menos 10 USDC
                path: []
            }))
            .setTimeout(30)
            .setNetworkPassphrase(StellarSdk.Networks.TESTNET)
            .build();
        
        swapTx.sign(keypair);
        const result = await server.submitTransaction(swapTx);
        console.log('Swap successful!', result.hash);

    } catch (err) {
        console.error('Swap failed:', err.response?.data?.extras?.result_codes || err.message);
    }
}

runSwap();
