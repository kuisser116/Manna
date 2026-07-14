/**
 * sessionsDB.js — IndexedDB para estado del Double Ratchet
 * 
 * Almacena por conversación:
 * - rootKey: la llave raíz del ratchet (cambia en cada DH step)
 * - sendChain: { chainKey, messageIndex } para mensajes enviados
 * - recvChain: { chainKey, messageIndex } para mensajes recibidos
 * - theirRatchetPub: última llave pública del otro lado (DH step)
 * - myRatchetPriv: mi llave privada actual del ratchet
 * 
 * La DB es por usuario (ShekaelSessions_{userId}).
 */

const getDbName = () => {
  const userId = localStorage.getItem('Shekael_session_userId') || 'default';
  return `ShekaelSessions_${userId}`;
};

export function openSessionsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(getDbName(), 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('sessions')) {
        req.result.createObjectStore('sessions', { keyPath: 'convId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(convId, state) {
  const db = await openSessionsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').put({ convId, ...state, updatedAt: Date.now() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function loadSession(convId) {
  const db = await openSessionsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readonly');
    const req = tx.objectStore('sessions').get(convId);
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function deleteSession(convId) {
  const db = await openSessionsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').delete(convId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function listSessions() {
  const db = await openSessionsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readonly');
    const req = tx.objectStore('sessions').getAll();
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function clearAllSessions() {
  const db = await openSessionsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export default { openSessionsDB, saveSession, loadSession, deleteSession, listSessions, clearAllSessions };
