import getDB from '../database/db.js';
import { fundWithFriendbot, ensureTrustline } from './stellar.service.js';
import { decryptWithFallback } from './crypto.service.js';

/**
 * Validador Maestro de Misiones — DESHABILITADO
 * Ya no se dan bonos por completar misiones.
 */
export async function checkAndFundQuest(userId) {
    return false;
}

/**
 * Función de Reparación — DESHABILITADA
 * Ya no se fondean wallets automáticamente.
 * El usuario debe depositar XLM desde Bitso para activar su cuenta.
 */
export async function repairWallet(userId) {
    return { success: true, message: 'Wallet repair deshabilitado. El usuario debe depositar desde Bitso.' };
}
