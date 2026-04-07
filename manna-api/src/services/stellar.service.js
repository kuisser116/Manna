import * as StellarSdk from '@stellar/stellar-sdk';
import { convertToMXN } from './price.service.js';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

const server = new StellarSdk.Horizon.Server(HORIZON_URL);

const USDC_ISSUER = process.env.USDC_ISSUER || 'GAPL3WK52DTYQB23DP7IU3OJAR2YTBXMTAYF54ZG5V377YY7GU2G2UNW';
const MXNE_ISSUER = process.env.MXNE_ISSUER || 'GAGCSH6VQL5Q5JXOOWGAL3HV7XBUEGR5FO5WUP3TKEBRSXJGSZAOKIJH';
const MXNC_ISSUER = process.env.MXNC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

// Función para validar si una clave pública de Stellar es válida
function isValidPublicKey(key) {
    try {
        StellarSdk.Keypair.fromPublicKey(key);
        return true;
    } catch (e) {
        return false;
    }
}

// Inicializar activos con validación
let USDC_ASSET, MXNC_ASSET, MXNE_ASSET;

try {
    if (!isValidPublicKey(USDC_ISSUER)) throw new Error(`USDC_ISSUER inválido: ${USDC_ISSUER}`);
    if (!isValidPublicKey(MXNC_ISSUER)) throw new Error(`MXNC_ISSUER inválido: ${MXNC_ISSUER}`);
    if (!isValidPublicKey(MXNE_ISSUER)) throw new Error(`MXNE_ISSUER inválido: ${MXNE_ISSUER}`);
    
    USDC_ASSET = new StellarSdk.Asset('USDC', USDC_ISSUER.trim());
    MXNC_ASSET = new StellarSdk.Asset('MXNc', MXNC_ISSUER.trim());
    MXNE_ASSET = new StellarSdk.Asset('MXNe', MXNE_ISSUER.trim());
} catch (err) {
    console.error('❌ CRITICAL: Error inicializando activos de Stellar:', err.message);
    USDC_ASSET = StellarSdk.Asset.native();
    MXNC_ASSET = StellarSdk.Asset.native();
    MXNE_ASSET = StellarSdk.Asset.native();
}

// Crear un nuevo keypair Stellar
export function createWallet() {
    return StellarSdk.Keypair.random();
}

// Fondear cuenta nueva con Friendbot (solo Testnet)
export async function fundWithFriendbot(publicKey) {
    try {
        const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`, {
            signal: AbortSignal.timeout(60000)
        });
        const json = await res.json();
        if (json.status === 400) {
            console.warn('Friendbot: cuenta ya fondeada o error:', json.detail);
        }
        return json;
    } catch (err) {
        console.warn('Friendbot failed:', err.message);
        return null;
    }
}

// Obtener saldo de una cuenta en Horizon
export async function getBalance(publicKey) {
    try {
        const account = await server.loadAccount(publicKey);
        const xlmBalance = account.balances.find((b) => b.asset_type === 'native');
        const usdcBalanceValue = account.balances.find((b) => b.asset_code === 'USDC');
        const mxncBalanceValue = account.balances.find((b) => b.asset_code === 'MXNc');
        const mxneBalanceValue = account.balances.find((b) => b.asset_code === 'MXNe');
        
        const usdcVal = parseFloat(usdcBalanceValue?.balance || '0');
        const mxncVal = parseFloat(mxncBalanceValue?.balance || '0');
        const mxneVal = parseFloat(mxneBalanceValue?.balance || '0');
        const xlmVal = parseFloat(xlmBalance?.balance || '0');

        let mainBalance = '0.00';
        let mainCurrency = 'XLM';

        if (mxneVal > 0 || mxncVal > 0) {
            mainBalance = (mxneVal + mxncVal).toFixed(7);
            mainCurrency = 'MXNe';
        }
 else if (usdcVal > 0) {
            mainBalance = usdcBalanceValue.balance;
            mainCurrency = 'USDC';
        } else {
            mainBalance = xlmBalance?.balance || '0.00';
            mainCurrency = 'XLM';
        }

        // Siempre mostrar el balance real de MXNe desde blockchain
        const realMXNeBalance = mxneBalanceValue?.balance || '0.00';
        
        return {
            xlm: xlmBalance?.balance || '0',
            usdc: usdcBalanceValue?.balance || '0.00',
            mxne: (mxneVal + mxncVal).toFixed(7),
            balance: mainBalance,
            currency: mainCurrency,
            balanceMXN: (mxneVal + mxncVal).toFixed(2), // Suma ambos para visualización
            publicKey,
        };
    } catch (err) {
        // Cuenta no fondeada aún
        if (err.response?.status === 404) {
            return { xlm: '0', usdc: '0.00', balance: '0.00', balanceMXN: '0.00', currency: 'XLM', publicKey, notFunded: true };
        }
        console.error('getBalance error:', err.message);
        return { xlm: '0', usdc: '0.00', balance: '0.00', balanceMXN: '0.00', currency: 'XLM', publicKey };
    }
}

// Verifica si la cuenta destino existe y tiene trustlines (Misiones completadas)
export async function isWalletActive(publicKey) {
    try {
        const account = await server.loadAccount(publicKey);
        const hasUSDC = account.balances.some(b => b.asset_code === 'USDC');
        const hasMXNe = account.balances.some(b => b.asset_code === 'MXNe');
        return hasUSDC || hasMXNe;
    } catch (err) {
        if (err.response?.status === 404) return false;
        return false;
    }
}

// Enviar pago en Stellar Testnet
export async function sendPayment({ fromSecretKey, toPublicKey, amount, assetCode = 'USDC', memo = 'Manna' }) {
    if (!fromSecretKey || fromSecretKey === 'enc-placeholder') {
        throw new Error('Clave secreta no válida para esta wallet de sistema');
    }

    const sourceKeypair = StellarSdk.Keypair.fromSecret(fromSecretKey);
    const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

    // Verificar rigurosamente que el destinatario existe y tiene la Trustline activa
    try {
        const destAccount = await server.loadAccount(toPublicKey);
        const hasAsset = destAccount.balances.some(b => b.asset_code === assetCode);
        if (!hasAsset) {
            const err = new Error('El usuario no tiene activa la billetera de ' + assetCode);
            err.code = 'WALLET_NOT_ACTIVE';
            throw err;
        }
    } catch (err) {
        if (err.code === 'WALLET_NOT_ACTIVE') throw err;
        const e = new Error('Cuenta destructiva no encontrada (Billetera Inactiva)');
        e.code = 'WALLET_NOT_ACTIVE';
        throw e;
    }

    // Asegurar trustline para USDC antes de pagar (si es necesario)
    // En este flujo, el sender debe tener el trustline para poseer USDC.
    
    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
    })
        .addOperation(
            StellarSdk.Operation.payment({
                destination: toPublicKey,
                asset: assetCode === 'MXNe' ? MXNE_ASSET : (assetCode === 'MXNc' ? MXNC_ASSET : USDC_ASSET),
                amount: String(parseFloat(amount).toFixed(7)),
            })
        )
        .addMemo(StellarSdk.Memo.text(memo.slice(0, 28)))
        .setTimeout(30)
        .build();

    transaction.sign(sourceKeypair);
    
    try {
        const result = await server.submitTransaction(transaction);
        return result.hash;
    } catch (err) {
        if (err.response && err.response.data && err.response.data.extras) {
            const resultCodes = err.response.data.extras.result_codes;
            console.error('Stellar submit failed with Result Codes:', resultCodes);
            
            const ops = resultCodes.operations || [];
            if (ops.includes('op_underfunded')) {
                throw new Error(`Saldo insuficiente de ${assetCode} (o falta de XLM para comisiones) para completar esta transacción.`);
            }
            if (ops.includes('op_no_trust')) {
                const e = new Error('El destinatario no ha activado la billetera para ' + assetCode + '.');
                e.code = 'WALLET_NOT_ACTIVE';
                throw e;
            }
            if (resultCodes.transaction === 'tx_bad_seq') {
                throw new Error('Error de secuencia en la red. Intenta de nuevo en unos segundos.');
            }
            throw new Error(`Error en la red Stellar: ${resultCodes.transaction} | ${ops.join(',')}`);
        }
        throw err;
    }
}

// Obtener historial de transacciones de una cuenta
export async function getTransactionHistory(publicKey, limit = 10) {
    try {
        const txs = await server.transactions()
            .forAccount(publicKey)
            .order('desc')
            .limit(limit)
            .call();

        return txs.records.map((tx) => ({
            hash: tx.hash,
            createdAt: tx.created_at,
            memo: tx.memo,
            explorerUrl: `https://stellar.expert/explorer/testnet/tx/${tx.hash}`,
        }));
    } catch {
        return [];
    }
}

/**
 * Registra la autoría de un CID en la blockchain de Stellar usando manageData.
 * 
 * Técnica: Graba `manna:cid:{CID_slice}` en los datos de la cuenta del creador.
 * Esto es una prueba criptográfica inmutable de que esa wallet publicó ese contenido.
 * 
 * Cuando el contrato ContentOwnership de Soroban esté desplegado, solo hay que
 * cambiar la implementación aquí — el resto del código no necesita cambiar.
 * 
 * @param {string} secretKey  - Clave secreta de la wallet del creador (custodial)
 * @param {string} cid        - CID del contenido (calculado localmente)
 * @returns {string|null}     - Hash de la transacción en Stellar, o null si falla
 */
export async function registerContentOwnership(secretKey, cid) {
    if (!secretKey || secretKey === 'enc-placeholder') {
        console.warn('registerContentOwnership: clave secreta no válida, saltando registro.');
        return null;
    }
    try {
        const sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
        const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

        // manageData graba un par clave-valor en la cuenta on-chain.
        // La clave tiene límite de 64 bytes. Usamos los primeros 56 chars del CID.
        const dataKey = `manna:${cid.slice(0, 56)}`;
        const dataValue = 'owned';

        const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: NETWORK_PASSPHRASE,
        })
            .addOperation(
                StellarSdk.Operation.manageData({
                    name: dataKey,
                    value: dataValue,
                })
            )
            .addMemo(StellarSdk.Memo.text('manna:ownership'))
            .setTimeout(30)
            .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);
        console.log(`✅ ContentOwnership registrado on-chain. Hash: ${result.hash}`);
        return result.hash;
    } catch (err) {
        // Si la cuenta no existe en Horizon (404), es porque está en modo 'off-chain' (esperando misiones)
        if (err.response?.status === 404) {
            console.log(`ℹ️  ContentOwnership: cuenta del creador aún off-chain. Registro pospuesto.`);
            return null;
        }

        // Otros errores no críticos
        console.warn('registerContentOwnership: no pudo registrar on-chain:', err.message);
        return null;
    }
}

/**
 * Registra el consentimiento de datos del usuario en Stellar como prueba inmutable.
 * Usa manageData para grabar el memo de consentimiento en la cuenta del usuario.
 * Esto crea un timestamp irrefutable y verificable en Stellar Explorer.
 *
 * @param {object} user - { stellar_public_key, stellar_secret_key_encrypted }
 * @param {string} memoText - 'MANNA_CONSENT_V1' | 'MANNA_REVOKE_V1'
 * @returns {{ hash: string }|null}
 */
export async function sendConsentMemo(user, memoText) {
    if (!user?.stellar_secret_key_encrypted || user.stellar_secret_key_encrypted === 'enc-placeholder') {
        console.warn('sendConsentMemo: clave secreta no válida, saltando registro.');
        return null;
    }

    try {
        // Desencriptar clave (reutiliza la misma lógica que el resto del backend)
        const { decryptSecret } = await import('./crypto.service.js');
        const secretKey = decryptSecret(user.stellar_secret_key_encrypted);

        const sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
        const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

        const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: NETWORK_PASSPHRASE,
        })
            .addOperation(
                StellarSdk.Operation.manageData({
                    name: 'manna:consent',
                    value: memoText.slice(0, 64),
                })
            )
            .addMemo(StellarSdk.Memo.text(memoText.slice(0, 28)))
            .setTimeout(30)
            .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);
        console.log(`✅ Consentimiento registrado on-chain. Hash: ${result.hash}`);
        return { hash: result.hash };
    } catch (err) {
        console.warn('sendConsentMemo: no pudo registrar on-chain:', err.message);
        return null;
    }
}

/**
 * Establece la línea de confianza para USDC en una cuenta.
 * Requerido para poder recibir y enviar USDC.
 */
/**
 * Invoca el contrato de Soroban para distribuir recompensas de anuncios.
 */
export async function invokeAdDistribution({ 
    advertiserSecret, 
    viewerPublicKey, 
    creatorPublicKey = null, 
    amount, 
    isFeed 
}) {
    if (!advertiserSecret || advertiserSecret === 'enc-placeholder') {
        throw new Error('Clave secreta no válida para Soroban');
    }

    const sourceKeypair = StellarSdk.Keypair.fromSecret(advertiserSecret);
    const contractId = process.env.AD_DISTRIBUTION_CONTRACT_ID;

    if (!contractId) {
        console.warn('[Soroban] No hay Contract ID. Simulando ejecución del contrato...');
        return 'sim_soroban_' + Date.now();
    }

    try {
        const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
        const contract = new StellarSdk.Contract(contractId);
        
        // Soroban usa montos en i128. Multiplicamos por 10^7 (stroops)
        const amountI128 = StellarSdk.nativeToScVal(
            BigInt(Math.round(parseFloat(amount) * 10_000_000)), 
            { type: 'i128' }
        );

        // SAC (Stellar Asset Contract) ID para MXNe
        const mxneTokenAddress = MXNE_ASSET.contractId(NETWORK_PASSPHRASE);

        const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: (parseInt(StellarSdk.BASE_FEE) * 100).toString(), // Fee más alta para Soroban
            networkPassphrase: NETWORK_PASSPHRASE,
        })
        .addOperation(
            contract.call(
                'distribute',
                ...[
                    sourceKeypair.publicKey(), // advertiser
                    viewerPublicKey,           // viewer
                    creatorPublicKey,          // creator (Option handling needed if using nativeToScVal)
                    mxneTokenAddress,          // token_id
                    amountI128,                // amount
                    isFeed,                    // is_feed
                    process.env.MANNA_DEV_WALLET, 
                    process.env.MANNA_BARN_WALLET
                ].map(val => {
                    if (val === null) return StellarSdk.nativeToScVal(null);
                    if (typeof val === 'boolean') return StellarSdk.nativeToScVal(val);
                    if (typeof val === 'string' && (val.startsWith('G') || val.startsWith('C'))) {
                        return new StellarSdk.Address(val).toScVal();
                    }
                    return StellarSdk.nativeToScVal(val);
                })
            )
        )
        .setTimeout(30)
        .build();

        tx.sign(sourceKeypair);
        const result = await server.submitTransaction(tx);
        return result.hash;
    } catch (err) {
        console.error('[Soroban Invoke Error]:', err.message);
        throw err;
    }
}

/**
 * Establece la línea de confianza para USDC y MXNe en una cuenta.
 */
export async function ensureTrustline(secretKey, retries = 3) {
    try {
        const keypair = StellarSdk.Keypair.fromSecret(secretKey);
        let account;
        
        // Loop de reintento para manejar el 404 (Not Found) de Horizon
        // Útil si la cuenta acaba de ser fondeada y Horizon aún no la ve (Sync delay)
        for (let i = 0; i < retries; i++) {
            try {
                account = await server.loadAccount(keypair.publicKey());
                break;
            } catch (err) {
                if (err.response?.status === 404 && i < retries - 1) {
                    console.log(`[Stellar] Cuenta ${keypair.publicKey()} no encontrada. Reintentando en 2s... (${i+1}/${retries})`);
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                throw err;
            }
        }

        const assets = [USDC_ASSET, MXNE_ASSET]; // Priorizar MXNe
        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: NETWORK_PASSPHRASE,
        });

        let ops = 0;
        for (const asset of assets) {
            const hasTrustline = account.balances.some(
                (b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer
            );
            if (!hasTrustline) {
                transaction.addOperation(StellarSdk.Operation.changeTrust({ asset }));
                ops++;
            }
        }

        if (ops === 0) return true;

        transaction.setTimeout(30);
        const builtTx = transaction.build();
        builtTx.sign(keypair);
        await server.submitTransaction(builtTx);
        console.log(`✅ Trustlines creadas para ${keypair.publicKey()}`);
        return true;
    } catch (err) {
        console.error('Error al crear trustlines:', err.message);
        return false;
    }
}
