/**
 * fileEncryptor.js — Cifrado de archivos/fotos/videos con llave aleatoria
 * 
 * Flujo:
 * 1. Generar clave AES-256 aleatoria
 * 2. Cifrar el archivo completo con XChaCha20-Poly1305 (libsodium)
 * 3. Upload archivo cifrado al servidor
 * 4. La clave viaja por el Double Ratchet (message key)
 * 5. Receptor descifra el archivo con la clave
 */

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

/**
 * Cifra un archivo completo (ArrayBuffer) con XChaCha20-Poly1305
 * @param {ArrayBuffer} fileData - Contenido del archivo
 * @returns {{ encryptedData: Uint8Array, key: Uint8Array, hash: string }}
 */
export async function encryptFile(fileData) {
  const sodium = await ensureSodium();

  // Generar clave aleatoria de 256 bits
  const key = sodium.crypto_secretbox_keygen();

  // Generar nonce de 24 bytes (XChaCha20 usa 24)
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

  // Cifrar
  const ciphertext = sodium.crypto_secretbox_easy(
    new Uint8Array(fileData),
    nonce,
    key
  );

  // Empaquetar: nonce + ciphertext
  const encryptedData = new Uint8Array(nonce.length + ciphertext.length);
  encryptedData.set(nonce);
  encryptedData.set(ciphertext, nonce.length);

  // Hash del archivo original para verificación
  const hashBytes = sodium.crypto_generichash(sodium.crypto_generichash_BYTES, new Uint8Array(fileData));
  const hash = sodium.to_hex(hashBytes);

  return {
    encryptedData,
    key, // Uint8Array (32 bytes) — viaja por el ratchet
    nonce, // Uint8Array (24 bytes)
    hash
  };
}

/**
 * Descifra un archivo cifrado
 * @param {Uint8Array} encryptedData - nonce + ciphertext
 * @param {Uint8Array} key - Clave AES-256 (32 bytes)
 * @returns {Uint8Array} - Datos descifrados
 */
export async function decryptFile(encryptedData, key) {
  const sodium = await ensureSodium();

  const nonce = encryptedData.slice(0, sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = encryptedData.slice(sodium.crypto_secretbox_NONCEBYTES);

  return sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
}

/**
 * Convierte un File/Blob a ArrayBuffer
 */
export function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Convierte Uint8Array a Blob
 */
export function arrayBufferToBlob(data, mimeType = 'application/octet-stream') {
  return new Blob([data], { type: mimeType });
}

export default { encryptFile, decryptFile, fileToArrayBuffer, arrayBufferToBlob };
