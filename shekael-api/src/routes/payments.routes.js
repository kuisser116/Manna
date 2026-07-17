import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { sendPayment, getBalance } from '../services/stellar.service.js';
import { decryptWithFallback } from '../services/crypto.service.js';
import { createNotification } from '../services/notifications.service.js';

const router = Router({ strict: false });

// ─── Generar QR de pago para un comercio ──────────────────
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

    // El QR contiene: shekael://pay/{bizId}?dest={stellarKey}
    const qrData = `shekael://pay/${bizId}?dest=${biz.stellar_public_key}`;

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

    if (!businessId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Comercio y monto requeridos' });
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

    // Calcular descuento: 5%, tope $50 MXN
    const parsedAmount = parseFloat(amount);
    let discount = parsedAmount * 0.05;
    if (discount > 50) discount = 50;
    discount = Math.round(discount * 100) / 100;

    const finalAmount = parsedAmount - discount;

    // Verificar saldo
    const balance = await getBalance(payer.stellar_public_key);
    const mxneBalance = parseFloat(balance.mxne || '0');
    if (mxneBalance < finalAmount) {
      return res.status(400).json({ message: `Saldo insuficiente. Tienes MXNe ${mxneBalance.toFixed(2)}, necesitas ${finalAmount.toFixed(2)}` });
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

    // Enviar pago MXNe vía Stellar
    try {
      const txHash = await sendPayment({
        fromSecretKey: secretKey,
        toPublicKey: biz.stellar_public_key,
        amount: String(finalAmount),
        assetCode: 'USDC',
        memo: `Shekael:${payment.id.slice(0, 20)}`,
      });

      // Marcar como completado
      await supabase
        .from('payments')
        .update({ status: 'completed', stellar_tx_hash: txHash, completed_at: new Date().toISOString() })
        .eq('id', payment.id);

      // Notificar al comercio (owner)
      await createNotification({
        userId: biz.owner_id,
        type: 'payment_received',
        title: '¡Pago recibido!',
        message: `Has recibido USDC ${finalAmount.toFixed(2)} de parte de un cliente.`,
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
          ? `Pago exitoso. Descuento del 5% aplicado: ahorraste USDC ${discount.toFixed(2)}`
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
        id, amount_mxne, original_amount, discount_applied, status, stellar_tx_hash, created_at,
        to_business:to_business_id (id, name, avatar_url)
      `)
      .eq('from_user_id', userId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (sentErr) throw sentErr;

    const { data: received, error: recErr } = await supabase
      .from('payments')
      .select(`
        id, amount_mxne, original_amount, discount_applied, status, stellar_tx_hash, created_at,
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
    const { businessId, amount, bankAccountInfo } = req.body;

    if (!businessId || !amount || !bankAccountInfo) {
      return res.status(400).json({ message: 'Comercio, monto y datos bancarios requeridos' });
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

    // Verificar que el comercio tenga saldo suficiente
    if (!biz.stellar_public_key) return res.status(400).json({ message: 'El comercio no tiene billetera Stellar' });

    const balance = await getBalance(biz.stellar_public_key);
    const usdcBalance = parseFloat(balance.usdc || '0');
    if (usdcBalance < parseFloat(amount)) {
      return res.status(400).json({ message: `Saldo insuficiente. USDC disponible: ${usdcBalance.toFixed(2)}` });
    }

    // Registrar solicitud de retiro
    const { data: withdrawal, error: wdError } = await supabase
      .from('withdrawals')
      .insert({
        business_id: businessId,
        amount_usdc: parseFloat(amount),
        amount_mxn: parseFloat(amount), // tasa 1:1 USDC/MXN temporal
        bank_account_info: bankAccountInfo,
        status: 'pending',
      })
      .select()
      .single();

    if (wdError) throw wdError;

    // Notificar al admin (para procesar manualmente o automático vía Bitso)
    await createNotification({
      userId: userId,
      type: 'withdrawal_requested',
      title: 'Solicitud de retiro',
      message: `Has solicitado retirar USDC ${amount}. El equipo procesará tu solicitud.`,
      metadata: { withdrawalId: withdrawal.id, businessName: biz.name },
    });

    res.status(201).json({
      message: 'Solicitud de retiro registrada. El equipo procesará tu solicitud.',
      withdrawal: {
        id: withdrawal.id,
        amount: parseFloat(amount),
        status: 'pending',
        createdAt: withdrawal.created_at,
      },
    });
  } catch (err) {
    console.error('Withdrawal error:', err);
    res.status(500).json({ message: err.message || 'Error al solicitar retiro' });
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
