import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import { decrypt } from './crypto.service.js';
import { sendPayment } from './stellar.service.js';

const ANCHOR_URL = process.env.MONEYGRAM_ANCHOR_URL || 'https://extstellar.moneygram.com';
const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || StellarSdk.Networks.TESTNET;
const SYSTEM_WALLET = process.env.SYSTEM_WALLET_PUBLIC_KEY || 'GAPL3WK52DTYQB23DP7IU3OJAR2YTBXMTAYF54ZG5V377YY7GU2G2UNW';

/**
 * Genera una interfaz HTML para simular el retiro en Oxxo/MoneyGram
 */
const MOCK_HTML = (amount, currency) => {
    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Retiro Aseria - OXXO</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #121212; color: white; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
            .card { background: #1e1e1e; border-radius: 16px; width: 100%; max-width: 350px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); text-align: center; }
            .oxxo-header { background: #e71d24; color: #fff; width: 100%; height: 60px; border-radius: 8px; display: flex; justify-content: center; align-items: center; margin-bottom: 20px; font-weight: bold; font-size: 24px; box-shadow: inset 0 -4px 0 rgba(0,0,0,0.2); }
            .oxxo-logo { height: 35px; }
            .status-badge { background: #4caf50; color: white; padding: 4px 12px; border-radius: 50px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; margin-bottom: 16px; display: inline-block; }
            h2 { margin: 10px 0; font-size: 1.25rem; font-weight: 600; }
            .amount { font-size: 2.5rem; font-weight: 800; color: #fcc911; margin: 16px 0; display: flex; align-items: baseline; justify-content: center; gap: 8px; }
            .currency { font-size: 1rem; color: rgba(255,255,255,0.6); }
            .instruction { color: #a1a1a1; font-size: 0.85rem; margin-bottom: 24px; line-height: 1.4; }
            .barcode-container { background: white; padding: 16px; border-radius: 8px; margin-bottom: 20px; }
            .barcode { height: 80px; width: 100%; background: repeating-linear-gradient(90deg, #000, #000 2px, #fff 2px, #fff 5px); }
            .ref-number { font-family: 'Courier New', Courier, monospace; color: #333; font-weight: bold; margin-top: 8px; letter-spacing: 2px; }
            .footer-info { border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; font-size: 0.75rem; color: #666; }
            .timer { color: #ff5252; font-weight: 600; }
            .screenshot-warning { background: rgba(255, 193, 7, 0.1); border: 1px solid #ffc107; border-radius: 8px; padding: 12px; margin-bottom: 20px; }
            .screenshot-warning .warning-icon { color: #ffc107; font-size: 1.2rem; margin-bottom: 8px; }
            .screenshot-warning .warning-text { color: #ffc107; font-size: 0.8rem; font-weight: 600; line-height: 1.3; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="oxxo-header">OXXO</div>
            <div class="status-badge">Autorizado</div>
            <h2>Retiro Electrónico</h2>
            <p class="instruction">Muestra este código al cajero y solicita un "Retiro de Dinero con Referencia".</p>
            
            <div class="amount">
                ${amount}
                <span class="currency">${currency}</span>
            </div>

            <div class="screenshot-warning">
                <div class="warning-icon">⚠️</div>
                <div class="warning-text">
                    IMPORTANTE: Toma una captura de pantalla de este ticket. 
                    Necesitarás mostrarla al cajero y guardarla como comprobante.
                </div>
            </div>

            <div class="barcode-container">
                <div class="barcode"></div>
                <div class="ref-number">9821-4402-1192-30</div>
            </div>

            <div class="footer-info">
                Expira en: <span class="timer">1 día</span><br>
                ID Transacción: MG-${Date.now().toString().slice(-6)}
            </div>
        </div>
    </body>
    </html>
    `;
    return `data:text/html;base64,${Buffer.from(html).toString('base64')}`;
};

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
            params: { account: userPublicKey, client_domain: 'aseria.network' }
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
 * Inicia el flujo interactivo de retiro SEP-24 (o MOCK en Hackatón)
 */
export async function initiateWithdrawal(user, assetCode = 'USDC', amount) {
    // MODO DEMO: No descontamos saldo aquí. 
    // En la realidad, el descuento ocurriría DESPUÉS de que el cajero de Oxxo 
    // escanee el código y notifique al sistema (vía webhook o similar).
    try {
        console.log(`[MockWithdraw] Generando recibo para ${amount} ${assetCode} (usuario ${user.email}). Sin descuento de saldo para demo.`);
        
        // Devolvemos el Mock inmediatamente sin tocar la red Stellar
        return {
            url: MOCK_HTML(amount || '100.00', assetCode),
            id: 'mock_tx_' + Date.now()
        };

    } catch (err) {
        console.error('⚠️ [MockWithdraw] Error al generar mock:', err.message);
        return {
            url: MOCK_HTML(amount || '100.00', assetCode),
            id: 'mock_tx_' + Date.now()
        };
    }
}

/**
 * Consulta el estado de una transacción
 */
export async function getTransactionStatus(encryptedSecret, txId) {
    if (txId.startsWith('mock_')) {
        // En modo mock, lo dejamos en pending para que el código de barras no desaparezca
        // El usuario puede cerrar el modal manualmente o podemos esperar más.
        return { status: 'pending_user_transfer_start' }; 
    }
    // ... lógica real si fuera necesario ...
    return null;
}
