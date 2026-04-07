import getDB from '../database/db.js';
import { fundWithFriendbot, ensureTrustline } from './stellar.service.js';
import { decrypt } from './crypto.service.js';

/**
 * Validador Maestro de Misiones (Proof of Engagement)
 * Se ejecuta después de cada interacción: latido, like o follow.
 */
export async function checkAndFundQuest(userId) {
    const supabase = getDB();

    // Obtener estado fresco del usuario desde Supabase
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (!user || error) return false;

    // Si ya reclamó el bono, verificamos si su wallet está realmente activa en Stellar
    if (user.bonus_claimed) {
        // Opcional: Podríamos re-verificar trustlines aquí si detectamos problemas,
        // pero por ahora dejamos que el endpoint de reparación lo maneje.
        return false;
    }

    // Verificar si cumple todas las metas
    const achievedWatch = user.current_watch_seconds >= user.target_watch_seconds;
    const achievedLikes = user.current_likes >= user.target_likes;
    const achievedFollows = user.current_follows >= user.target_follows;

    if (achievedWatch && achievedLikes && achievedFollows) {
        // Disparar fondeo en Testnet (XLM)
        console.log(`🚀 Validador Maestro: El usuario ${user.email} completó sus misiones. Fondeando cuenta...`);
        try {
            const funded = await fundWithFriendbot(user.stellar_public_key);
            
            // Friendbot puede fallar por timeout o red. Si falla, no marcamos como reclamado
            // para que el sistema reintente en el próximo latido.
            if (!funded) {
                console.error(`❌ Fondeo fallido para ${user.email}. Se reintentará en el próximo evento.`);
                return false;
            }

            // Una vez fondeado (XLM), ya existe en la red y podemos crear la Trustline USDC/MXNe
            console.log(`🌾 Creando trustlines para ${user.email}...`);
            const secretKey = decrypt(user.stellar_secret_key_encrypted);
            const trustlineOk = await ensureTrustline(secretKey);

            if (!trustlineOk) {
                console.error(`❌ Falló la creación de trustlines para ${user.email}. Se reintentará en el próximo evento.`);
                return false;
            }

            // Marcar bono como reclamado en Supabase SOLO si la red Stellar confirmó las trustlines
            const { error: updateError } = await supabase
                .from('users')
                .update({ bonus_claimed: true })
                .eq('id', userId);

            if (updateError) {
                console.error('Error actualizando bonus_claimed:', updateError);
                return false;
            }

            console.log(`✅ Misiones completadas y cuenta activada para ${user.email}`);
            return true; // Acaba de ser fondeado y activado
        } catch (err) {
            console.error('Error en activación post-misión:', err.message);
            return false;
        }
    }

    return false; // Aún en misiones
}

/**
 * Función de Reparación Manual/Automática
 * Intenta fondear y crear trustlines incluso si bonus_claimed es true,
 * por si hubo errores previos en la red Stellar.
 */
export async function repairWallet(userId) {
    const supabase = getDB();
    const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    if (!user) return { success: false, message: 'Usuario no encontrado' };

    try {
        // 1. Intentar fondear (Friendbot ignorará si ya existe)
        await fundWithFriendbot(user.stellar_public_key);

        // 2. Forzar trustlines
        const secretKey = decrypt(user.stellar_secret_key_encrypted);
        const ok = await ensureTrustline(secretKey);

        if (ok) {
            // Asegurar que bonus_claimed esté en true si logramos activar la wallet
            await supabase.from('users').update({ bonus_claimed: true }).eq('id', userId);
            return { success: true, message: 'Wallet reparada y activa' };
        }
        return { success: false, message: 'No se pudo activar la wallet en Stellar' };
    } catch (err) {
        return { success: false, message: err.message };
    }
}
