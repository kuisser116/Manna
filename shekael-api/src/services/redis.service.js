import Redis from 'ioredis';

// ─────────────────────────────────────────────
// Redis client — cache de endpoints calientes
// Fallback silencioso: si Redis no responde,
// la app funciona sin cache (solo más lento).
//
// IMPORTANTE (ESM): los imports se evalúan antes
// de dotenv.config() en index.js, así que NO leemos
// process.env en el top-level. Inicialización lazy:
// el cliente se crea en el primer uso real.
// ─────────────────────────────────────────────

let redis = null;
let redisReady = false;
let attempted = false;
let retries = 0;
const MAX_RETRIES = 5;

function ensureRedis() {
  if (attempted && redisReady) return;
  if (attempted && !redisReady) {
    // Reintentar hasta MAX_RETRIES veces (2s por intento)
    if (retries >= MAX_RETRIES) return;
    retries += 1;
  }
  attempted = true;

  const REDIS_URL = process.env.REDIS_URL;
  const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
  const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
  const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

  if (!REDIS_URL && !REDIS_PASSWORD) {
    console.warn('[Redis] REDIS_PASSWORD no configurado — cache desactivado');
    return;
  }

  try {
    if (redis) {
      try { redis.disconnect(); } catch { /* noop */ }
      redis = null;
    }
    redis = REDIS_URL
      ? new Redis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true })
      : new Redis({
          host: REDIS_HOST,
          port: REDIS_PORT,
          password: REDIS_PASSWORD,
          maxRetriesPerRequest: 1,
          lazyConnect: true,
          retryStrategy: (times) => Math.min(times * 200, 2000),
        });
    redis.on('ready', () => { redisReady = true; });
    redis.on('error', () => { redisReady = false; });
    redis.connect().catch(() => { redisReady = false; });
  } catch (e) {
    redis = null;
    console.warn('[Redis] No disponible, cache desactivado:', e.message);
  }
}

export function isRedisReady() {
  ensureRedis();
  return !!redis && redisReady;
}

// getCache(key) → JSON o null (fallback silencioso)
export async function getCache(key, ttlMs) {
  if (!isRedisReady()) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (ttlMs && parsed && parsed._cachedAt) {
      if (Date.now() - parsed._cachedAt > ttlMs) return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

// setCache(key, value, ttlMs) — guarda JSON con timestamp
export async function setCache(key, value, ttlMs) {
  if (!isRedisReady()) return false;
  try {
    const payload = JSON.stringify({ ...value, _cachedAt: Date.now() });
    if (ttlMs) {
      await redis.set(key, payload, 'PX', ttlMs);
    } else {
      await redis.set(key, payload);
    }
    return true;
  } catch (e) {
    return false;
  }
}

export async function delCache(key) {
  if (!isRedisReady()) return;
  try { await redis.del(key); } catch { /* noop */ }
}

// cacheKey(prefix, ...parts) → 'shekael:feed:user:123:0'
export function cacheKey(prefix, ...parts) {
  return `shekael:${prefix}:${parts.join(':')}`;
}

export default redis;
