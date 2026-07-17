import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { getBalance, sendPayment, ensureTrustline } from '../services/stellar.service.js';
import * as StellarSdk from '@stellar/stellar-sdk';
import { decryptWithFallback } from '../services/crypto.service.js';
import { createNotification, getPostAuthorId } from '../services/notifications.service.js';
import { repairWallet } from '../services/quest.service.js';

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const server = new StellarSdk.Horizon.Server(HORIZON_URL);

const MXNE_ISSUER = process.env.MXNE_ISSUER || 'GAGCSH6VQL5Q5JXOOWGAL3HV7XBUEGR5FO5WUP3TKEBRSXJGSZAOKIJH';
const MXNE_ASSET = new StellarSdk.Asset('MXNe', MXNE_ISSUER.trim());

const router = Router({ strict: false });

// POST /transactions/support — Micropago: usuario apoya a creador
router.post('/support', authMiddleware, async (req, res) => {
    try {
        const { to, amount = '0.01', postId } = req.body;
        if (!to) return res.status(400).json({ message: 'Destinatario requerido' });

        const supabase = getDB();
        const { data: sender, error: senderError } = await supabase
            .from('users')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (!sender || senderError) return res.status(404).json({ message: 'Usuario no encontrado' });

        // Evitar auto-apoyo
        if (sender.stellar_public_key === to) {
            return res.status(400).json({ message: 'No puedes apoyarte a ti mismo' });
        }

        // Descifrar clave custodial
        if (!sender.stellar_secret_key_encrypted || sender.stellar_secret_key_encrypted === 'enc-placeholder') {
            return res.status(400).json({ message: 'Tu billetera Stellar no está activa. Completa las misiones en la app para activarla.' });
        }

        let secretKey;
        try {
            secretKey = decryptWithFallback(sender.id, sender.stellar_public_key, sender.stellar_secret_key_encrypted);
        } catch (decryptErr) {
            console.error('Todos los niveles de decrypt fallaron para', sender.id, ':', decryptErr.message);
            return res.status(500).json({
                message: 'No se puede acceder a tu billetera. Contacta a soporte.',
                code: 'DECRYPT_FAILED'
            });
        }

        // Enviar pago en Stellar Testnet
        let txHash;
        try {
            txHash = await sendPayment({
                fromSecretKey: secretKey,
                toPublicKey: to,
                amount,
                assetCode: 'MXNe',
                memo: 'Shekael Support',
            });
        } catch (err) {
            if (err.code === 'WALLET_NOT_ACTIVE') {
                // AUTO-REPAIR: Intentar arreglar la wallet del destinatario en background
                // Buscamos si el 'to' (Public Key) es de un usuario nuestro
                const { data: destUser } = await supabase.from('users').select('id, email').eq('stellar_public_key', to).single();
                if (destUser) {
                    void(`[AutoRepair] Intentando activar wallet de destino: ${destUser.email}`);
                    repairWallet(destUser.id).catch(e => console.error(`[AutoRepair] Falló para ${destUser.email}:`, e.message));
                }

                return res.status(400).json({ 
                    code: 'WALLET_NOT_ACTIVE', 
                    message: 'El destinatario aún no tiene su billetera activa en Stellar. Shekael está intentando activarla automáticamente, intenta de nuevo en un momento.' 
                });
            }
            console.error('Stellar tx failed:', err);
            return res.status(500).json({ message: 'Error en la red Stellar', error: err.message });
        }

        // Registrar en DB (Supabase)
        const txId = uuidv4();
        const { error: txError } = await supabase
            .from('transactions')
            .insert({
                id: txId,
                stellar_hash: txHash,
                from_user: sender.id, // Referencia al ID local
                to_user: to,          // Public Key
                amount: parseFloat(amount),
                type: 'support'
            });

        if (txError) console.error('Error inserting transaction:', txError);

        // Registrar aporte al Fondo Regional (10%)
        // Aunque el pago on-chain sea directo, el sistema registra el "tax" para el Fondo Regional
        await supabase.from('transactions').insert({
            id: uuidv4(),
            stellar_hash: txHash + '-tax',
            from_user: sender.id,
            to_user: 'regional-fund',
            amount: parseFloat(amount) * 0.10,
            type: 'regional_fund_deposit'
        });

        // Incrementar apoyos del post
        if (postId) {
            await supabase.rpc('increment_supports', { post_uuid: postId });

            // Notificación (Support)
            const authorId = await getPostAuthorId(postId);
            if (authorId) {
                await createNotification({ userId: authorId, actorId: req.user.id, type: 'support', postId });
            }
        }

        // Obtener nuevo saldo completo
        const balanceData = await getBalance(sender.stellar_public_key);

        res.json({ hash: txHash, newBalance: balanceData.balance, ...balanceData, amount });
    } catch (err) {
        console.error('Support error:', err.message || err);
        res.status(500).json({ message: err.message || 'Error al procesar el apoyo (MXne)' });
    }
});

// GET /wallet/balance — Saldo real desde Horizon
router.get('/balance', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { data: user, error } = await supabase
            .from('users')
            .select('stellar_public_key')
            .eq('id', req.user.id)
            .single();

        if (!user || error) return res.status(404).json({ message: 'Usuario no encontrado' });

        const balanceData = await getBalance(user.stellar_public_key);
        res.json(balanceData);
    } catch (err) {
        console.error('Balance error:', err);
        res.status(500).json({ message: 'Error al consultar saldo' });
    }
});

/**
 * GET /wallet/deposit-info — Direccion Stellar para depositar
 */
router.get('/deposit-info', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { data: user, error } = await supabase
            .from('users')
            .select('stellar_public_key')
            .eq('id', req.user.id)
            .single();

        if (!user || error) return res.status(404).json({ message: 'Usuario no encontrado' });
        if (!user.stellar_public_key) return res.status(400).json({ message: 'El usuario no tiene wallet Stellar' });

        res.json({
            address: user.stellar_public_key,
            network: process.env.STELLAR_NETWORK || 'TESTNET',
            memoRequired: false
        });
    } catch (err) {
        console.error('Deposit info error:', err);
        res.status(500).json({ message: 'Error al obtener información de depósito' });
    }
});

/**
 * POST /wallet/withdraw-exchange — Enviar XLM a un exchange (Bitso, Binance, etc.)
 */
router.post('/withdraw-exchange', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { to, amount } = req.body;

        if (!to || !amount || amount <= 0) {
            return res.status(400).json({ message: 'Direccion destino y monto requeridos' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('id, stellar_public_key, stellar_secret_key_encrypted')
            .eq('id', req.user.id)
            .single();

        if (!user || error) return res.status(404).json({ message: 'Usuario no encontrado' });
        if (!user.stellar_secret_key_encrypted) {
            return res.status(400).json({ message: 'Wallet no configurada' });
        }

        // Descifrar secret key
        const secretKey = decrypt(user.stellar_secret_key_encrypted);
        if (!secretKey || secretKey === 'enc-placeholder') {
            return res.status(400).json({ message: 'Wallet no disponible para retiros' });
        }

        // Enviar XLM directamente (los exchanges solo aceptan XLM, no tokens personalizados)
        const { sendPayment } = await import('../services/stellar.service.js');
        const hash = await sendPayment({
            fromSecretKey: secretKey,
            toPublicKey: to,
            amount: String(parseFloat(amount)),
            assetCode: 'USDC', // Por ahora usamos USDC si tienen, sino XLM
            memo: 'Shekael withdraw',
        });

        res.json({ hash, message: 'Transferencia enviada correctamente' });
    } catch (err) {
        console.error('Withdraw exchange error:', err);
        if (err.code === 'WALLET_NOT_ACTIVE') {
            return res.status(400).json({ message: 'El exchange destino no acepta este activo. Asegurate de usar una direccion que acepte USDC o XLM.' });
        }
        res.status(500).json({ message: err.message || 'Error al procesar el retiro' });
    }
});

// ─── Swap XLM → MXNe ──────────────────────────────────────
// El usuario manda XLM a la wallet swap master y recibe MXNe en su wallet
router.post('/swap-xlm-to-mxne', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Monto requerido' });

    const { data: user } = await supabase
      .from('users')
      .select('id, stellar_public_key, stellar_secret_key_encrypted')
      .eq('id', req.user.id)
      .single();

    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    // Obtener swap master wallet
    const swapMasterSecret = process.env.SWAP_MASTER_SECRET;
    if (!swapMasterSecret) {
      return res.status(500).json({ message: 'Swap master no configurado. Contacta al equipo.' });
    }

    const masterKeypair = StellarSdk.Keypair.fromSecret(swapMasterSecret);

    // 1. Usuario envía XLM al master (path payment para dejar rastro)
    let secretKey;
    try {
      secretKey = decryptWithFallback(user.id, user.stellar_public_key, user.stellar_secret_key_encrypted);
    } catch {
      return res.status(500).json({ message: 'Error al desencriptar clave' });
    }

    const sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
    const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

    // Verificar saldo XLM
    const xlmBalance = sourceAccount.balances.find(b => b.asset_type === 'native');
    const parsedAmount = parseFloat(amount);
    // Reserve 1 XLM + fee
    if (parseFloat(xlmBalance?.balance || '0') < parsedAmount + 1.5) {
      return res.status(400).json({ message: `XLM insuficiente. Necesitas ${(parsedAmount + 1.5).toFixed(2)}, tienes ${parseFloat(xlmBalance?.balance || '0').toFixed(2)}` });
    }

    // Enviar XLM al master
    const paymentTx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: masterKeypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: String(parsedAmount.toFixed(7)),
        })
      )
      .addMemo(StellarSdk.Memo.text('SWAP:XLM2MXNE'))
      .setTimeout(30)
      .build();

    paymentTx.sign(sourceKeypair);
    await server.submitTransaction(paymentTx);

    // 2. Master envía MXNe al usuario (misma cantidad, tasa 1:1 por ahora)
    const masterAccount = await server.loadAccount(masterKeypair.publicKey());

    const payoutTx = new StellarSdk.TransactionBuilder(masterAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: user.stellar_public_key,
          asset: MXNE_ASSET,
          amount: String(parsedAmount.toFixed(7)),
        })
      )
      .addMemo(StellarSdk.Memo.text('Shekael:swap'))
      .setTimeout(30)
      .build();

    payoutTx.sign(masterKeypair);
    const result = await server.submitTransaction(payoutTx);

    res.json({
      message: `MXNe ${parsedAmount.toFixed(2)} depositados en tu wallet`,
      xlmSpent: parsedAmount,
      mxneReceived: parsedAmount,
      txHash: result.hash,
    });
  } catch (err) {
    console.error('Swap XLM→MXNe error:', err);
    res.status(500).json({ message: err.message || 'Error al convertir' });
  }
});

// ─── Swap MXNe → XLM ──────────────────────────────────────
// El usuario envía MXNe al master y recibe XLM
router.post('/swap-mxne-to-xlm', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Monto requerido' });

    const { data: user } = await supabase
      .from('users')
      .select('id, stellar_public_key, stellar_secret_key_encrypted')
      .eq('id', req.user.id)
      .single();

    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const swapMasterSecret = process.env.SWAP_MASTER_SECRET;
    if (!swapMasterSecret) {
      return res.status(500).json({ message: 'Swap master no configurado' });
    }

    const masterKeypair = StellarSdk.Keypair.fromSecret(swapMasterSecret);

    // 1. Usuario envía MXNe al master
    let secretKey;
    try {
      secretKey = decryptWithFallback(user.id, user.stellar_public_key, user.stellar_secret_key_encrypted);
    } catch {
      return res.status(500).json({ message: 'Error al desencriptar clave' });
    }

    const sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
    const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

    const parsedAmount = parseFloat(amount);

    // Verificar saldo MXNe
    const mxneBalance = sourceAccount.balances.find(b => b.asset_code === 'MXNe');
    if (parseFloat(mxneBalance?.balance || '0') < parsedAmount) {
      return res.status(400).json({ message: `MXNe insuficiente. Tienes ${parseFloat(mxneBalance?.balance || '0').toFixed(2)}` });
    }

    const paymentTx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: masterKeypair.publicKey(),
          asset: MXNE_ASSET,
          amount: String(parsedAmount.toFixed(7)),
        })
      )
      .addMemo(StellarSdk.Memo.text('SWAP:MXNE2XLM'))
      .setTimeout(30)
      .build();

    paymentTx.sign(sourceKeypair);
    await server.submitTransaction(paymentTx);

    // 2. Master envía XLM al usuario (misma cantidad)
    const masterAccount = await server.loadAccount(masterKeypair.publicKey());

    // Dejar 1 XLM de reserva
    const xlmBalance = masterAccount.balances.find(b => b.asset_type === 'native');
    if (parseFloat(xlmBalance?.balance || '0') < parsedAmount + 1.5) {
      return res.status(400).json({ message: 'El pool de swap no tiene suficiente XLM en este momento. Intenta con un monto menor.' });
    }

    const payoutTx = new StellarSdk.TransactionBuilder(masterAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: user.stellar_public_key,
          asset: StellarSdk.Asset.native(),
          amount: String(parsedAmount.toFixed(7)),
        })
      )
      .addMemo(StellarSdk.Memo.text('Shekael:swap'))
      .setTimeout(30)
      .build();

    payoutTx.sign(masterKeypair);
    const result = await server.submitTransaction(payoutTx);

    res.json({
      message: `XLM ${parsedAmount.toFixed(2)} depositados en tu wallet. Ya puedes retirarlos a tu exchange.`,
      mxneSpent: parsedAmount,
      xlmReceived: parsedAmount,
      txHash: result.hash,
    });
  } catch (err) {
    console.error('Swap MXNe→XLM error:', err);
    res.status(500).json({ message: err.message || 'Error al convertir' });
  }
});

export default router;
