# Shekael — Documentación Completa del Sistema

> Última actualización: 30-Jul-2026
> Versión actual: Términos v1.4, Stellar testnet

---

## 1. Arquitectura General

### Componentes

| Componente | Tecnología | Puerto |
|---|---|---|
| Frontend | React + Vite + GSAP | 5173 |
| Backend | Node.js + Express | 3001 |
| Base de datos | Supabase (PostgreSQL) | Externo |
| Blockchain | Stellar (testnet) | Horizon: `https://horizon-testnet.stellar.org` |
| Precios USDC/MXN | Backend (`/price/usd-mxn`) | Tasa fija 18.50 (testnet) |

### Frontend (shekael-frontend)
- **Rutas principales:** `/` (Landing), `/terminos` (TOS), `/feed`, `/search`, `/profile/:id`, `/post/:id`, `/create-post`, `/chat`, `/explorar`, `/business`, `/admin/posts`, `/onboarding`
- **Store:** Zustand con auth, wallet, feed, términos, theme
- **Flujo de login:** Google OAuth → reCAPTCHA v3 → backend valida → JWT

### Backend (shekael-api)
- **Auth:** Google OAuth + JWT (7 días)
- **Rate limiter:** 600 req/min (bajar a 120 para producción)
- **Middleware:** authMiddleware, adminMiddleware
- **Servicios:** Stellar, Crypto, Price, Quest, Notifications

---

## 2. Flujo del Usuario

### Registro
1. Usuario abre Landing → da click en "Iniciar con Google"
2. Google OAuth devuelve credential → backend verifica con Google
3. Si es nuevo usuario:
   - Se genera par de llaves Stellar (`createWallet()`)
   - Se encripta la llave privada con `encryptAll(userId, secretKey, publicKey)`
   - Se almacena en `users` table: `bonus_total_mxn: 20`, `wallet_activated: false`, `tutorial_completed: false`
   - Se devuelve JWT con datos del usuario
4. Frontend guarda token en localStorage como `Shekael_token`
5. Frontend llama a `/auth/me` + `/auth/terms/current` en paralelo (`initAuth()`)
6. Si `user.terms_version !== latestTermsVersion` → redirige a `/terminos`

### Onboarding / Tutorial
- Si `tutorial_completed: false`, redirige a `/onboarding`
- Al completar tutorial, se marca como `true`

### Términos (v1.4)
- 17 secciones que cubren todo el ecosistema
- Al aceptar, se registra en `terms_acceptance_log`:
  - `user_id`, `terms_version`, `accepted_at`, `ip_address`, `user_agent`, `terms_hash` (SHA-256 del texto completo)
- El hash se genera en backend desde el texto exacto de los términos
- Si se actualiza a v1.5, usuarios con v1.4 serán redirigidos automáticamente

### Feed
- Ordenado por algoritmo de ranking (`sort=ranked`)
- El algoritmo siempre está activo (no espera señales)
- Rate limit: 600 req/min (bajar para producción)

### Publicaciones
- Tipos: `micro-text`, `capsule`, `image`, `video`
- Al crear: `approval_status: 'pending'` por defecto
- Solo aparecen en feed si `approval_status: 'approved'`

---

## 3. Flujo del Dinero — COMPLETO

### 3.1 Monedas y Tokens

| Token | Red | Propósito |
|---|---|---|
| **XLM** | Stellar | Gas (fees) para transacciones. ~0.00001 XLM por tx |
| **USDC** | Stellar | Token de valor. Moneda del ecosistema Shekael |
| **MXNe** | Stellar (planeado) | Token de recompensa por anuncios |

**Actualmente en testnet.** El issuer de USDC es `GBIY7EBUIQAYFTNV32YPPARUPPWNLTCYRPF2E6O2PICDORQPIXUZFEX2` (controlado por Kuki, existe solo en testnet).

### 3.2 La Wallet Maestra (KUISSER)

**Llave pública:** `GCZSFIWAA2XI562F4X3BR2OHK6L5FXAZNCXSJOOZ6KOQOYP3C4JRQQKJ`
**Purpose:** Esta wallet es la billetera de Kuki. Desde aquí:
1. Se activan wallets de usuarios nuevos (envía 2 XLM)
2. Se pagan bonos de $1 MXN aprobados (convierte $1 MXN → ~0.058 USDC y envía)
3. Es la cuenta que recibe los fondos iniciales

### 3.3 Bonos — Sistema de $20 MXN

```
Nuevo usuario se registra
├── bonus_total_mxn: 20  (asignado en BD)
├── bonus_released_mxn: 0  (nada liberado aún)
├── wallet_activated: false
└── bonus_expired: false

Kuki aprueba un post del usuario (máx 1/día)
├── [1] Verificar: bonus_expired? → error si expiró
├── [2] Verificar: último post aprobado hoy? → error si ya tuvo uno
├── [3] Verificar: bonus_released_mxn >= 20? → error si ya alcanzó tope
├── [4] ¿Wallet no activada?
│   └── Llamar activateWallet(autor):
│       ├── fundWithFriendbot(publicKey) → +10,000 XLM (SOLO testnet)
│       ├── ensureTrustline(publicKey, 'USDC') → trustline USDC
│       └── sendPayment({
│           fromSecretKey: MANNA_DEV_WALLET_SECRET,
│           toPublicKey: user.stellar_public_key,
│           amount: '2.0000000',   // 2 XLM desde la maestra
│           memo: 'Shekael:activate-uuid'
│         })
├── [5] Convertir $1 MXN → USDC:
│   └── convertToUSDC(1) → ~0.0580000 USDC
├── [6] Enviar USDC desde wallet maestra:
│   └── sendPayment({
│       fromSecretKey: MANNA_DEV_WALLET_SECRET,
│       toPublicKey: author.stellar_public_key,
│       amount: '0.0580000',
│       memo: 'Shekael:bonus-post-uuid'
│     })
├── [7] Actualizar BD:
│   ├── bonus_released_mxn += 1
│   ├── last_post_approved_at = ahora
│   └── if (primer post):
│       ├── first_post_approved_at = ahora
│       └── bonus_expires_at = ahora + 70 días
└── [8] Marcar post approval_status = 'approved'
```

**Reglas del bono:**
- Tope: $20 MXN por usuario
- Máximo 1 post aprobado por día por usuario
- Expira 70 días después del primer post aprobado
- $1 MXN se envía REALMENTE en USDC desde la wallet de Kuki
- NO se descuentan $20 completos de golpe — solo $1 por aprobación
- Los $20 son el máximo potencial, no un débito upfront

**Costo real para Kuki por usuario completo (20 posts aprobados):**
- 2 XLM para activar wallet: ~$4 MXN
- $20 MXN en USDC enviados: ~$20 MXN
- Total por usuario: ~$24 MXN

### 3.4 Apoyos (Supports)

```
Usuario A apoya a Usuario B
├── Frontend: Selecciona monto en MXN ($5, $10, $25, $50, $100)
├── Frontend: mxnToUsdc(monto) → verifica saldo suficiente
├── Frontend: sendSupport(recipientKey, postId, montoMXN)
├── Backend: amountInUSDC = await convertToUSDC(montoMXN)
├── Backend: sendPayment({
│   fromSecretKey: sender.secretKey,
│   toPublicKey: recipientKey,
│   amount: String(amountInUSDC),
│   assetCode: 'USDC',
│   memo: 'Shekael Support'
│ })
├── Backend: Registrar transacción en 'transactions' table
├── Backend: Registrar 10% al Fondo Regional
├── Backend: Incrementar supports_count en posts
└── Backend: Crear notificación de support
```

**Comisión Fondo Regional:** 10% del monto del apoyo, se deposita en una transacción separada con `to_user: 'regional-fund'`.

### 3.5 Wallet del Usuario

- Cada usuario tiene UNA cuenta Stellar (generada al registrarse)
- La llave privada se encripta con `encryptAll()` (multi-capa):
  - Primera capa: cifrado con ID de usuario
  - Segunda capa: cifrado con llave maestra de respaldo
  - Tercera capa: cifrado con llave maestra alternativa
- La llave pública se guarda en `stellar_public_key`
- `wallet_activated` indica si la cuenta existe en Stellar (tiene balance, trustlines)
- `walletNotFunded` en frontend: true si el endpoint de balance devuelve 404 (cuenta no existe en Stellar)
- El frontend usa `useWallet` hook que llama a `GET /wallet/balance` (el backend llama a Horizon)

### 3.6 Retiros

```
Usuario retira USDC a cualquier cuenta Stellar
├── Backend: Descifra clave del usuario con decryptWithFallback()
├── Backend: sendPayment({
├──   fromSecretKey: userSecretKey,
│   toPublicKey: destino,
│   amount: monto,
│   assetCode: 'USDC',
│   memo: 'Shekael Withdraw'
│ })
└── Backend: Registra en transactions table
```

---

## 4. Conversión MXN ↔ USDC

### Frontend (price.api.js)
```js
getMxnRate() → GET /price/usd-mxn → devuelve rate (ej: 18.50)
mxnToUsdc(cantidadMXN) → cantidadMXN / rate
usdcToMxn(cantidadUSDC) → cantidadUSDC * rate
```
Cache: 5 minutos en frontend. Fallback a 18.50 si backend no responde.

### Backend (price.service.js)
```js
convertToUSDC(mxnAmount) → mxnAmount / 18.50  // tasa fija en testnet
convertToMXN(usdcAmount) → usdcAmount * 18.50
getMxnRate() → 18.50  // TODO: conectar a CoinGecko/Bitso API en producción
```

**EN PRODUCCIÓN:** Debe conectarse a CoinGecko o Bitso API para tasa real.

---

## 5. Admin Panel

**URL:** `/admin/posts` (solo usuarios con `is_admin: true`)

### Flujo de Aprobación
1. Admin ve posts pendientes (`approval_status: 'pending'`)
2. Card muestra: autor, contenido, likes, comments, bonus del autor
3. Admin da click en "Aprobar (+$1 MXN)"
4. Backend ejecuta todo el pipeline (sección 3.3)
5. Post se mueve a `approved`, stats se actualizan

### Stats del Admin
| Stat | Query |
|---|---|
| Pendientes | `SELECT count WHERE approval_status='pending'` |
| Aprobados hoy | `SELECT count WHERE approval_status='approved' AND approved_at > today` |
| Usuarios totales | `SELECT count FROM users` |
| Wallets activas | `SELECT count FROM users WHERE wallet_activated=true` |

---

## 6. Recompensas por Anuncios (Rewarded Ads)

- Usuario ve anuncio → recibe MXNe (token de recompensa)
- Requiere: skip button estilo YouTube, focus check, rate limit
- Las tasas y requisitos los define Shekael unilateralmente
- Implementación pendiente para producción

---

## 7. Depósitos y Retiros (UI)

### DepositModal
- Muestra dirección Stellar del usuario (pública)
- Genera código QR
- Muestra mensaje de activación SOLO si `walletNotFunded === true`
- Instrucciones para depositar desde exchanges

---

## 8. Términos y Condiciones (v1.4)

### Versión actual: v1.4 (30-Jul-2026)

### Sistema de Evidencia
- Cada aceptación queda en `terms_acceptance_log`
- Campos: `user_id`, `terms_version`, `accepted_at`, `ip_address`, `user_agent`, `terms_hash`
- `terms_hash` = SHA-256 del texto íntegro de los términos
- Nueva tabla `terms_versions` almacena el texto exacto de cada versión
- Para verificar: texto → SHA-256 → comparar con hash en log

### Active Enforcement
- `initAuth()` obtiene `latestTermsVersion` del backend junto con user data
- `ProtectedRoute` en App.jsx compara `user.terms_version !== latestTermsVersion`
- Si no coinciden → redirige a `/terminos` (no importa desde qué ruta)
- Protegido contra loop infinito (no redirige si ya estás en `/terminos`)

### Forzar re-acaptación en usuarios existentes
- Solo subir `TERMS_VERSION` en `auth.routes.js`
- Ejemplo: v1.4 → v1.5: todos los usuarios con v1.4 serán redirigidos a /terminos
- Frontend ya compara automáticamente

---

## 9. Base de Datos (Supabase)

### Tablas principales

| Tabla | Propósito |
|---|---|
| `users` | Usuarios, wallets, bonos, términos |
| `posts` | Publicaciones, supports_count, approval_status |
| `transactions` | Historial de transacciones Stellar |
| `terms_acceptance_log` | Auditoría legal de aceptación de términos |
| `terms_versions` | Texto íntegro de cada versión de términos |

### Columnas clave en `users`
- `stellar_public_key` — Llave pública Stellar
- `stellar_secret_key_encrypted` — Llave privada encriptada
- `wallet_activated` — ¿Cuenta existe en Stellar?
- `bonus_total_mxn` — Bono máximo (20)
- `bonus_released_mxn` — Bono liberado hasta ahora
- `bonus_expired` — ¿Expiró el bono?
- `bonus_expires_at` — Fecha de expiración
- `first_post_approved_at` — Primer post aprobado
- `last_post_approved_at` — Último post aprobado (para límite 1/día)
- `tutorial_completed` — ¿Completó tutorial?
- `terms_accepted_at` — Cuándo aceptó términos
- `terms_version` — Qué versión aceptó
- `is_admin` — ¿Es administrador?

---

## 10. Estados y Condiciones Especiales

### Usuario nuevo, sin wallet activa
- `wallet_activated: false`, `bonus_released_mxn: 0`
- No puede recibir USDC (no existe en Stellar)
- Al primer post aprobado, se activa automáticamente

### Usuario con wallet activa, sin bono
- `wallet_activated: true`, `bonus_total_mxn: 0` (solo admin)
- Puede recibir USDC, depositar, retirar
- No participa en programa de bonos

### Bono expirado
- `bonus_expired: true` (después de 70 días sin liberar todo)
- Fondos no reclamados van al Fondo Regional
- Ya no puede recibir más bonos

### Tope alcanzado
- `bonus_released_mxn >= 20`
- Ya no puede recibir más bonos
- Conserva lo que ya ganó

### Suspensión
- USDC acumulados pasan al Fondo Regional
- Sin compensación para el usuario

---

## 11. Costos para Kuki (Producción)

| Concepto | Costo por usuario |
|---|---|
| Activar wallet (2 XLM) | ~$4 MXN |
| Bonos (20 posts × $1 MXN) | ~$20 MXN |
| **Total por usuario completo** | **~$24 MXN** |

Con $1,000 MXN puedes activar y pagar bono completo a ~40 usuarios.

En testnet: Friendbot da 10,000 XLM gratis. En mainnet: NO existe Friendbot. Todo sale de KUISSER.

---

## 12. Checklist de Producción

### 🔴 Crítico
- [ ] Configurar mainnet en `.env`: `STELLAR_NETWORK=mainnet`, horizon URL, network passphrase
- [ ] USDC issuer real de Circle en mainnet
- [ ] Eliminar `fundWithFriendbot()` de `activateWallet()` (no existe en mainnet)
- [ ] Rate limiter: 600 → 120 req/min
- [ ] Tener XLM real en KUISSER (~2 XLM por usuario a activar)
- [ ] Tener USDC real en KUISSER para bonos

### 🟡 Importante
- [ ] Conectar precio USD/MXN a CoinGecko o Bitso API
- [ ] Build frontend (`vite build`) y servir desde backend o nginx
- [ ] HTTPS + dominio

### 🟢 Opcional
- [ ] Eliminar archivos de fediverse del historial de git
- [ ] Monitoreo básico de logs y alertas
- [ ] Integrar anchors de retiro (MoneyGram)

---

## 13. Fixes Realizados Hoy (30-Jul-2026)

### SupportButton
- Todos los montos en MXN ($5/$10/$25/$50/$100)
- Backend convierte MXN→USDC antes de enviar en Stellar
- Contador de apoyos persiste en BD (reemplazado RPC `increment_supports` que no existía)

### DepositModal
- Mensaje de activación ahora condicional (`walletNotFunded`)

### AdminPostApproval
- Emojis reemplazados por Lucide icons

### Admin approve-post
- Tutorial ya no es requisito para recibir pago
- Números de pasos corregidos
- Se mantiene envío de $1 MXN real por aprobación (descuenta de $1 en $1, no $20 upfront)

### Términos v1.4
- 17 secciones cubriendo todas las features
- Evidencia forense: hash SHA-256 + IP + UA + timestamp en cada aceptación
- Tabla `terms_versions` para almacenar texto íntegro
- Class action waiver
- Forzar re-aceptación en TODOS los usuarios via ProtectedRoute

### Landing
- Economía: 5 pasos (incluye rewards ads + bono $20)
- Features grid: Apoyos USDC + Wallet USDC

---

## 14. Comandos Útiles

```bash
# Iniciar backend
cd shekael-api && node src/index.js

# Iniciar frontend
cd shekael-frontend && npx vite --host 0.0.0.0

# Build producción frontend
cd shekael-frontend && npx vite build

# Verificar términos actuales
curl http://localhost:3001/auth/terms/current

# Verificar balance de una cuenta Stellar (testnet)
curl https://horizon-testnet.stellar.org/accounts/GAF2ZKMPYGDYEZDDEQC4X7GQVUUBHFXVEBC24THY73C6QI7UXMUQL42F

# Crear post de prueba (desde backend)
# insert en Supabase con approval_status: 'pending'
```
