import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { sendPayment, getBalance, ensureTrustline } from '../services/stellar.service.js';
import { decrypt } from '../services/crypto.service.js';

const router = Router({ strict: false });

function currentMonthYear() {
    return new Date().toISOString().slice(0, 7);
}

const MAX_DISCOUNT_PER_TX = 50.00; // Máximo descuento por transacción (MXNe)

// GET /regional-fund/balance — Saldo del fondo regional del usuario
router.get('/balance', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        
        // 1. Obtener el estado del usuario
        const { data: user } = await supabase
            .from('users')
            .select('state')
            .eq('id', req.user.id)
            .single();

        const userState = user?.state;

        if (!userState) {
            return res.json({ 
                needsState: true, 
                message: 'Por favor selecciona tu estado para ver el Fondo Regional.' 
            });
        }

        // 2. Calcular saldo acumulado para ese estado
        const { data: txs } = await supabase
            .from('transactions')
            .select('amount')
            .eq('type', 'regional_fund_deposit');
        
        const totalAccumulated = (txs || []).reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);

        res.json({
            state: userState,
            total: totalAccumulated.toFixed(2),
        });
    } catch (err) {
        console.error('Regional fund balance error:', err);
        res.status(500).json({ message: 'Error al cargar el fondo regional' });
    }
});

// POST /regional-fund/update-state — Actualizar estado del usuario
router.post('/update-state', authMiddleware, async (req, res) => {
    try {
        const { state } = req.body;
        if (!state) return res.status(400).json({ message: 'Estado requerido' });

        const supabase = getDB();
        await supabase
            .from('users')
            .update({ state })
            .eq('id', req.user.id);

        res.json({ success: true, state });
    } catch (err) {
        console.error('Update state error:', err);
        res.status(500).json({ message: 'Error al actualizar estado' });
    }
});

// POST /admin/simulate-ad — Simula distribución (10% al Fondo Regional)
router.post('/admin/simulate-ad', authMiddleware, async (req, res) => {
    try {
        const total = 1.00;
        // Nueva distribución según AI_RULES.md (10% al Fondo Regional)
        const distribution = {
            creator: (total * 0.50).toFixed(2),
            viewer: (total * 0.20).toFixed(2),
            regional_fund: (total * 0.10).toFixed(2), // 10%
            dev_infra: (total * 0.20).toFixed(2), // Restante para dev/infra
        };

        const supabase = getDB();
        
        // Registrar la transacción principal (distribución)
        const txId = uuidv4();
        await supabase.from('transactions').insert({
            id: txId,
            stellar_hash: 'demo-distribute-' + Date.now(),
            from_user: 'ad-fund',
            to_user: req.user.stellar_public_key,
            amount: total,
            type: 'distribute'
        });

        // Registrar el depósito al Fondo Regional (10%)
        await supabase.from('transactions').insert({
            id: uuidv4(),
            stellar_hash: 'demo-regional-fund-' + Date.now(),
            from_user: 'ad-fund',
            to_user: 'regional-fund-wallet', // Wallet representativa
            amount: parseFloat(distribution.regional_fund),
            type: 'regional_fund_deposit'
        });

        res.json({
            success: true,
            distribution,
            message: `$1.00 distribuido (10% al Fondo Regional)`,
        });
    } catch (err) {
        console.error('SimulateAd error:', err);
        res.status(500).json({ message: 'Error en simulación' });
    }
});
// POST /regional-fund/pay — Pagar con QR (P2M/P2P)
router.post('/pay', authMiddleware, async (req, res) => {
    try {
        const { toPublicKey, amount, assetCode = 'MXNe' } = req.body;
        if (!toPublicKey || !amount) return res.status(400).json({ message: 'Datos incompletos' });
        
        console.log(`[QR Pay] Iniciando pago: ${amount} ${assetCode} para ${toPublicKey}`);

        const supabase = getDB();
        
        // 1. Obtener emisor
        const { data: sender, error: senderError } = await supabase
            .from('users')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (senderError) console.error('Error fetching sender:', senderError);
        if (!sender) return res.status(404).json({ message: 'Usuario emisor no encontrado en la base de datos' });

        // 2. Verificar si el destinatario es un comercio verificado
        const { data: merchant } = await supabase
            .from('users')
            .select('is_verified_merchant, business_name')
            .eq('stellar_public_key', toPublicKey)
            .single();

        const isDiscountApplicable = merchant?.is_verified_merchant;
        
        // 2.1 Calcular subsidio y validar fondo regional
        let discountFactor = 1.00;
        let fundSubsidizedAmount = "0";
        let subsidyMessage = null;

        if (isDiscountApplicable) {
            // Calcular saldo REAL acumulado para el fondo regional
            const { data: txs } = await supabase
                .from('transactions')
                .select('amount')
                .eq('type', 'regional_fund_deposit');
            
            const totalFund = (txs || []).reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);
            
            // Subsidio potencial (5%)
            let potentialSubsidy = parseFloat(amount) * 0.05;
            // Aplicar tope de 5 USDC
            let actualSubsidy = Math.min(potentialSubsidy, MAX_DISCOUNT_PER_TX);

            if (totalFund >= actualSubsidy) {
                fundSubsidizedAmount = actualSubsidy.toFixed(7);
                // El usuario paga: monto original - subsidio real
                const userAmountNum = parseFloat(amount) - actualSubsidy;
                discountFactor = userAmountNum / parseFloat(amount);
            } else {
                subsidyMessage = "Subsidio no aplicable: Fondos regionales insuficientes";
            }
        }

        const userAmount = (parseFloat(amount) * discountFactor).toString();

        // 3. Procesar pago en Stellar (Desde el usuario)
        const secretKey = decrypt(sender.stellar_secret_key_encrypted);
        
        // Asegurar trustline para el activo
        await ensureTrustline(secretKey);

        const senderKeypair = await import('@stellar/stellar-sdk').then(m => m.Keypair.fromSecret(secretKey));
        console.log(`[QR Pay] DEBUG - Solicitado por: ${sender.email}. Usando Wallet Stellar: ${senderKeypair.publicKey()}`);

        const txHash = await sendPayment({
            fromSecretKey: secretKey,
            toPublicKey,
            amount: userAmount,
            assetCode,
            memo: isDiscountApplicable ? `Ehise Pay: ${merchant.business_name}` : 'Ehise Transfer'
        });

        // 4. Registrar transacción en DB
        await supabase.from('transactions').insert({
            id: uuidv4(),
            stellar_hash: txHash,
            from_user: sender.id,
            to_user: toPublicKey,
            amount: parseFloat(userAmount),
            type: 'p2m_payment'
        });

        // 5. Si hubo subsidio, registrar el aporte del fondo regional (Simulado)
        if (isDiscountApplicable && parseFloat(fundSubsidizedAmount) > 0) {
            await supabase.from('transactions').insert({
                id: uuidv4(),
                stellar_hash: txHash + '-subsidy',
                from_user: 'regional-fund',
                to_user: toPublicKey,
                amount: parseFloat(fundSubsidizedAmount),
                type: 'regional_fund_subsidy'
            });
        }

        res.json({
            success: true,
            hash: txHash,
            amountSent: userAmount,
            subsidy: fundSubsidizedAmount,
            subsidyMessage,
            businessName: merchant?.business_name || 'Usuario'
        });
    } catch (err) {
        if (err.code === 'WALLET_NOT_ACTIVE') {
            return res.status(400).json({ code: 'WALLET_NOT_ACTIVE', message: err.message });
        }
        console.error('Payment error:', err);
        res.status(500).json({ message: err.message || 'Error al procesar el pago' });
    }
});

export default router;
