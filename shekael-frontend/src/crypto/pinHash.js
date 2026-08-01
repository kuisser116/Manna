/**
 * Hash simple del PIN (solo para verificación contra server).
 * Compatible con PINs existentes en la BD.
 */
export function computePinHash(p) {
  let hash = 0;
  for (let i = 0; i < p.length; i++) {
    hash = ((hash << 5) - hash) + p.charCodeAt(i);
    hash |= 0;
  }
  return 'pin_' + hash;
}

export const pinHash = computePinHash;
