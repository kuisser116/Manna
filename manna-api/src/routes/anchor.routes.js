import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import * as anchorService from '../services/anchor.service.js';
import getDB from '../database/db.js';

const router = express.Router();

/**
 * GET /api/anchor/info
 * Obtiene los activos soportados por el anchor
 */
router.get('/info', authMiddleware, async (req, res) => {
    try {
        const config = await anchorService.getAnchorConfig();
        res.json({
            domain: process.env.MONEYGRAM_ANCHOR_URL,
            assets: config.CURRENCIES || []
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * POST /api/anchor/withdraw
 * Inicia el proceso de retiro interactivo (MoneyGram)
 */
router.post('/withdraw', authMiddleware, async (req, res) => {
    try {
        const { assetCode = 'USDC', amount } = req.body;
        const supabase = getDB();
        
        // Validar que el amount sea un número válido
        const requestedAmount = parseFloat(amount);
        if (isNaN(requestedAmount) || requestedAmount <= 0) {
            return res.status(400).json({ message: 'El monto debe ser un número positivo válido.' });
        }
        
        const { data: user, error } = await supabase
            .from('users')
            .select('id, stellar_public_key, stellar_secret_key_encrypted')
            .eq('id', req.user.id)
            .single();
        
        if (!user || error || !user.stellar_public_key) {
            return res.status(400).json({ message: 'El usuario no tiene una wallet vinculada.' });
        }

        // Obtener saldo actual del usuario
        const { getBalance } = await import('../services/stellar.service.js');
        const balance = await getBalance(user.stellar_public_key);
        
        // Validar saldo según la moneda solicitada
        let availableBalance = 0;
        let currencyName = '';
        
        switch (assetCode) {
            case 'USDC':
                availableBalance = parseFloat(balance.usdc);
                currencyName = 'USDC';
                break;
            case 'MXNe':
            case 'MXNc':
                availableBalance = parseFloat(balance.mxne);
                currencyName = 'MXNe';
                break;
            case 'XLM':
                availableBalance = parseFloat(balance.xlm);
                currencyName = 'XLM';
                break;
            default:
                return res.status(400).json({ message: 'Moneda no soportada. Use USDC, MXNe o XLM.' });
        }
        
        // Validar que el usuario tenga saldo suficiente
        if (requestedAmount > availableBalance) {
            return res.status(400).json({ 
                message: `Saldo insuficiente. Tienes ${availableBalance.toFixed(2)} ${currencyName} disponibles, pero intentas retirar ${requestedAmount.toFixed(2)} ${currencyName}.` 
            });
        }

        console.log(`[Withdraw] Usuario ${req.user.id} solicitando retiro de ${requestedAmount} ${assetCode}. Saldo disponible: ${availableBalance} ${currencyName}`);

        const result = await anchorService.initiateWithdrawal(user, assetCode, amount);
        res.json(result); // Devuelve { url, id }
    } catch (err) {
        console.error('[Withdraw] Error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

/**
 * GET /api/anchor/status/:id
 * Consulta el estado de la transacción en el Anchor
 */
router.get('/status/:id', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { data: user } = await supabase
            .from('users')
            .select('stellar_secret_key_encrypted')
            .eq('id', req.user.id)
            .single();

        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

        const transaction = await anchorService.getTransactionStatus(user.stellar_secret_key_encrypted, req.params.id);
        
        if (!transaction) {
            return res.status(404).json({ message: 'Transacción no encontrada en el Anchor.' });
        }

        res.json(transaction);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
