import { Router } from 'express';
import * as StellarSdk from '@stellar/stellar-sdk';
import getDB from '../database/db.js';
import jwt from 'jsonwebtoken';

const router = Router({ strict: false });

// POST /recovery/verify-key — Verificar clave privada para recuperar PIN
// Si la clave privada genera la misma dirección pública registrada, emite token temporal
router.post('/verify-key', async (req, res) => {
    try {
        const { secretKey, email } = req.body;
        if (!secretKey || !email) {
            return res.status(400).json({ message: 'Clave privada y email requeridos' });
        }

        // Derivar dirección pública desde la clave privada
        let derivedPublicKey;
        try {
            const kp = StellarSdk.Keypair.fromSecret(secretKey);
            derivedPublicKey = kp.publicKey();
        } catch {
            return res.status(400).json({ message: 'Clave privada inválida (formato incorrecto)' });
        }

        // Verificar que coincida con un usuario registrado
        const supabase = getDB();
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, stellar_public_key, display_name')
            .eq('email', email)
            .maybeSingle();

        if (!user || error) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        if (user.stellar_public_key !== derivedPublicKey) {
            return res.status(403).json({ message: 'La clave privada no coincide con esta cuenta' });
        }

        // Emitir token temporal de recuperación (válido 15 minutos, solo para resetear PIN)
        const recoveryToken = jwt.sign(
            { userId: user.id, purpose: 'pin-reset', email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        res.json({
            success: true,
            recoveryToken,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                publicKey: user.stellar_public_key
            },
            message: 'Clave verificada. Tienes 15 minutos para crear un nuevo PIN.'
        });
    } catch (err) {
        console.error('[Recovery] Error:', err.message);
        res.status(500).json({ message: 'Error al verificar clave' });
    }
});

// POST /recovery/reset-pin — Crear nuevo PIN después de verificación
router.post('/reset-pin', async (req, res) => {
    try {
        const { recoveryToken, pin } = req.body;
        if (!recoveryToken || !pin || pin.length !== 6) {
            return res.status(400).json({ message: 'Token de recuperación y PIN de 6 dígitos requeridos' });
        }

        // Verificar token
        let decoded;
        try {
            decoded = jwt.verify(recoveryToken, process.env.JWT_SECRET);
        } catch {
            return res.status(401).json({ message: 'Token inválido o expirado' });
        }

        if (decoded.purpose !== 'pin-reset') {
            return res.status(401).json({ message: 'Token no válido para esta operación' });
        }

        // Calcular hash del PIN (mismo algoritmo del frontend)
        function computePinHash(p) {
            let hash = 0;
            for (let i = 0; i < p.length; i++) {
                hash = ((hash << 5) - hash) + p.charCodeAt(i);
                hash |= 0;
            }
            return 'pin_' + hash;
        }

        const pinHash = computePinHash(pin);

        // Actualizar PIN (NO tocar encrypted_private_key — se migrará a cifrado con Stellar key)
        const supabase = getDB();
        const { error } = await supabase
            .from('users')
            .update({ pin_hash: pinHash })
            .eq('id', decoded.userId);

        if (error) throw error;

        res.json({
            success: true,
            message: 'PIN actualizado correctamente. Ya puedes iniciar sesión con tu nuevo PIN.'
        });
    } catch (err) {
        console.error('[Recovery] Reset error:', err.message);
        res.status(500).json({ message: 'Error al actualizar PIN' });
    }
});

export default router;
