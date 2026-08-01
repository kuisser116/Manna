import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { decryptForUser, deriveChatKey, encryptWithChatKey, decryptWithChatKey } from '../services/crypto.service.js';

const router = Router({ strict: false });

/**
 * POST /chat/unlock — Descifrar chat keypair usando stellarSecretKey (inmutable)
 * 
 * Flujo:
 * 1. Verificar PIN
 * 2. Descifrar stellarSecretKey con userId
 * 3. Descifrar encrypted_private_key con stellarSecretKey
 * 4. Si estaba cifrado con PIN viejo, migrar a cifrado con stellarSecretKey
 * 5. Devolver privateKey al frontend para guardar en RAM
 */
router.post('/unlock', authMiddleware, async (req, res) => {
    try {
        const { pinHash } = req.body;
        if (!pinHash) {
            return res.status(400).json({ message: 'PIN hash requerido' });
        }

        const supabase = getDB();
        const { data: user, error } = await supabase
            .from('users')
            .select('id, pin_hash, encrypted_private_key, stellar_secret_key_encrypted, stellar_public_key')
            .eq('id', req.user.id)
            .maybeSingle();

        if (error) throw error;
        if (!user?.pin_hash) {
            return res.status(400).json({ message: 'No has configurado un PIN' });
        }
        if (user.pin_hash !== pinHash) {
            return res.status(401).json({ message: 'PIN incorrecto' });
        }

        // Descifrar stellarSecretKey con userId
        let stellarSecretKey;
        try {
            stellarSecretKey = decryptForUser(user.id, user.stellar_secret_key_encrypted);
        } catch (err) {
            console.error('[Chat Unlock] Error descifrando stellarSecretKey:', err.message);
            return res.status(500).json({ message: 'Error al acceder a las claves de chat' });
        }

        // Si no hay encrypted_private_key, el usuario necesita setup
        if (!user.encrypted_private_key) {
            return res.json({
                success: true,
                needsSetup: true,
                stellarSecretKey, // El frontend la necesita para generar nuevo keypair
                message: 'Configura tus llaves de chat'
            });
        }

        // Intentar descifrar encrypted_private_key con stellarSecretKey (nuevo método)
        let privateKey;
        let migrated = false;

        try {
            const key = deriveChatKey(stellarSecretKey);
            privateKey = decryptWithChatKey(user.encrypted_private_key, key);
        } catch (stellarErr) {
            // Fallback: intentar con PIN viejo (migración)
            // Esto solo funciona si el frontend envía el PIN, no solo el hash
            // Como no tenemos el PIN, la migración automática no es posible aquí
            console.warn('[Chat Unlock] No se pudo descifrar con stellarSecretKey:', stellarErr.message);
            return res.status(500).json({ 
                message: 'Error migrando llaves de chat. Contacta soporte.',
                needsMigration: true
            });
        }

        res.json({
            success: true,
            privateKey,
            publicKey: user.stellar_public_key,
            migrated
        });
    } catch (err) {
        console.error('[Chat Unlock] Error:', err.message);
        res.status(500).json({ message: 'Error al desbloquear chat' });
    }
});

/**
 * POST /chat/setup — Guardar chat keypair cifrado con stellarSecretKey
 */
router.post('/setup', authMiddleware, async (req, res) => {
    try {
        const { publicKey, encryptedPrivateKey, pinHash } = req.body;
        if (!publicKey || !encryptedPrivateKey || !pinHash) {
            return res.status(400).json({ message: 'publicKey, encryptedPrivateKey y pinHash requeridos' });
        }

        const supabase = getDB();
        
        // Verificar PIN
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('pin_hash')
            .eq('id', req.user.id)
            .maybeSingle();

        if (userError) throw userError;
        if (!user || user.pin_hash !== pinHash) {
            return res.status(401).json({ message: 'PIN incorrecto' });
        }

        // Guardar
        const { error } = await supabase
            .from('users')
            .update({
                encrypted_private_key: encryptedPrivateKey,
                public_key: publicKey // para compatibilidad
            })
            .eq('id', req.user.id);

        if (error) throw error;

        res.json({ success: true, message: 'Llaves de chat configuradas' });
    } catch (err) {
        console.error('[Chat Setup] Error:', err.message);
        res.status(500).json({ message: 'Error al guardar llaves de chat' });
    }
});

export default router;
