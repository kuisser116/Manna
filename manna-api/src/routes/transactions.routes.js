import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { getBalance, sendPayment } from '../services/stellar.service.js';
import { decrypt } from '../services/crypto.service.js';
import { createNotification, getPostAuthorId } from '../services/notifications.service.js';
import { repairWallet } from '../services/quest.service.js';

const router = Router();

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
        const secretKey = decrypt(sender.stellar_secret_key_encrypted);

        // Enviar pago en Stellar Testnet
        let txHash;
        try {
            txHash = await sendPayment({
                fromSecretKey: secretKey,
                toPublicKey: to,
                amount,
                assetCode: 'MXNe',
                memo: 'Manna Support',
            });
        } catch (err) {
            if (err.code === 'WALLET_NOT_ACTIVE') {
                // AUTO-REPAIR: Intentar arreglar la wallet del destinatario en background
                // Buscamos si el 'to' (Public Key) es de un usuario nuestro
                const { data: destUser } = await supabase.from('users').select('id, email').eq('stellar_public_key', to).single();
                if (destUser) {
                    console.log(`[AutoRepair] Intentando activar wallet de destino: ${destUser.email}`);
                    repairWallet(destUser.id).catch(e => console.error(`[AutoRepair] Falló para ${destUser.email}:`, e.message));
                }

                return res.status(400).json({ 
                    code: 'WALLET_NOT_ACTIVE', 
                    message: 'El destinatario aún no tiene su billetera activa en Stellar. Manna está intentando activarla automáticamente, intenta de nuevo en un momento.' 
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
        console.error('Support error:', err);
        res.status(500).json({ message: 'Error al procesar el apoyo (MXne)' });
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

export default router;
