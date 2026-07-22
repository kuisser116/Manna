import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import * as StellarSdk from '@stellar/stellar-sdk';
import { sendPayment, getBalance } from '../services/stellar.service.js';
import { decryptWithFallback } from '../services/crypto.service.js';
import { createNotification } from '../services/notifications.service.js';

const router = Router({ strict: false });

// ─── Generar QR de pago para un comercio ──────────────────
// GET /business/:businessId/qr?amount=10.00 — amount es opcional, lo pone el comercio
router.get('/business/:businessId/qr', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const bizId = req.params.businessId;

    const { data: biz, error } = await supabase
      .from('businesses')
      .select('id, name, stellar_public_key, qr_code')
      .eq('id', bizId)
      .single();

    if (error || !biz) return res.status(404).json({ message: 'Comercio no encontrado' });
    if (!biz.stellar_public_key) return res.status(400).json({ message: 'El comercio no tiene llave Stellar configurada' });

    // El QR contiene el monto si el comercio lo especifica (?amount=X)
    const amount = req.query.amount ? parseFloat(req.query.amount) : null;
    const qrData = amount
      ? `shekael://pay/${bizId}?dest=${biz.stellar_public_key}&amount=${amount}`
      : `shekael://pay/${bizId}?dest=${biz.stellar_public_key}`;

    res.json({
      businessId: biz.id,
      businessName: biz.name,
      stellarPublicKey: biz.stellar_public_key,
      qrData,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`,
    });
  } catch (err) {
    console.error('Error generating QR:', err);
    res.status(500).json({ message: 'Error al generar código QR' });
  }
});

// ─── Procesar pago de usuario a comercio ─────────────────
router.post('/pay', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const { businessId, amount } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!businessId || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Monto inválido' });
    }

    // Límite por transacción
    if (parsedAmount > 100) {
      return res.status(400).json({ message: 'Monto máximo por pago: $100 USD' });
    }

    // Obtener datos del comercio
    const { data: biz, error: bizError } = await supabase
      .from('businesses')
      .select('id, name, owner_id, stellar_public_key')
      .eq('id', businessId)
      .eq('is_active', true)
      .single();

    if (bizError || !biz) return res.status(404).json({ message: 'Comercio no encontrado' });

    // No pagarte a ti mismo
    if (biz.owner_id === userId) {
      return res.status(400).json({ message: 'No puedes pagarte a ti mismo' });
    }

    // Obtener datos del pagador
    const { data: payer, error: payerError } = await supabase
      .from('users')
      .select('id, stellar_public_key, stellar_secret_key_encrypted')
      .eq('id', userId)
      .single();

    if (payerError || !payer) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (!payer.stellar_public_key) return res.status(400).json({ message: 'No tienes billetera Stellar' });

    // Calcular descuento: 5%, tope $2.70 USDC (~$50 MXN)
    let discount = parsedAmount * 0.05;
    if (discount > 2.70) discount = 2.70;
    discount = Math.round(discount * 100) / 100;

    const finalAmount = parsedAmount - discount;

    // Verificar saldo
    const balance = await getBalance(payer.stellar_public_key);
    const usdcBalance = parseFloat(balance.usdc || '0');
    if (usdcBalance < finalAmount) {
      return res.status(400).json({ message: `Saldo insuficiente. Tienes ${usdcBalance.toFixed(2)} USDC, necesitas ${finalAmount.toFixed(2)} USDC.` });
    }

    // Desencriptar clave secreta del pagador
    let secretKey;
    try {
      secretKey = decryptWithFallback(userId, payer.stellar_public_key, payer.stellar_secret_key_encrypted);
    } catch {
      return res.status(500).json({ message: 'Error al desencriptar clave Stellar' });
    }

    // Crear registro de pago pendiente
    const { data: payment, error: payError } = await supabase
      .from('payments')
      .insert({
        from_user_id: userId,
        to_business_id: businessId,
        amount_usdc: finalAmount,
        original_amount: parsedAmount,
        discount_applied: discount,
        status: 'pending',
        memo: `Pago a ${biz.name}`,
      })
      .select()
      .single();

    if (payError) throw payError;

    // Enviar pago USDC vía Stellar
    try {
      // 1. Cliente paga el monto con descuento
      await sendPayment({
        fromSecretKey: secretKey,
        toPublicKey: biz.stellar_public_key,
        amount: String(finalAmount),
        memo: `Shekael:${payment.id.slice(0, 20)}`,
      });

      // 2. Kuki paga el descuento al comercio (5% desde la wallet maestra)
      let discountTxHash = null;
      const bonusWalletSecret = process.env.MANNA_DEV_WALLET_SECRET;
      if (discount > 0 && bonusWalletSecret) {
        try {
          discountTxHash = await sendPayment({
            fromSecretKey: bonusWalletSecret,
            toPublicKey: biz.stellar_public_key,
            amount: String(discount.toFixed(7)),
            memo: `Shekael:discount:${payment.id.slice(0, 16)}`,
          });
        } catch (bonusErr) {
          console.error('Error al enviar descuento:', bonusErr.message);
          // No bloqueamos si el descuento falla
        }
      }

      // Marcar como completado
      await supabase
        .from('payments')
        .update({
          status: 'completed',
          stellar_tx_hash: discountTxHash || 'direct',
          completed_at: new Date().toISOString()
        })
        .eq('id', payment.id);

      // Notificar al comercio (owner)
      await createNotification({
        userId: biz.owner_id,
        type: 'payment_received',
        title: '¡Pago recibido!',
        message: `Has recibido ${finalAmount.toFixed(2)} de parte de un cliente.`,
        metadata: { paymentId: payment.id, businessName: biz.name },
      });

      res.json({
        status: 'completed',
        paymentId: payment.id,
        amount: finalAmount,
        originalAmount: parsedAmount,
        discountApplied: discount,
        stellarTxHash: txHash,
        message: discount > 0
          ? 'Pago exitoso. Descuento del 5% aplicado.'
          : 'Pago exitoso',
      });
    } catch (stellarErr) {
      // Marcar como fallido
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('id', payment.id);

      throw stellarErr;
    }
  } catch (err) {
    console.error('Payment error:', err);
    res.status(500).json({ message: err.message || 'Error al procesar el pago' });
  }
});

// ─── Historial de pagos del usuario ─────────────────────
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const { data: sent, error: sentErr } = await supabase
      .from('payments')
      .select(`
        id, amount_usdc, original_amount, discount_applied, status, stellar_tx_hash, created_at,
        to_business:to_business_id (id, name, avatar_url)
      `)
      .eq('from_user_id', userId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (sentErr) throw sentErr;

    const { data: received, error: recErr } = await supabase
      .from('payments')
      .select(`
        id, amount_usdc, original_amount, discount_applied, status, stellar_tx_hash, created_at,
        from_user:from_user_id (id, display_name, avatar_url)
      `)
      .eq('to_business_id', userId)  // business owner gets payments as "received" for their businesses
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (recErr) throw recErr;

    res.json({ sent: sent || [], received: received || [] });
  } catch (err) {
    console.error('Payment history error:', err);
    res.status(500).json({ message: 'Error al obtener historial' });
  }
});

// ─── Solicitar retiro (comercio) ─────────────────────────
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const { businessId, amount, destinationAddress } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!businessId || isNaN(parsedAmount) || parsedAmount <= 0 || !destinationAddress) {
      return res.status(400).json({ message: 'Monto inválido o dirección de Bitso requerida' });
    }

    // Validar dirección Stellar
    try {
      StellarSdk.Keypair.fromPublicKey(destinationAddress);
    } catch {
      return res.status(400).json({ message: 'Dirección Stellar inválida. Usa la dirección de depósito USDC de tu Bitso.' });
    }

    // Límite por retiro
    if (parsedAmount > 500) {
      return res.status(400).json({ message: 'Monto máximo por retiro: $500 USD' });
    }

    // Verificar propiedad del comercio
    const { data: biz, error: bizError } = await supabase
      .from('businesses')
      .select('id, name, owner_id, stellar_public_key')
      .eq('id', businessId)
      .eq('is_active', true)
      .single();

    if (bizError || !biz) return res.status(404).json({ message: 'Comercio no encontrado' });
    if (biz.owner_id !== userId) return res.status(403).json({ message: 'No eres el dueño de este comercio' });

    if (!biz.stellar_public_key) return res.status(400).json({ message: 'El comercio no tiene billetera Stellar' });

    // Verificar saldo
    const balance = await getBalance(biz.stellar_public_key);
    const usdcBalance = parseFloat(balance.usdc || '0');
    if (usdcBalance < parsedAmount) {
      return res.status(400).json({ message: `Saldo insuficiente. saldo disponible: ${usdcBalance.toFixed(2)}` });
    }

    // Desencriptar clave y enviar directo a Bitso
    const { data: owner } = await supabase
      .from('users')
      .select('stellar_secret_key_encrypted')
      .eq('id', userId)
      .single();

    if (!owner?.stellar_secret_key_encrypted) {
      return res.status(400).json({ message: 'No tienes clave secreta configurada' });
    }

    const secretKey = decryptWithFallback(userId, biz.stellar_public_key, owner.stellar_secret_key_encrypted);
    const txHash = await sendPayment({
      fromSecretKey: secretKey,
      toPublicKey: destinationAddress,
      amount: String(parsedAmount),
      memo: `Shekael:wd:${businessId.slice(0, 10)}`,
    });

    // Registrar retiro completado
    await supabase.from('withdrawals').insert({
      business_id: businessId,
      amount_usdc: parsedAmount,
      destination_address: destinationAddress,
      stellar_tx_hash: txHash,
      status: 'completed',
    });

    res.json({
      success: true,
      txHash,
      message: `USDC ${parsedAmount.toFixed(2)} enviado a tu Bitso. Llega en ~5 segundos.`,
    });
  } catch (err) {
    console.error('Withdrawal error:', err);
    res.status(500).json({ message: err.message || 'Error al enviar a Bitso' });
  }
});

// ─── Historial de retiros (comercio) ────────────────────
router.get('/withdrawals/:businessId', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const bizId = req.params.businessId;

    // Verificar propiedad
    const { data: biz } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', bizId)
      .single();

    if (!biz || biz.owner_id !== userId) return res.status(403).json({ message: 'No tienes acceso' });

    const { data: withdrawals, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('business_id', bizId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ withdrawals: withdrawals || [] });
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener retiros' });
  }
});

export default router;
