import { useEffect, useRef, useCallback } from 'react';
import useStore from '../store';
import { updatePublicKey } from '../api/chats.api';
import { setPin } from '../api/auth.api';
import { setKeyPair, getKeyPair, clearKeyPair } from '../crypto/keyStore';

/**
 * Hook E2EE simplificado: keypair Curve25519 + crypto_box_seal.
 * - Private key cifrada con PIN y almacenada en servidor
 * - Public key siempre derivada desde private key (nunca confía en API)
 * - Cifrado con crypto_box_seal (no necesita nonces)
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

  // Unlock: descifrar private_key con PIN y cargar keypair
  const unlockWithPin = useCallback(async (encryptedPrivateKeyB64, pin) => {
    const sodium = await ensureSodium();
    const key = sodium.crypto_generichash(sodium.crypto_secretbox_KEYBYTES, sodium.from_string(pin));
    const data = sodium.from_base64(encryptedPrivateKeyB64);
    const nonce = data.slice(0, sodium.crypto_secretbox_NONCEBYTES);
    const ct = data.slice(sodium.crypto_secretbox_NONCEBYTES);
    const plaintext = sodium.crypto_secretbox_open_easy(ct, nonce, key);
    const privateKey = sodium.to_string(plaintext);

    // Derivar public_key desde private key — siempre correcta
    const privBytes = sodium.from_base64(privateKey);
    const pubBytes = sodium.crypto_scalarmult_base(privBytes);
    const publicKey = sodium.to_base64(pubBytes);

    // Actualizar API siempre (por si estaba desincronizada)
    updatePublicKey(publicKey).catch(() => {});

    setKeyPair({ privateKey, publicKey });
    return { privateKey, publicKey };
  }, [ensureSodium]);

  // Setup: generar keypair, cifrar con PIN, subir a servidor
  const generateAndSetupKeypair = useCallback(async (pin, pinHash) => {
    const sodium = await ensureSodium();
    const kp = sodium.crypto_box_keypair();
    const publicKeyB64 = sodium.to_base64(kp.publicKey);
    const privateKeyB64 = sodium.to_base64(kp.privateKey);

    const key = sodium.crypto_generichash(sodium.crypto_secretbox_KEYBYTES, sodium.from_string(pin));
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ct = sodium.crypto_secretbox_easy(sodium.from_string(privateKeyB64), nonce, key);
    const payload = new Uint8Array(nonce.length + ct.length);
    payload.set(nonce);
    payload.set(ct, nonce.length);

    await updatePublicKey(publicKeyB64);
    await setPin(pinHash, sodium.to_base64(payload));
    setKeyPair({ privateKey: privateKeyB64, publicKey: publicKeyB64 });
    return { privateKey: privateKeyB64, publicKey: publicKeyB64 };
  }, [ensureSodium]);

  // Cifrar con crypto_box_seal — solo necesita public_key del destinatario
  const encrypt = useCallback(async (plaintext, theirPubB64) => {
    const sodium = await ensureSodium();
    const ct = sodium.crypto_box_seal(sodium.from_string(plaintext), sodium.from_base64(theirPubB64));
    return sodium.to_base64(ct);
  }, [ensureSodium]);

  // Descifrar con crypto_box_seal_open — necesita keypair propio
  const decrypt = useCallback(async (ciphertextB64) => {
    const sodium = await ensureSodium();
    const kp = getKeyPair();
    if (!kp) throw new Error('No keypair');
    const pt = sodium.crypto_box_seal_open(
      sodium.from_base64(ciphertextB64),
      sodium.from_base64(kp.publicKey),
      sodium.from_base64(kp.privateKey)
    );
    return sodium.to_string(pt);
  }, [ensureSodium]);

  const hasKeys = useCallback(async () => !!getKeyPair(), []);

  return {
    generateAndSetupKeypair, unlockWithPin,
    encrypt, decrypt, hasKeys,
    ready: !!sodiumRef.current
  };
}

export default useChatCrypto;
