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
 * Función de Reparación — Verifica wallet del usuario
 * Si el usuario no tiene wallet, la repara pero NO usa Friendbot.
 * En mainnet, la wallet se activa manualmente o via fondeo de la maestra.
 */
export async function repairWallet(userId) {
    try {
        const supabase = getDB();

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, stellar_public_key, stellar_secret_key_encrypted')
            .eq('id', userId)
            .single();

        if (userError) throw userError;

        if (user.stellar_public_key && user.stellar_secret_key_encrypted) {
            return {
                success: true,
                message: 'Wallet ya existe',
                publicKey: user.stellar_public_key,
                alreadyExists: true
            };
        }

        // Crear nuevo keypair Stellar (off-chain, no fondeo automático)
        const keypair = createWallet();
        const publicKey = keypair.publicKey();
        const secretKey = keypair.secret();
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
            message: 'Wallet registrada (activación manual en mainnet)',
            publicKey: publicKey,
            alreadyExists: false
        };
    } catch (err) {
        console.error('repairWallet error:', err);
        return {
            success: false,
            message: `Error al reparar wallet: ${err.message}`
        };
    }
}
