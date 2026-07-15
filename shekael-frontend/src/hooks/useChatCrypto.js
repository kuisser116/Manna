import { useEffect, useRef, useCallback } from 'react';
import useStore from '../store';
import { updatePublicKey } from '../api/chats.api';
import { setPin } from '../api/auth.api';
import { setKeyPair, getKeyPair, clearKeyPair } from '../crypto/keyStore';

/**
 * Hook para cifrado E2EE con libsodium.
 *
 * ARQUITECTURA: Nada en IndexedDB. La llave privada viaja cifrada desde/hacia
 * Supabase, descifrada solo en RAM con el PIN del usuario.
 *
 * Flujo LockScreen (Setup): generar keypair → cifrar private_key con PIN →
 *   enviar encrypted_private_key + public_key + pin_hash al server.
 * Flujo LockScreen (Unlock): verificar PIN → server devuelve encrypted_private_key →
 *   descifrar con PIN → guardar en memoria (useRef).
 * Flujo Logout/Lock: limpiar ref → llave desaparece de RAM.
 */
export function useChatCrypto() {
  const user = useStore(s => s.user);
  const userId = user?.id;
  const sodiumRef = useRef(null);
  // keyPairRef ya no se usa — ahora se usa keyStore singleton
  // para que LockScreen y Chat compartan la misma llave

  // Inicializar libsodium — OJO: await import() devuelve { default: sodiumObj, ready }
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const mod = await import('libsodium-wrappers');
        await mod.ready;
        if (mounted) sodiumRef.current = mod.default; // ← usar .default!
      } catch (err) {
        console.warn('libsodium not available:', err);
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  // Escuchar eventos de lock/logout — limpiar cache del keyStore singleton
  useEffect(() => {
    const handler = () => { clearKeyPair(); };
    window.addEventListener('Shekael:lock', handler);
    window.addEventListener('Shekael:logout', handler);
    return () => {
      window.removeEventListener('Shekael:lock', handler);
      window.removeEventListener('Shekael:logout', handler);
    };
  }, []);

  // Asegurar sodium listo
  const ensureSodium = useCallback(async () => {
    if (sodiumRef.current) return sodiumRef.current;
    const mod = await import('libsodium-wrappers');
    await mod.ready;
    sodiumRef.current = mod.default; // ← .default!
    return sodiumRef.current;
  }, []);

  // Derivar llave simétrica a partir del PIN (SHA-256)
  const deriveKeyFromPin = useCallback(async (pin, sodium) => {
    const hash = sodium.crypto_generichash(sodium.crypto_secretbox_KEYBYTES, sodium.from_string(pin));
    return hash;
  }, []);

  // Cargar llave desde el keyStore singleton
  const loadKeyPair = useCallback(async () => {
    const kp = getKeyPair();
    if (kp) return kp;
    return null; // No hay llave → app bloqueada
  }, []);

  // Descifrar private_key recibida del servidor con el PIN y guardar en RAM
  const unlockWithPin = useCallback(async (encryptedPrivateKeyB64, pin) => {
    const sodium = await ensureSodium();
    const key = await deriveKeyFromPin(pin, sodium);

    const ciphertext = sodium.from_base64(encryptedPrivateKeyB64);
    const nonce = ciphertext.slice(0, sodium.crypto_secretbox_NONCEBYTES);
    const actualCipher = ciphertext.slice(sodium.crypto_secretbox_NONCEBYTES);

    const plaintext = sodium.crypto_secretbox_open_easy(actualCipher, nonce, key);
    const privateKey = sodium.to_string(plaintext);

    // Recuperar public_key desde el store (ya cargada del server en initAuth)
    const currentUser = useStore.getState().user;
    const publicKey = currentUser?.public_key || '';

    // Derivar shared secret a partir del private key para validar
    // (no guardamos el keypair típico, guardamos privateKey raw)
    const actualPrivateKey = sodium.from_base64(privateKey);
    
    setKeyPair({ privateKey, publicKey });
    return { privateKey, publicKey };
  }, [ensureSodium, deriveKeyFromPin]);

  // Generar keypair, cifrar private_key con PIN, subir todo al server
  const generateAndSetupKeypair = useCallback(async (pin, pinHash) => {
    const sodium = await ensureSodium();

    // Generar keypair Curve25519
    const kp = sodium.crypto_box_keypair();
    const publicKeyB64 = sodium.to_base64(kp.publicKey);
    const privateKeyB64 = sodium.to_base64(kp.privateKey);

    // Cifrar private_key con PIN
    const key = await deriveKeyFromPin(pin, sodium);
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(
      sodium.from_string(privateKeyB64),
      nonce,
      key
    );

    // Almacenar: nonce || ciphertext (para enviar como un solo campo)
    const payload = new Uint8Array(nonce.length + ciphertext.length);
    payload.set(nonce);
    payload.set(ciphertext, nonce.length);
    const encryptedPrivateKeyB64 = sodium.to_base64(payload);

    // Subir public_key al server (updatePublicKey)
    await updatePublicKey(publicKeyB64);

    // Subir PIN hash + encrypted private key
    await setPin(pinHash, encryptedPrivateKeyB64);

    // Cache en RAM (vía keyStore singleton)
    setKeyPair({ privateKey: privateKeyB64, publicKey: publicKeyB64 });
    return { privateKey: privateKeyB64, publicKey: publicKeyB64 };
  }, [ensureSodium, deriveKeyFromPin]);

  // Derivar secreto compartido (ECDH: myPriv + theirPub)
  const deriveSharedSecret = useCallback(async (theirPublicKeyBase64) => {
    const sodium = await ensureSodium();
    const kp = await loadKeyPair();
    if (!kp) throw new Error('App bloqueada — no hay llave en RAM');

    const ss = sodium.crypto_box_beforenm(
      sodium.from_base64(theirPublicKeyBase64),
      sodium.from_base64(kp.privateKey)
    );
    void('[CRYPTO] deriveSharedSecret theirPub[]:', theirPublicKeyBase64.substring(0,16), 'myPriv[]:', kp.privateKey.substring(0,16), 'ss[]:', sodium.to_base64(ss).substring(0,16));
    return ss;
  }, [loadKeyPair, ensureSodium]);

  // Cifrar mensaje
  const encrypt = useCallback(async (plaintext, theirPublicKeyBase64) => {
    const sodium = await ensureSodium();
    const sharedSecret = await deriveSharedSecret(theirPublicKeyBase64);
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(
      sodium.from_string(plaintext), nonce, sharedSecret
    );
    void('[CRYPTO] encrypt OK ss[:16]:', sodium.to_base64(sharedSecret).substring(0,16));
    return {
      encryptedContent: sodium.to_base64(ciphertext),
      nonce: sodium.to_base64(nonce)
    };
  }, [deriveSharedSecret, ensureSodium]);

  // Descifrar mensaje
  const decrypt = useCallback(async (encryptedContentBase64, nonceBase64, theirPublicKeyBase64) => {
    const sodium = await ensureSodium();
    const sharedSecret = await deriveSharedSecret(theirPublicKeyBase64);
    const plaintext = sodium.crypto_secretbox_open_easy(
      sodium.from_base64(encryptedContentBase64),
      sodium.from_base64(nonceBase64),
      sharedSecret
    );
    void('[CRYPTO] decrypt OK ss[:16]:', sodium.to_base64(sharedSecret).substring(0,16));
    return sodium.to_string(plaintext);
  }, [deriveSharedSecret, ensureSodium]);

  // Limpiar cache (lock/logout) — usa keyStore singleton
  const clearKeyCache = useCallback(() => {
    clearKeyPair();
  }, []);

  // Verificar si hay llave en RAM
  const hasKeys = useCallback(async () => {
    return !!getKeyPair();
  }, []);

  return {
    generateAndSetupKeypair,
    unlockWithPin,
    loadKeyPair,
    encrypt,
    decrypt,
    hasKeys,
    clearKeyCache,
    ready: !!sodiumRef.current
  };
}

export default useChatCrypto;
