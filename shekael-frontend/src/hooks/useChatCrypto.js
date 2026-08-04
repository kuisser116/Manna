import { useEffect, useRef, useCallback } from 'react';
import { updatePublicKey } from '../api/chats.api';
import { setPin } from '../api/auth.api';
import { setKeyPair, getKeyPair, clearKeyPair } from '../crypto/keyStore';

/**
 * Hook E2EE con ECDH (crypto_box_beforenm + crypto_secretbox).
 * - Chat keypair cifrada con LA CLAVE SECRETA STELLAR (inmutable, nunca cambia)
 * - El PIN solo sirve para verificar identidad con el backend
 * - Los mensajes NUNCA se pierden al cambiar PIN
 */
export function useChatCrypto() {
  const sodiumRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const mod = await import('libsodium-wrappers');
        await mod.ready;
        if (mounted) sodiumRef.current = mod.default;
      } catch (err) {
        console.warn('libsodium not available:', err);
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const handler = () => { clearKeyPair(); };
    window.addEventListener('Shekael:lock', handler);
    window.addEventListener('Shekael:logout', handler);
    return () => {
      window.removeEventListener('Shekael:lock', handler);
      window.removeEventListener('Shekael:logout', handler);
    };
  }, []);

  const ensureSodium = useCallback(async () => {
    if (sodiumRef.current) return sodiumRef.current;
    const mod = await import('libsodium-wrappers');
    await mod.ready;
    sodiumRef.current = mod.default;
    return sodiumRef.current;
  }, []);

  // Derivar shared secret ECDH
  const deriveSharedSecret = useCallback(async (theirPubB64) => {
    const sodium = await ensureSodium();
    const kp = getKeyPair();
    if (!kp) throw new Error('No keypair');
    return sodium.crypto_box_beforenm(
      sodium.from_base64(theirPubB64),
      sodium.from_base64(kp.privateKey)
    );
  }, [ensureSodium]);

  // Cifrar: shared secret ECDH + secretbox
  const encrypt = useCallback(async (plaintext, theirPubB64) => {
    const sodium = await ensureSodium();
    const ss = await deriveSharedSecret(theirPubB64);
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ct = sodium.crypto_secretbox_easy(sodium.from_string(plaintext), nonce, ss);
    return {
      encryptedContent: sodium.to_base64(ct),
      nonce: sodium.to_base64(nonce)
    };
  }, [deriveSharedSecret, ensureSodium]);

  // Descifrar: shared secret ECDH + secretbox_open
  const decrypt = useCallback(async (ciphertextB64, nonceB64, theirPubB64) => {
    const sodium = await ensureSodium();
    const ss = await deriveSharedSecret(theirPubB64);
    const pt = sodium.crypto_secretbox_open_easy(
      sodium.from_base64(ciphertextB64),
      sodium.from_base64(nonceB64),
      ss
    );
    return sodium.to_string(pt);
  }, [deriveSharedSecret, ensureSodium]);

  // Derivar chat encryption key desde stellarSecretKey (determinístico, inmutable)
  // Nunca cambia, así que los mensajes siempre son descifrables
  const deriveChatKey = useCallback(async (stellarSecretKey) => {
    const sodium = await ensureSodium();
    return sodium.crypto_generichash(
      sodium.crypto_secretbox_KEYBYTES,
      sodium.from_string(stellarSecretKey)
    );
  }, [ensureSodium]);

  // Unlock: descifrar chat private_key con stellarSecretKey (inmutable)
  const unlockWithStellarKey = useCallback(async (encryptedPrivateKeyB64, stellarSecretKey) => {
    const sodium = await ensureSodium();
    const key = await deriveChatKey(stellarSecretKey);
    const data = sodium.from_base64(encryptedPrivateKeyB64);
    const nonce = data.slice(0, sodium.crypto_secretbox_NONCEBYTES);
    const ct = data.slice(sodium.crypto_secretbox_NONCEBYTES);
    const plaintext = sodium.crypto_secretbox_open_easy(ct, nonce, key);
    const privateKey = sodium.to_string(plaintext);

    // Derivar public_key desde private key
    const privBytes = sodium.from_base64(privateKey);
    const pubBytes = sodium.crypto_scalarmult_base(privBytes);
    const publicKey = sodium.to_base64(pubBytes);

    updatePublicKey(publicKey).catch(() => {});
    setKeyPair({ privateKey, publicKey });
    return { privateKey, publicKey };
  }, [ensureSodium, deriveChatKey]);

  // Setup: generar keypair, cifrar con stellarSecretKey (inmutable), subir a servidor
  const generateAndSetupWithStellarKey = useCallback(async (stellarSecretKey, pinHash) => {
    const sodium = await ensureSodium();
    const kp = sodium.crypto_box_keypair();
    const publicKeyB64 = sodium.to_base64(kp.publicKey);
    const privateKeyB64 = sodium.to_base64(kp.privateKey);

    // Cifrar con stellarSecretKey (nunca cambia)
    const key = await deriveChatKey(stellarSecretKey);
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ct = sodium.crypto_secretbox_easy(sodium.from_string(privateKeyB64), nonce, key);
    const payload = new Uint8Array(nonce.length + ct.length);
    payload.set(nonce);
    payload.set(ct, nonce.length);

    await updatePublicKey(publicKeyB64);
    await setPin(pinHash, sodium.to_base64(payload));
    setKeyPair({ privateKey: privateKeyB64, publicKey: publicKeyB64 });
    return { privateKey: privateKeyB64, publicKey: publicKeyB64 };
  }, [ensureSodium, deriveChatKey]);

  const hasKeys = useCallback(async () => !!getKeyPair(), []);
  const clearKeyCache = useCallback(() => { clearKeyPair(); }, []);

  // Unlock (migración): descifrar private_key con PIN viejo (libsodium, formato anterior)
  const unlockWithPin = useCallback(async (encryptedPrivateKeyB64, pin) => {
    const sodium = await ensureSodium();
    // Validar que el valor sea base64 URL-safe válido ANTES de tocar libsodium.
    // Si no lo es (formato hex "iv:enc", base64 estándar con =/+/, null, etc.)
    // from_base64 lanzaría "Incomplete input" — error crudo que se mostraba en pantalla.
    if (typeof encryptedPrivateKeyB64 !== 'string' || encryptedPrivateKeyB64.length < 4 || !/^[A-Za-z0-9_-]+$/.test(encryptedPrivateKeyB64)) {
      throw new Error('Tus llaves de chat están en un formato no compatible. Ve a "Olvidé mi PIN" para recuperarlas.');
    }
    try {
      const key = sodium.crypto_generichash(
        sodium.crypto_secretbox_KEYBYTES,
        sodium.from_string(pin)
      );
      const data = sodium.from_base64(encryptedPrivateKeyB64);
      const nonce = data.slice(0, sodium.crypto_secretbox_NONCEBYTES);
      const ct = data.slice(sodium.crypto_secretbox_NONCEBYTES);
      const plaintext = sodium.crypto_secretbox_open_easy(ct, nonce, key);
      if (!plaintext) {
        // open_easy devuelve null si el MAC no coincide (PIN equivocado / llaves dañadas)
        throw new Error('No se pudieron descifrar tus llaves de chat con este PIN. Verifica tu PIN o usa "Olvidé mi PIN".');
      }
      return sodium.to_string(plaintext); // Devuelve privateKey en base64
    } catch (e) {
      // Cualquier error de libsodium se traduce a mensaje entendible (nunca errores crudos)
      if (e.message && (e.message.includes('formato no compatible') || e.message.includes('No se pudieron descifrar'))) {
        throw e;
      }
      throw new Error('No se pudieron descifrar tus llaves de chat. Usa "Olvidé mi PIN" para recuperarlas.');
    }
  }, [ensureSodium]);

  return {
    generateAndSetupWithStellarKey, unlockWithStellarKey, unlockWithPin,
    encrypt, decrypt, hasKeys, clearKeyCache, deriveSharedSecret,
    ready: !!sodiumRef.current
  };
}

export default useChatCrypto;
