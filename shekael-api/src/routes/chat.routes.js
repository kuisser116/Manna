import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { decryptForUser, deriveChatKey, encryptWithChatKey, decryptWithChatKey } from '../services/crypto.service.js';

const router = Router({ strict: false });

/**
 * POST /chat/unlock — Descifrar chat keypair usando Stellar key (inmutable)
 * 
 * Flujo:
 * 1. Verificar PIN
 * 2. Descifrar stellarSecretKey con userId (backwards compatible)
 * 3. Derivar chatKey desde stellarSecretKey (determinístico)
 * 4. Descifrar encrypted_private_key con chatKey
 * 5. Devolver privateKey al frontend (solo RAM, nunca en disco)
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
                message: 'Configura tus llaves de chat'
            });
        }

        // Derivar chatKey desde stellarSecretKey (determinístico, inmutable)
        const chatKey = deriveChatKey(stellarSecretKey);

        // Descifrar encrypted_private_key con chatKey
        let privateKey;
        try {
            privateKey = decryptWithChatKey(user.encrypted_private_key, chatKey);
        } catch (err) {
            console.warn('[Chat Unlock] Error descifrando con chatKey:', err.message);
            // Fallback: puede ser formato viejo (cifrado con PIN). No hay fallback automático.
            return res.status(500).json({ 
                message: 'Error migrando llaves de chat. Contacta soporte.',
                needsMigration: true
            });
        }

        res.json({
            success: true,
            privateKey,
            publicKey: user.stellar_public_key,
        });
    } catch (err) {
        console.error('[Chat Unlock] Error:', err.message);
        res.status(500).json({ message: 'Error al desbloquear chat' });
    }
});

/**
 * POST /chat/setup — Guardar chat keypair cifrado con Stellar key (inmutable)
 * 
 * El frontend genera un nuevo keypair y envía la privateKey en texto plano
 * (sobre HTTPS). El backend la cifra con la Stellar key y la guarda.
 */
router.post('/setup', authMiddleware, async (req, res) => {
    try {
        const { publicKey, privateKey, pinHash } = req.body;
        if (!publicKey || !privateKey || !pinHash) {
            return res.status(400).json({ message: 'publicKey, privateKey y pinHash requeridos' });
        }

        const supabase = getDB();
        
        // Verificar PIN
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, pin_hash, stellar_secret_key_encrypted')
            .eq('id', req.user.id)
            .maybeSingle();

        if (userError) throw userError;
        if (!user || user.pin_hash !== pinHash) {
            return res.status(401).json({ message: 'PIN incorrecto' });
        }

        // Descifrar stellarSecretKey con userId
        let stellarSecretKey;
        try {
            stellarSecretKey = decryptForUser(user.id, user.stellar_secret_key_encrypted);
        } catch (err) {
            console.error('[Chat Setup] Error descifrando stellarSecretKey:', err.message);
            return res.status(500).json({ message: 'Error al acceder a las claves de chat' });
        }

        // Derivar chatKey y cifrar privateKey
        const chatKey = deriveChatKey(stellarSecretKey);
        const encryptedPrivateKey = encryptWithChatKey(privateKey, chatKey);

        // Guardar en DB
        const { error } = await supabase
            .from('users')
            .update({
                encrypted_private_key: encryptedPrivateKey,
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
