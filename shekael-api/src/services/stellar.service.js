import * as StellarSdk from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

const server = new StellarSdk.Horizon.Server(HORIZON_URL);

const STABLECOIN_CODE = process.env.STABLECOIN_CODE || 'USDC';
const STABLECOIN_ISSUER = process.env.STABLECOIN_ISSUER || 'GAPL3WK52DTYQB23DP7IU3OJAR2YTBXMTAYF54ZG5V377YY7GU2G2UNW';

// Función para validar si una clave pública de Stellar es válida
function isValidPublicKey(key) {
    try {
        StellarSdk.Keypair.fromPublicKey(key);
        return true;
    } catch (e) {
        return false;
    }
}

// Inicializar activo con validación
let STABLECOIN_ASSET;

try {
    if (!isValidPublicKey(STABLECOIN_ISSUER)) throw new Error(`STABLECOIN_ISSUER inválido: ${STABLECOIN_ISSUER}`);
    STABLECOIN_ASSET = new StellarSdk.Asset(STABLECOIN_CODE, STABLECOIN_ISSUER.trim());
} catch (err) {
    console.error('❌ CRITICAL: Error inicializando activo de Stellar:', err.message);
    STABLECOIN_ASSET = StellarSdk.Asset.native();
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
        const usdcBalanceValue = account.balances.find((b) => b.asset_code === STABLECOIN_CODE);

        const usdcVal = parseFloat(usdcBalanceValue?.balance || '0');
        const xlmVal = parseFloat(xlmBalance?.balance || '0');

        // Siempre mostramos USDC como moneda principal, incluso en 0
        // XLM solo se muestra como dato informativo (reserva de la red)
        const hasUsdcTrustline = !!usdcBalanceValue;
        const mainBalance = usdcBalanceValue?.balance || '0.00';
        const mainCurrency = 'USDC';

        return {
            xlm: xlmBalance?.balance || '0',
            usdc: usdcBalanceValue?.balance || '0.00',
            balance: mainBalance,
            currency: mainCurrency,
            usdcActive: hasUsdcTrustline,
            publicKey,
        };
    } catch (err) {
        // Cuenta no fondeada aún
        if (err.response?.status === 404) {
            return { xlm: '0', usdc: '0.00', balance: '0.00', currency: 'USDC', publicKey, notFunded: true, usdcActive: false };
        }
        console.error('getBalance error:', err.message);
        return { xlm: '0', usdc: '0.00', balance: '0.00', currency: 'USDC', publicKey, usdcActive: false };
    }
}

// Verifica si la cuenta destino existe y tiene trustline del stablecoin
export async function isWalletActive(publicKey) {
    try {
        const account = await server.loadAccount(publicKey);
        const hasUSDC = account.balances.some(b => b.asset_code === STABLECOIN_CODE);
        return hasUSDC;
    } catch (err) {
        if (err.response?.status === 404) return false;
        return false;
    }
}

// Enviar pago en Stellar
export async function sendPayment({ fromSecretKey, toPublicKey, amount, assetCode = STABLECOIN_CODE, memo = 'Shekael' }) {
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

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
    })
        .addOperation(
            StellarSdk.Operation.payment({
                destination: toPublicKey,
                asset: STABLECOIN_ASSET,
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
 */
export async function registerContentOwnership(secretKey, cid) {
    if (!secretKey || secretKey === 'enc-placeholder') {
        console.warn('registerContentOwnership: clave secreta no válida, saltando registro.');
        return null;
    }
    try {
        const sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
        const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

        const dataKey = `Shekael:${cid.slice(0, 56)}`;
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
            .addMemo(StellarSdk.Memo.text('Shekael:ownership'))
            .setTimeout(30)
            .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);
        void(`✅ ContentOwnership registrado on-chain. Hash: ${result.hash}`);
        return result.hash;
    } catch (err) {
        if (err.response?.status === 404) {
            void(`ℹ️  ContentOwnership: cuenta del creador aún off-chain. Registro pospuesto.`);
            return null;
        }
        console.warn('registerContentOwnership: no pudo registrar on-chain:', err.message);
        return null;
    }
}

/**
 * Registra el consentimiento de datos del usuario en Stellar como prueba inmutable.
 */
export async function sendConsentMemo(user, memoText) {
    if (!user?.stellar_secret_key_encrypted || user.stellar_secret_key_encrypted === 'enc-placeholder') {
        console.warn('sendConsentMemo: clave secreta no válida, saltando registro.');
        return null;
    }

    try {
        const { decryptWithFallback } = await import('./crypto.service.js');
        const secretKey = decryptWithFallback(user.id, user.stellar_public_key, user.stellar_secret_key_encrypted);

        const sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
        const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

        const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: NETWORK_PASSPHRASE,
        })
            .addOperation(
                StellarSdk.Operation.manageData({
                    name: 'Shekael:consent',
                    value: memoText.slice(0, 64),
                })
            )
            .addMemo(StellarSdk.Memo.text(memoText.slice(0, 28)))
            .setTimeout(30)
            .build();

        transaction.sign(sourceKeypair);
        const result = await server.submitTransaction(transaction);
        void(`✅ Consentimiento registrado on-chain. Hash: ${result.hash}`);
        return { hash: result.hash };
    } catch (err) {
        console.warn('sendConsentMemo: no pudo registrar on-chain:', err.message);
        return null;
    }
}

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

        // SAC (Stellar Asset Contract) ID para el stablecoin
        const tokenAddress = STABLECOIN_ASSET.contractId(NETWORK_PASSPHRASE);

        const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: (parseInt(StellarSdk.BASE_FEE) * 100).toString(),
            networkPassphrase: NETWORK_PASSPHRASE,
        })
        .addOperation(
            contract.call(
                'distribute',
                ...[
                    sourceKeypair.publicKey(),
                    viewerPublicKey,
                    creatorPublicKey,
                    tokenAddress,
                    amountI128,
                    isFeed,
                    process.env.Shekael_DEV_WALLET,
                    process.env.Shekael_BARN_WALLET
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
 * Establece la línea de confianza para el stablecoin en una cuenta.
 */
export async function ensureTrustline(secretKey, retries = 3) {
    try {
        const keypair = StellarSdk.Keypair.fromSecret(secretKey);
        let account;

        for (let i = 0; i < retries; i++) {
            try {
                account = await server.loadAccount(keypair.publicKey());
                break;
            } catch (err) {
                if (err.response?.status === 404 && i < retries - 1) {
                    void(`[Stellar] Cuenta ${keypair.publicKey()} no encontrada. Reintentando en 2s... (${i+1}/${retries})`);
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                throw err;
            }
        }

        const hasTrustline = account.balances.some(
            (b) => b.asset_code === STABLECOIN_ASSET.code && b.asset_issuer === STABLECOIN_ASSET.issuer
        );

        if (hasTrustline) return true;

        const transaction = new StellarSdk.TransactionBuilder(account, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: NETWORK_PASSPHRASE,
        })
            .addOperation(StellarSdk.Operation.changeTrust({ asset: STABLECOIN_ASSET }))
            .setTimeout(30)
            .build();

        transaction.sign(keypair);
        await server.submitTransaction(transaction);
        void(`✅ Trustline creada para ${keypair.publicKey()}`);
        return true;
    } catch (err) {
        console.error('Error al crear trustline:', err.message);
        return false;
    }
}
