/**
 * keyStore.js — Singleton para el keypair E2EE.
 * 
 * El keypair se guarda en RAM a nivel de módulo (NO en un React ref).
 * Así cualquier componente que importe keyStore obtiene la MISMA instancia.
 * 
 * LockScreen guarda aquí después de unlock/setup.
 * Chat lee desde aquí para cifrar/descifrar.
 * Lock/Logout limpia.
 */

let _keyPair = null;

export function setKeyPair(kp) {
  _keyPair = kp;
}

export function getKeyPair() {
  return _keyPair;
}

export function clearKeyPair() {
  _keyPair = null;
}

export default { setKeyPair, getKeyPair, clearKeyPair };
