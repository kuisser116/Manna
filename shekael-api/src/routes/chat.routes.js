import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { decryptForUser, deriveChatKey, encryptWithChatKey, decryptWithChatKey } from '../services/crypto.service.js';

const router = Router({ strict: false });

/**
 * POST /chat/unlock — Descifrar chat keypair
 * 
 * Intenta descifrar con Stellar key (nuevo método, inmutable).
 * Si falla, devuelve needsMigration=true para que el frontend haga la migración.
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

        // Si no hay encrypted_private_key, necesita setup
        if (!user.encrypted_private_key) {
            return res.json({
                success: true,
                needsSetup: true,
                message: 'Configura tus llaves de chat'
            });
        }

        // Descifrar stellarSecretKey con userId
        let stellarSecretKey;
        try {
            stellarSecretKey = decryptForUser(user.id, user.stellar_secret_key_encrypted);
        } catch (err) {
            console.error('[Chat Unlock] Error descifrando stellarSecretKey:', err.message);
            return res.status(500).json({ message: 'Error al acceder a las claves de chat' });
        }

        // Intentar descifrar con Stellar key (nuevo método)
        const chatKey = deriveChatKey(stellarSecretKey);
        let privateKey;
        try {
            privateKey = decryptWithChatKey(user.encrypted_private_key, chatKey);
        } catch (err) {
            // Falló con Stellar key → probablemente está cifrado con PIN viejo
            console.warn('[Chat Unlock] No se pudo descifrar con Stellar key, necesita migración:', err.message);
            return res.json({
                success: false,
                needsMigration: true,
                message: 'Tus llaves de chat necesitan migración. Ingresa tu PIN para migrar automáticamente.',
                encryptedPrivateKey: user.encrypted_private_key, // El frontend lo necesita para migrar
                publicKey: user.stellar_public_key
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
 * POST /chat/migrate — Migrar chat keypair de cifrado-PIN a cifrado-StellarKey
 * 
 * El frontend YA descifró la privateKey con PIN viejo (libsodium, solo frontend tiene).
 * Envía la privateKey descifrada + pinHash para verificación.
 * El backend recifra con Stellar key y guarda.
 */
router.post('/migrate', authMiddleware, async (req, res) => {
    try {
        const { pinHash, privateKey } = req.body;
        if (!pinHash || !privateKey) {
            return res.status(400).json({ message: 'pinHash y privateKey requeridos' });
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

        // Descifrar stellarSecretKey
        let stellarSecretKey;
        try {
            stellarSecretKey = decryptForUser(user.id, user.stellar_secret_key_encrypted);
        } catch (err) {
            console.error('[Chat Migrate] Error descifrando stellarSecretKey:', err.message);
            return res.status(500).json({ message: 'Error al acceder a las claves' });
        }

        // Recifrar con Stellar key (inmutable)
        const chatKey = deriveChatKey(stellarSecretKey);
        const newEncryptedPrivateKey = encryptWithChatKey(privateKey, chatKey);

        // Guardar
        const { error } = await supabase
            .from('users')
            .update({ encrypted_private_key: newEncryptedPrivateKey })
            .eq('id', req.user.id);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Llaves de chat migradas exitosamente. Tus mensajes están seguros.',
            privateKey,
        });
    } catch (err) {
        console.error('[Chat Migrate] Error:', err.message);
        res.status(500).json({ message: 'Error al migrar llaves de chat' });
    }
});

/**
 * POST /chat/setup — Guardar chat keypair cifrado con Stellar key (nuevo usuario)
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
        if (!user) {
            return res.status(401).json({ message: 'Usuario no encontrado' });
        }

        // PRIMER SETUP: si el usuario aún no tiene PIN (registro nuevo vía Google,
        // pin_hash NULL), se permite crear las llaves y se guarda el pin_hash junto
        // con ellas. Si ya tiene PIN, debe coincidir — protege contra sobreescritura
        // de llaves con un PIN equivocado.
        if (user.pin_hash && user.pin_hash !== pinHash) {
            return res.status(401).json({ message: 'PIN incorrecto' });
        }

        // Descifrar stellarSecretKey
        let stellarSecretKey;
        try {
            stellarSecretKey = decryptForUser(user.id, user.stellar_secret_key_encrypted);
        } catch (err) {
            console.error('[Chat Setup] Error descifrando stellarSecretKey:', err.message);
            return res.status(500).json({ message: 'Error al acceder a las claves de chat' });
        }

        // Cifrar con Stellar key
        const chatKey = deriveChatKey(stellarSecretKey);
        const encryptedPrivateKey = encryptWithChatKey(privateKey, chatKey);

        // Guardar (primer setup: también persiste el pin_hash)
        const { error } = await supabase
            .from('users')
            .update({
                encrypted_private_key: encryptedPrivateKey,
                pin_hash: pinHash,
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
