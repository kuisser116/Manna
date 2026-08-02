import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import { decrypt } from './crypto.service.js';
import { sendPayment } from './stellar.service.js';

const ANCHOR_URL = process.env.MONEYGRAM_ANCHOR_URL || 'https://extstellar.moneygram.com';
const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || StellarSdk.Networks.TESTNET;
const SYSTEM_WALLET = process.env.SYSTEM_WALLET_PUBLIC_KEY || 'GAPL3WK52DTYQB23DP7IU3OJAR2YTBXMTAYF54ZG5V377YY7GU2G2UNW';

/**
 * Genera una interfaz HTML para simular el retiro en Oxxo/MoneyGram

/**
 * Obtiene la configuración del Anchor desde su archivo stellar.toml
 */
export async function getAnchorConfig() {
    try {
        const domain = new URL(ANCHOR_URL).hostname;
        const config = await StellarSdk.StellarToml.Resolver.resolve(domain);
        return config;
    } catch (err) {
        console.error('[AnchorService] Error al resolver stellar.toml:', err.message);
        throw new Error('No se pudo conectar con el servidor de MoneyGram.');
    }
}

/**
 * Autenticación SEP-10: Obtiene un JWT del Anchor firmando un challenge
 */
export async function authenticateSEP10(encryptedSecret) {
    try {
        const config = await getAnchorConfig();
        const authEndpoint = config.WEB_AUTH_ENDPOINT;

        if (!authEndpoint) throw new Error('El Anchor no soporta autenticación WEB_AUTH.');

        const secretKey = decrypt(encryptedSecret);
        const userKeypair = StellarSdk.Keypair.fromSecret(secretKey);
        const userPublicKey = userKeypair.publicKey();

        // 1. Obtener challenge
        const { data: challengeData } = await axios.get(authEndpoint, {
            params: { account: userPublicKey, client_domain: 'Shekael.network' }
        });

        // 2. Firmar challenge
        const networkPassphrase = challengeData.network_passphrase || NETWORK_PASSPHRASE;
        const transaction = StellarSdk.TransactionBuilder.fromXDR(challengeData.transaction, networkPassphrase);
        transaction.sign(userKeypair);
        
        // 3. Enviar challenge firmado
        const { data: tokenData } = await axios.post(authEndpoint, {
            transaction: transaction.toXDR()
        });

        return tokenData.token;
    } catch (err) {
        console.error('[AnchorService] Error en SEP-10:', err.message);
        throw err;
    }
}

/**
 * Inicia el flujo interactivo de retiro SEP-24 (Oxxo)
 * NOTA: El retiro Oxxo aún NO está implementado — se rechaza para no
 * generar recibos falsos. El retiro real funciona vía claim mensual USDC.
 */
export async function initiateWithdrawal(user, assetCode = 'USDC', amount) {
    throw new Error('El retiro en Oxxo aún no está disponible. Usa el retiro mensual USDC desde la billetera.');
}

/**
 * Consulta el estado de una transacción
 */
export async function getTransactionStatus(encryptedSecret, txId) {
    return null;
}
