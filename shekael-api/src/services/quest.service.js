import getDB from '../database/db.js';
import { createWallet, fundWithFriendbot, ensureTrustline } from './stellar.service.js';
import { encryptAll } from './crypto.service.js';

/**
 * Validador Maestro de Misiones — DESHABILITADO
 * Ya no se dan bonos por completar misiones.
 */
export async function checkAndFundQuest(userId) {
    return false;
}

/**
 * Función de Reparación — Crea/verifica wallet Stellar testnet
 * Si el usuario no tiene wallet, crea una nueva, la fondea con Friendbot
 * y establece la trustline de USDC.
 */
export async function repairWallet(userId) {
    try {
        const supabase = getDB();

        // Verificar si el usuario ya tiene wallet
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, stellar_public_key, stellar_secret_key_encrypted')
            .eq('id', userId)
            .single();

        if (userError) throw userError;

        // Si ya tiene wallet, solo verificar trustline
        if (user.stellar_public_key && user.stellar_secret_key_encrypted) {
            return {
                success: true,
                message: 'Wallet ya existe',
                publicKey: user.stellar_public_key,
                alreadyExists: true
            };
        }

        // Crear nuevo keypair Stellar
        const keypair = createWallet();
        const publicKey = keypair.publicKey();
        const secretKey = keypair.secret();

        // Fondear con Friendbot (testnet)
        await fundWithFriendbot(publicKey);

        // Crear trustline USDC
        await ensureTrustline(secretKey);

        // Encriptar y guardar en la base de datos
        const encryptedSecret = encryptAll(userId, secretKey, publicKey);

        const { error: updateError } = await supabase
            .from('users')
            .update({
                stellar_public_key: publicKey,
                stellar_secret_key_encrypted: encryptedSecret,
            })
            .eq('id', userId);

        if (updateError) throw updateError;

        return {
            success: true,
            message: 'Wallet creada exitosamente',
            publicKey: publicKey,
            alreadyExists: false
        };
    } catch (err) {
        console.error('repairWallet error:', err);
        return {
            success: false,
            message: `Error al crear wallet: ${err.message}`
        };
    }
}
