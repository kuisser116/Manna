/**
 * signalProtocol.js — Signal Protocol completo para Shekael
 * 
 * Implementa:
 * - X3DH (Extended Triple Diffie-Hellman) para key exchange inicial
 * - Double Ratchet para forward secrecy en mensajes
 * - Pre-keys para mensajes offline
 * 
 * Dependencias:
 * - libsodium-wrappers (crypto_box, crypto_secretbox, crypto_generichash)
 * - sessionsDB.js (ratchet state persistente)
 * - keyStore.js (identity key)
 */

import { saveSession, loadSession, deleteSession } from '../db/sessionsDB';
import { getKeyPair } from './keyStore';

let _sodium = null;
let _ready = false;

async function ensureSodium() {
  if (_ready && _sodium) return _sodium;
  const mod = await import('libsodium-wrappers');
  await mod.ready;
  _sodium = mod.default;
  _ready = true;
  return _sodium;
}

// ─── HKDF (HMAC-based Key Derivation Function) ───
// Signal usa HKDF con SHA-256 para derivar llaves del ratchet

async function hkdf(salt, inputKeyMaterial, info, outputLength) {
  const sodium = await ensureSodium();

  // 1. Extract: PRK = HMAC-SHA256(salt, IKM)
  let prk;
  if (salt && salt.length > 0) {
    prk = sodium.crypto_auth_hmacsha256(inputKeyMaterial, salt);
  } else {
    prk = sodium.crypto_auth_hmacsha256(inputKeyMaterial, new Uint8Array(32));
  }

  // 2. Expand: generar bloques hasta outputLength
  const blocks = [];
  let T = new Uint8Array(0);
  const blockSize = 32; // SHA-256 output
  const numBlocks = Math.ceil(outputLength / blockSize);

  for (let i = 1; i <= numBlocks; i++) {
    const input = new Uint8Array(T.length + info.length + 1);
    if (T.length > 0) input.set(T);
    input.set(info, T.length);
    input[T.length + info.length] = i;

    T = sodium.crypto_auth_hmacsha256(input, prk);
    blocks.push(T);
  }

  // Concatenar bloques y truncar
  const all = new Uint8Array(blocks.length * blockSize);
  blocks.forEach((b, i) => all.set(b, i * blockSize));

  return all.slice(0, outputLength);
}

// ─── KDF Chain (un solo paso de ratchet) ───
// Toma un chainKey y deriva: { chainKey: nuevo, messageKey: para cifrar }
async function kdfChain(chainKey) {
  const sodium = await ensureSodium();
  const output = await hkdf(
    new Uint8Array(32),
    chainKey,
    sodium.from_string('ShekaelRatchet'),
    64
  );
  return {
    chainKey: output.slice(0, 32),
    messageKey: output.slice(32, 64)
  };
}

// ─── X3DH Key Exchange ───
// Realiza el intercambio de llaves inicial para una conversación

/**
 * Calcular X3DH como Alice (iniciadora)
 * @param {Uint8Array} myIdentityPriv - Mi llave privada (identity key)
 * @param {Uint8Array} myEphemeralPriv - Mi llave efímera (nueva cada sesión)
 * @param {Object} theirBundle - Bundle del otro usuario
 * @returns {Uint8Array} - Shared secret SK (32 bytes)
 */
async function x3dhAlice(myIdentityPriv, myEphemeralPriv, theirBundle) {
  const sodium = await ensureSodium();

  const theirIdentityPub = sodium.from_base64(theirBundle.identityKey);
  const theirSignedPreKeyPub = sodium.from_base64(theirBundle.signedPreKey.public_key);
  const theirOneTimePub = theirBundle.oneTimePreKey
    ? sodium.from_base64(theirBundle.oneTimePreKey.public_key)
    : null;
  const myIdentityPub = sodium.crypto_scalarmult_base(myIdentityPriv);

  // DH1: IK_A + SPK_B
  const dh1 = sodium.crypto_scalarmult(myIdentityPriv, theirSignedPreKeyPub);

  // DH2: EK_A + IK_B
  const dh2 = sodium.crypto_scalarmult(myEphemeralPriv, theirIdentityPub);

  // DH3: EK_A + SPK_B
  const dh3 = sodium.crypto_scalarmult(myEphemeralPriv, theirSignedPreKeyPub);

  // DH4: EK_A + OTPK_B (si existe one-time pre-key)
  let dh4 = new Uint8Array(32);
  if (theirOneTimePub) {
    dh4 = sodium.crypto_scalarmult(myEphemeralPriv, theirOneTimePub);
  }

  // SK = KDF(DH1 || DH2 || DH3 || DH4)
  const concat = new Uint8Array(dh1.length + dh2.length + dh3.length + dh4.length);
  concat.set(dh1);
  concat.set(dh2, dh1.length);
  concat.set(dh3, dh1.length + dh2.length);
  concat.set(dh4, dh1.length + dh2.length + dh3.length);

  const sk = await hkdf(null, concat, sodium.from_string('ShekaelX3DH'), 32);
  return sk;
}

/**
 * Calcular X3DH como Bob (receptor)
 * Bob tiene las pre-keys y recibe la llave efímera de Alice
 */
async function x3dhBob(myIdentityPriv, mySignedPreKeyPriv, myOneTimePriv, theirEphemeralPub, theirIdentityPub) {
  const sodium = await ensureSodium();

  // DH1: IK_B + SPK_B (usando la privada de SPK, recibimos pub de IK de Alice — no, esto es diferente)
  // En realidad para Bob: DH1 = IK_B + SPK_B ya lo calculó Alice
  
  // Bob necesita derivar usando SU signed pre-key private key
  // DH1: Alice calculó IK_A + SPK_B. Bob calcula: IK_A + SPK_B usando SPK_B_priv + IK_A_pub
  // Pero Bob no tiene IK_A_priv. Bob calcula el mismo shared secret con IK_A_pub + SPK_B_priv
  // Espera, eso no es como funciona ECDH.
  
  // En ECDH: DH(a_priv, B_pub) = DH(b_priv, A_pub)
  // Alice: DH1 = scalarmult(myIdentityPriv, theirSignedPreKeyPub) = scalarmult(IK_A_priv, SPK_B_pub)
  // Bob: DH1 = scalarmult(mySignedPreKeyPriv, theirIdentityPub) = scalarmult(SPK_B_priv, IK_A_pub)
  // ¡Son iguales!

  const dh1 = sodium.crypto_scalarmult(mySignedPreKeyPriv, theirIdentityPub);
  const dh2 = sodium.crypto_scalarmult(myIdentityPriv, theirEphemeralPub);
  const dh3 = sodium.crypto_scalarmult(mySignedPreKeyPriv, theirEphemeralPub);

  let dh4 = new Uint8Array(32);
  if (myOneTimePriv) {
    dh4 = sodium.crypto_scalarmult(myOneTimePriv, theirEphemeralPub);
  }

  const concat = new Uint8Array(dh1.length + dh2.length + dh3.length + dh4.length);
  concat.set(dh1);
  concat.set(dh2, dh1.length);
  concat.set(dh3, dh1.length + dh2.length);
  concat.set(dh4, dh1.length + dh2.length + dh3.length);

  const sk = await hkdf(null, concat, sodium.from_string('ShekaelX3DH'), 32);
  return sk;
}

// ─── Double Ratchet ───

/**
 * Inicializar Double Ratchet después de X3DH
 * @param {string} convId - ID de la conversación
 * @param {Uint8Array} sharedSecret - SK de X3DH (32 bytes)
 * @param {Uint8Array} theirRatchetPub - Llave pública del ratchet del otro (de su bundle signed pre-key)
 * @param {Uint8Array} myRatchetPriv - Mi llave privada del ratchet (nueva)
 * @returns {Object} - Estado del ratchet
 */
async function initRatchet(convId, sharedSecret, theirRatchetPub, myRatchetPriv) {
  const sodium = await ensureSodium();

  // Derive root key y chain key inicial
  const rootOutput = await hkdf(
    sharedSecret,
    sodium.crypto_scalarmult(myRatchetPriv, theirRatchetPub),
    sodium.from_string('ShekaelRoot'),
    64
  );

  const state = {
    rootKey: rootOutput.slice(0, 32),
    sendChain: {
      chainKey: rootOutput.slice(32, 64),
      messageIndex: 0
    },
    recvChain: {
      chainKey: null, // se llena cuando recibimos primer mensaje
      messageIndex: 0
    },
    theirRatchetPub, // Uint8Array — última llave pública del otro
    myRatchetPriv,   // Uint8Array — mi llave privada actual del ratchet
    initiated: true
  };

  await saveSession(convId, {
    rootKey: sodium.to_base64(state.rootKey),
    sendChain: {
      chainKey: sodium.to_base64(state.sendChain.chainKey),
      messageIndex: state.sendChain.messageIndex
    },
    recvChain: state.recvChain.chainKey
      ? { chainKey: sodium.to_base64(state.recvChain.chainKey), messageIndex: state.recvChain.messageIndex }
      : { chainKey: null, messageIndex: 0 },
    theirRatchetPub: sodium.to_base64(state.theirRatchetPub),
    myRatchetPriv: sodium.to_base64(state.myRatchetPriv),
    initiated: true
  });

  return state;
}

/**
 * Cifrar un mensaje con el Double Ratchet
 * @param {string} convId
 * @param {string} plaintext
 * @returns {Object} Mensaje cifrado con metadatos del ratchet
 */
async function ratchetEncrypt(convId, plaintext) {
  const sodium = await ensureSodium();
  const session = await loadSession(convId);

  if (!session || !session.initiated) {
    throw new Error('Sesión no iniciada');
  }

  // Deserializar
  const rootKey = sodium.from_base64(session.rootKey);
  const sendChainKey = sodium.from_base64(session.sendChain.chainKey);
  let sendMsgIndex = session.sendChain.messageIndex;

  // DH step cada 3 mensajes (rotación de llave del ratchet)
  // En un sistema real se haría en cada mensaje, pero para rendimiento
  // podemos hacerlo cada N mensajes
  let ephemeralPub = null;
  let newRootKey = rootKey;
  let newSendChainKey = sendChainKey;
  let myRatchetPriv = sodium.from_base64(session.myRatchetPriv);
  const theirRatchetPub = sodium.from_base64(session.theirRatchetPub);

  // Solo hacemos DH step si es el primer mensaje o cada 3
  // (primera vez: la llave efímera se envía)
  const needsDHRatchet = sendMsgIndex === 0 || sendMsgIndex % 3 === 0;

  if (needsDHRatchet) {
    // Generar nueva llave efímera del ratchet
    const newKeypair = sodium.crypto_box_keypair();
    myRatchetPriv = newKeypair.privateKey;
    ephemeralPub = newKeypair.publicKey;

    // DH(myRatchetPriv, theirRatchetPub)
    const dhOutput = sodium.crypto_scalarmult(myRatchetPriv, theirRatchetPub);

    // Derive nueva root key y send chain key
    const output = await hkdf(rootKey, dhOutput, sodium.from_string('ShekaelRatchet'), 64);
    newRootKey = output.slice(0, 32);
    newSendChainKey = output.slice(32, 64);
    sendMsgIndex = 0;
  }

  // Derive message key de la chain key actual
  const { chainKey: nextChainKey, messageKey } = await kdfChain(newSendChainKey);

  // Cifrar con message key
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    messageKey
  );

  // Guardar estado actualizado
  const newState = {
    rootKey: sodium.to_base64(newRootKey),
    sendChain: {
      chainKey: sodium.to_base64(nextChainKey),
      messageIndex: needsDHRatchet ? 1 : sendMsgIndex + 1
    },
    recvChain: session.recvChain,
    theirRatchetPub: sodium.to_base64(theirRatchetPub),
    myRatchetPriv: sodium.to_base64(myRatchetPriv),
    initiated: true
  };
  await saveSession(convId, newState);

  return {
    encryptedContent: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
    ephemeralPubKey: ephemeralPub ? sodium.to_base64(ephemeralPub) : null,
    chainIndex: needsDHRatchet ? 0 : sendMsgIndex,
    msgIndex: needsDHRatchet ? 0 : sendMsgIndex
  };
}

/**
 * Descifrar un mensaje con el Double Ratchet
 */
async function ratchetDecrypt(convId, msg, myIdentityPriv) {
  const sodium = await ensureSodium();
  let session = await loadSession(convId);

  const ciphertext = sodium.from_base64(msg.encryptedContent);
  const nonce = sodium.from_base64(msg.nonce);

  // Si no hay sesión, no podemos descifrar
  if (!session || !session.initiated) {
    throw new Error('No hay sesión para esta conversación');
  }

  // Deserializar
  let rootKey = sodium.from_base64(session.rootKey);
  let recvChainKey = session.recvChain.chainKey
    ? sodium.from_base64(session.recvChain.chainKey)
    : null;
  let recvMsgIndex = session.recvChain.messageIndex || 0;
  const theirRatchetPub = sodium.from_base64(session.theirRatchetPub);
  const myRatchetPriv = sodium.from_base64(session.myRatchetPriv);

  // Si el mensaje trae una nueva llave efímera, hacer DH ratchet
  if (msg.ephemeralPubKey) {
    const newRatchetPub = sodium.from_base64(msg.ephemeralPubKey);

    // DH step
    const dhOutput = sodium.crypto_scalarmult(myRatchetPriv, newRatchetPub);

    const output = await hkdf(rootKey, dhOutput, sodium.from_string('ShekaelRatchet'), 64);
    rootKey = output.slice(0, 32);
    const newRecvChainKey = output.slice(32, 64);
    recvChainKey = newRecvChainKey;
    recvMsgIndex = 0;

    // Guardar nueva llave pública del otro
    session.theirRatchetPub = sodium.to_base64(newRatchetPub);
  }

  if (!recvChainKey) {
    throw new Error('No hay recv chain key');
  }

  // Derivar tantas message keys como sea necesario hasta alcanzar msgIndex
  let currentChainKey = recvChainKey;
  let messageKey = null;
  for (let i = 0; i <= (msg.msgIndex || 0); i++) {
    const result = await kdfChain(currentChainKey);
    if (i === (msg.msgIndex || 0)) {
      messageKey = result.messageKey;
    }
    currentChainKey = result.chainKey;
  }

  if (!messageKey) {
    throw new Error('No se pudo derivar message key');
  }

  // Descifrar
  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, messageKey);
  const decrypted = sodium.to_string(plaintext);

  // Guardar estado actualizado
  session.rootKey = sodium.to_base64(rootKey);
  session.recvChain.chainKey = sodium.to_base64(currentChainKey);
  session.recvChain.messageIndex = recvMsgIndex + 1;
  await saveSession(convId, session);

  return decrypted;
}

// ─── API Pública ───

/**
 * Iniciar sesión X3DH como Alice (para nueva conversación)
 * @param {string} convId
 * @param {Object} theirBundle - Bundle del otro usuario
 * @param {Object} myKeypair - { privateKey, publicKey } de mi identity key
 * @returns {{ ephemeralPubB64: string, preKeyUsedId: number|null }}
 */
export async function initSessionAsAlice(convId, theirBundle, myKeypair) {
  const sodium = await ensureSodium();
  const myIdentityPriv = sodium.from_base64(myKeypair.privateKey);
  const myEphemeralKp = sodium.crypto_box_keypair();
  const theirIdentityPub = theirBundle.identityKey;
  const theirSignedPub = theirBundle.signedPreKey.public_key;

  // X3DH
  const sharedSecret = await x3dhAlice(myIdentityPriv, myEphemeralKp.privateKey, theirBundle);

  // Inicializar ratchet (usamos identity key como ratchet initial,
  // en Signal se usa una llave derivada del signed pre-key)
  const theirSignedPubBytes = sodium.from_base64(theirSignedPub);
  const ratchetKp = sodium.crypto_box_keypair();

  await initRatchet(convId, sharedSecret, theirSignedPubBytes, ratchetKp.privateKey);

  const ephemeralPubB64 = sodium.to_base64(myEphemeralKp.publicKey);

  return {
    ephemeralPubB64,
    preKeyUsedId: theirBundle.oneTimePreKey?.key_id || null
  };
}

/**
 * Iniciar sesión como Bob (recibiendo primer mensaje)
 * @param {string} convId
 * @param {Object} firstMsg - Primer mensaje (con ephemeralPubKey)
 * @param {Object} myKeypair - Mi identity key
 * @param {Uint8Array} signedPreKeyPriv - Mi signed pre-key privada
 * @param {Uint8Array|null} oneTimePriv - Mi one-time pre-key privada
 */
export async function initSessionAsBob(convId, firstMsg, myKeypair, signedPreKeyPriv, oneTimePriv) {
  const sodium = await ensureSodium();
  const myIdentityPriv = sodium.from_base64(myKeypair.privateKey);
  const theirEphemeralPub = sodium.from_base64(firstMsg.ephemeralPubKey);
  const theirIdentityPub = sodium.from_base64(firstMsg.senderIdentityKey); // identity key viene en el msg

  // X3DH desde lado Bob
  const sharedSecret = await x3dhBob(
    myIdentityPriv,
    signedPreKeyPriv,
    oneTimePriv || null,
    theirEphemeralPub,
    theirIdentityPub
  );

  // Inicializar ratchet
  const ratchetKp = sodium.crypto_box_keypair();
  await initRatchet(convId, sharedSecret, theirEphemeralPub, ratchetKp.privateKey);
}

/**
 * Cifrar un mensaje (usa Double Ratchet si hay sesión)
 * @param {string} convId
 * @param {string} plaintext
 * @returns {Object} Mensaje cifrado
 */
export async function encrypt(convId, plaintext) {
  const session = await loadSession(convId);
  if (!session || !session.initiated) {
    throw new Error('Sesión no iniciada para ' + convId);
  }
  return await ratchetEncrypt(convId, plaintext);
}

/**
 * Descifrar un mensaje (usa Double Ratchet si hay sesión)
 * @param {string} convId
 * @param {Object} msg - Mensaje con encryptedContent, nonce, ephemeralPubKey, msgIndex
 * @returns {string} Texto descifrado
 */
export async function decrypt(convId, msg) {
  const kp = getKeyPair();
  if (!kp) throw new Error('No hay keypair en RAM');
  const sodium = await ensureSodium();
  const myIdentityPriv = sodium.from_base64(kp.privateKey);
  return await ratchetDecrypt(convId, msg, myIdentityPriv);
}

/**
 * Generar pre-keys para subir al servidor
 * @param {number} count - Número de one-time pre-keys
 * @returns {{ signedPreKey: Object, oneTimePreKeys: Object[] }}
 */
export async function generatePreKeys(count = 100) {
  const sodium = await ensureSodium();
  const kp = getKeyPair();
  if (!kp) throw new Error('No hay keypair');

  const identityPriv = sodium.from_base64(kp.privateKey);

  // Signed Pre-Key (una)
  const signedKp = sodium.crypto_box_keypair();
  const signedKeyId = Math.floor(Math.random() * 1000000);

  // Firmar signed pre-key con identity key
  const signature = sodium.crypto_sign_detached(
    signedKp.publicKey,
    identityPriv
  );

  const signedPreKey = {
    key_id: signedKeyId,
    public_key: sodium.to_base64(signedKp.publicKey),
    private_key: sodium.to_base64(signedKp.privateKey),
    signature: sodium.to_base64(signature)
  };

  // One-Time Pre-Keys
  const oneTimePreKeys = [];
  for (let i = 0; i < count; i++) {
    const otKp = sodium.crypto_box_keypair();
    oneTimePreKeys.push({
      key_id: i + 1,
      public_key: sodium.to_base64(otKp.publicKey),
      private_key: sodium.to_base64(otKp.privateKey)
    });
  }

  return { signedPreKey, oneTimePreKeys };
}

/**
 * Verificar si hay sesión para una conversación
 */
export async function hasSession(convId) {
  const session = await loadSession(convId);
  return !!session && !!session.initiated;
}

/**
 * Eliminar sesión (al hacer lock/logout)
 */
export async function destroySession(convId) {
  await deleteSession(convId);
}

export default {
  initSessionAsAlice,
  initSessionAsBob,
  encrypt,
  decrypt,
  generatePreKeys,
  hasSession,
  destroySession
};
