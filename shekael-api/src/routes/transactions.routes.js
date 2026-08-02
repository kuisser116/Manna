import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { getBalance, sendPayment, ensureTrustline } from '../services/stellar.service.js';
import * as StellarSdk from '@stellar/stellar-sdk';
import { decryptWithFallback } from '../services/crypto.service.js';
import { createNotification, getPostAuthorId } from '../services/notifications.service.js';
import { repairWallet } from '../services/quest.service.js';
import { convertToUSDC } from '../services/price.service.js';

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const server = new StellarSdk.Horizon.Server(HORIZON_URL);


const router = Router({ strict: false });

// GET /wallet/balance — Obtener saldo de la wallet del usuario
router.get('/balance', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { businessId } = req.query;

        // Balance de un COMERCIO (solo el dueño lo puede consultar)
        if (businessId) {
            const { data: biz } = await supabase
                .from('businesses')
                .select('owner_id, stellar_public_key, name')
                .eq('id', businessId)
                .single();
            if (!biz) return res.status(404).json({ message: 'Comercio no encontrado' });
            if (biz.owner_id !== req.user.id) {
                return res.status(403).json({ message: 'No eres el dueño de este comercio' });
            }
            if (!biz.stellar_public_key) return res.status(400).json({ message: 'El comercio no tiene wallet configurada' });
            const balanceData = await getBalance(biz.stellar_public_key);
            return res.json({
                balance: balanceData.balance,
                usdc: balanceData.usdc,
                xlm: balanceData.xlm,
                mxnBalance: balanceData.mxnBalance,
                currency: balanceData.currency,
                usdcActive: balanceData.usdcActive,
                notFunded: balanceData.notFunded,
                publicKey: biz.stellar_public_key,
                businessName: biz.name,
                businessId,
            });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('stellar_public_key, wallet_activated')
            .eq('id', req.user.id)
            .single();

        if (!user || error) return res.status(404).json({ message: 'Usuario no encontrado' });
        if (!user.stellar_public_key) return res.status(400).json({ message: 'Wallet no configurada' });

        const balanceData = await getBalance(user.stellar_public_key);
        res.json({
            balance: balanceData.balance,
            usdc: balanceData.usdc,
            xlm: balanceData.xlm,
            mxnBalance: balanceData.mxnBalance,
            currency: balanceData.currency,
            usdcActive: balanceData.usdcActive,
            notFunded: balanceData.notFunded,
            publicKey: user.stellar_public_key,
            walletActivated: user.wallet_activated,
        });
    } catch (err) {
        console.error('[Wallet/Balance] Error:', err.message);
        res.status(500).json({ message: 'Error al obtener saldo', error: err.message });
    }
});

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

        // Convertir monto de MXN a USDC (el frontend envía en pesos)
        const amountInUSDC = await convertToUSDC(amount);
        console.log(`[Support] ${amount} MXN ≈ ${amountInUSDC} USDC`);

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

        // Enviar pago en Stellar Testnet (montos en USDC)
        let txHash;
        try {
            txHash = await sendPayment({
                fromSecretKey: secretKey,
                toPublicKey: to,
                amount: String(amountInUSDC),
                assetCode: 'USDC',
                memo: 'Shekael Support',
            });
        } catch (err) {
            if (err.code === 'WALLET_NOT_ACTIVE') {
                // AUTO-REPAIR: Intentar arreglar la wallet del destinatario en background
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
                from_user: sender.id,
                to_user: to,
                amount: parseFloat(amountInUSDC),
                type: 'support'
            });

        if (txError) console.error('Error inserting transaction:', txError);

        // Registrar aporte al Fondo Regional (10%)
        await supabase.from('transactions').insert({
            id: uuidv4(),
            stellar_hash: txHash + '-tax',
            from_user: sender.id,
            to_user: 'regional-fund',
            amount: parseFloat(amountInUSDC) * 0.10,
            type: 'regional_fund_deposit'
        });

        // Incrementar apoyos del post
        if (postId) {
            const { data: currentPost } = await supabase
                .from('posts')
                .select('supports_count')
                .eq('id', postId)
                .single();
            await supabase
                .from('posts')
                .update({ supports_count: (currentPost?.supports_count || 0) + 1 })
                .eq('id', postId);

            // Notificación
            const authorId = await getPostAuthorId(postId);
            if (authorId) {
                await createNotification({ userId: authorId, actorId: req.user.id, type: 'support', postId });
            }
        }

        // Obtener nuevo saldo
        const balanceData = await getBalance(sender.stellar_public_key);

        res.json({ hash: txHash, newBalance: balanceData.balance, ...balanceData, amount, amountMXN: parseFloat(amount) });
    } catch (err) {
        console.error('Support error:', err.message || err);
        res.status(500).json({ message: err.message || 'Error al procesar el apoyo (USDC)' });
    }
});

// POST /transactions/withdraw — Retiro de USDC hacia cualquier cuenta Stellar
router.post('/withdraw', authMiddleware, async (req, res) => {
    try {
        const { to, amount } = req.body;
        if (!to || !amount || amount <= 0) {
            return res.status(400).json({ message: 'Destinatario requerido y monto debe ser > 0' });
        }

        const supabase = getDB();
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (!user || error) return res.status(404).json({ message: 'Usuario no encontrado' });

        if (user.stellar_secret_key_encrypted === 'enc-placeholder') {
            return res.status(400).json({ message: 'Tu billetera Stellar no está activa. Completa las misiones en la app para activarla.' });
        }

        let secretKey;
        try {
            secretKey = decryptWithFallback(user.id, user.stellar_public_key, user.stellar_secret_key_encrypted);
        } catch (decryptErr) {
            console.error('Todos los niveles de decrypt fallaron para', user.id, ':', decryptErr.message);
            return res.status(500).json({
                message: 'No se puede acceder a tu billetera. Contacta a soporte.',
                code: 'DECRYPT_FAILED'
            });
        }

        const txHash = await sendPayment({
            fromSecretKey: secretKey,
            toPublicKey: to,
            amount: String(parseFloat(amount)),
            assetCode: 'USDC',
            memo: 'Shekael Withdraw',
        });

        const txId = uuidv4();
        await supabase.from('transactions').insert({
            id: txId,
            stellar_hash: txHash,
            from_user: user.id,
            to_user: to,
            amount: parseFloat(amount),
            type: 'withdraw'
        });

        const balanceData = await getBalance(user.stellar_public_key);
        res.json({ hash: txHash, newBalance: balanceData.balance, ...balanceData });
    } catch (err) {
        console.error('Withdraw error:', err);
        res.status(500).json({ message: err.message || 'Error al procesar el retiro' });
    }
});

export default router;
