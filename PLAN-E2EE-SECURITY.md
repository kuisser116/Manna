# PLAN: Shekael E2EE v2 + Seguridad Inquebrantable

> **Filosofía:** Cero concesiones. Lo que WhatsApp hace mal, lo hacemos bien.
> Forward secrecy SIN perder mensajes. Protección nivel banco. Preparado para mobile.
> Inhackeable no significa "no se puede hackear" — significa que el costo de hacerlo
> es tan alto que nadie lo intenta.

---

## ⚠️ Lo que TIENES que hacer en Supabase (manual)

### 1. Columna `msg_index` en `chat_messages`
```sql
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS msg_index INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_index 
  ON chat_messages(conversation_id, msg_index);
```

### 2. Tabla `pre_keys` (Fase 2)
```sql
CREATE TABLE IF NOT EXISTS pre_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  key_id INTEGER NOT NULL,
  public_key TEXT NOT NULL,
  signature TEXT NOT NULL,
  is_signed_pre_key BOOLEAN DEFAULT FALSE,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key_id)
);
CREATE INDEX IF NOT EXISTS idx_pre_keys_user ON pre_keys(user_id, used);
```

### 3. Columna `private_key_blob` en `users` (backup cifrado)
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS private_key_blob TEXT;
-- Cifrado con PIN del usuario antes de subir al servidor
```

### 4. Tabla `sessions` (control de dispositivos)
```sql
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_name TEXT,
  device_id TEXT NOT NULL,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
```

### 5. Políticas de seguridad (RLS para tablas sensibles)
```sql
-- Nadie puede leer pre_keys de otros sin usar endpoints
ALTER TABLE pre_keys ENABLE ROW LEVEL SECURITY;
-- Solo el dueño puede ver sus propias pre-keys usadas
CREATE POLICY pre_keys_owner ON pre_keys
  USING (user_id = current_setting('app.user_id')::text);
```

---

## Fase 1 — Ratchet con Forward Secrecy + Recuperación

**Qué logra:** Cada mensaje se cifra con una llave única. Si roban tu teléfono HOY,
no leen los mensajes de AYER. Pero TÚ siempre puedes recuperarlos.

**Cómo funciona:**
- Secreto raíz fijo = ECDH(tu privateKey, publicKey del otro) — nunca cambia
- Cadena unidireccional: rootKey → HKDF → key1 → mensaje1 → ratchet → key2 → mensaje2 → ...
- Guardamos el `msg_index` en cada mensaje de la BD
- Al abrir la app: recuperas rootKey + caminas la cadena desde msg_index 0

**Backend:**
- Ningún cambio necesario. Solo usamos `msg_index` que ya agregas en SQL

**Frontend:**
- `src/hooks/useRatchetSession.js` — nuevo hook (reemplaza lógica de encrypt/decrypt)
- IndexedDB: por cada conversación guarda { rootKey, lastSentIndex, lastRecvIndex }
- `send(convId, text)` → deriva key de rootKey + `lastSentIndex++` → cifra → envía `{ encrypted, nonce, msgIndex }`
- `recv(convId, encrypted, nonce, msgIndex)` → deriva key de rootKey + msgIndex → descifra
- Al seleccionar conversación: si `lastRecvIndex < msgIndex` del último mensaje, deriva llaves faltantes
- Respaldo: opcionalmente subir `private_key_blob` cifrado con PIN

**Archivos a modificar:**
| Archivo | Cambio |
|---------|--------|
| Nuevo: `src/hooks/useRatchetSession.js` | Hook del ratchet |
| `src/pages/Chat/Chat.jsx` | handleSend y decryptMessages usan ratchet |
| `src/api/chats.api.js` | sendMessage ahora incluye msgIndex |
| `src/store/index.jsx` | (opcional) estado del PIN/bloqueo |

**🧪 Prueba manual:**
1. Cuenta A y B abren la app → se generan llaves
2. B envía solicitud a A → A acepta → conversación creada
3. B envía "Hola" con msgIndex=1
4. A recibe y descifra con la misma key derivada
5. B envía "¿Cómo estás?" con msgIndex=2 (llave diferente)
6. Verificar que cada msgIndex produce una llave distinta

---

## Fase 2 — Pre-keys + X3DH (Mensajes Offline)

**Qué logra:** Puedes recibir mensajes aunque nunca hayas abierto la app.
Es la magia de Signal.

**Cómo funciona:**
- Al generar llaves (App.jsx), también generas y subes:
  - 1 signed pre-key (firmada con tu llave de identidad)
  - 100 one-time pre-keys (se consumen una cada vez)
- Cuando alguien inicia un chat contigo:
  - Toma una de tus one-time pre-keys del servidor
  - Hace X3DH(tu pre-key + tu identity key + su identity key) = shared secret inicial
  - El shared secret inicial es el rootKey del ratchet
  - El mensaje se cifra y se guarda en el servidor
- Cuando abres la app: bajas los mensajes pendientes, derivas el rootKey X3DH, descifras

**Backend (nuevos endpoints):**
| Método | URL | Función |
|--------|-----|---------|
| POST | `/chats/pre-keys` | Subir lote de pre-keys |
| GET | `/chats/pre-keys/:userId` | Obtener una pre-key disponible |
| GET | `/chats/pre-keys/:userId/count` | Saber cuántas quedan |
| POST | `/chats/pre-keys/top-up` | Subir más cuando se agoten |

**Frontend:**
| Archivo | Cambio |
|---------|--------|
| `src/hooks/useRatchetSession.js` | Añadir X3DH init cuando no hay sesión previa |
| `src/api/chats.api.js` | Endpoints de pre-keys |
| `src/pages/Chat/Chat.jsx` | loadData: si hay mensajes sin sesión, hacer X3DH |

**🧪 Prueba manual:**
1. A genera llaves → sube pre-keys
2. B cierra sesión / nunca abre la app  
3. A envía mensaje a B → servidor guarda (usa pre-key de B)
4. B abre la app → descarga mensajes pendientes → X3DH → descifra

---

## Fase 3 — Bloqueo Biométrico / PIN + Protección de Sesión

**Qué logra:** Si te roban el teléfono, no pueden abrir la app ni ver nada.
La llave privada además está cifrada con tu PIN.

**Cómo funciona:**
- PIN de 4-6 dígitos (o huella/Face ID en mobile)
- La `privateKey` se cifra con AES-GCM usando una key derivada del PIN
- En IndexedDB solo se guarda el blob cifrado
- Al abrir la app: pide PIN → deriva key → descifra privateKey → procede
- Sesión expira después de X minutos sin actividad → vuelve a pedir PIN
- Mobile: usar Keychain/Keystore en vez de IndexedDB

**Backend:**
- Endpoint para reportar sesiones activas
- Endpoint para revocar sesiones

**Frontend:**
| Archivo | Cambio |
|---------|--------|
| Nuevo: `src/components/LockScreen/LockScreen.jsx` | Pantalla de PIN/huella |
| Nuevo: `src/hooks/useSessionLock.js` | Temporizador de expiración |
| `src/App.jsx` | Envolver rutas protegidas con LockScreen |
| `src/store/index.jsx` | Estado del bloqueo |

**🧪 Prueba manual:**
1. Configurar PIN de prueba "1234"
2. Cerrar pestaña → abrir de nuevo → pide PIN
3. Esperar 5 min sin tocar → se bloquea → pide PIN otra vez
4. Mobile: probar Face ID / huella

---

## Fase 4 — Multi-dispositivo

**Qué logra:** Usas Shekael en tu celular Y en tu laptop. Mismos chats. Mismo cifrado.

**Cómo funciona:**
- Tu `privateKey` está respaldada en el servidor (cifrada con PIN)
- Al iniciar sesión en otro dispositivo: descargas el blob, lo descifras con PIN
- Los ratchets de cada conversación se sincronizan con un topic de WebSocket
- Si revocas un dispositivo desde otro, su blob se elimina del servidor

**Backend:**
| Método | URL | Función |
|--------|-----|---------|
| POST | `/auth/device/register` | Registrar nuevo dispositivo |
| DELETE | `/auth/device/:id` | Revocar dispositivo |
| GET | `/auth/devices` | Listar dispositivos activos |

**Frontend:**
| Archivo | Cambio |
|---------|--------|
| `src/hooks/useRatchetSession.js` | Sincronización vía polling/SSE de ratchets |
| `src/pages/Settings/Security.jsx` | Panel de dispositivos conectados |

---

## 🛡️ Seguridad General — Cómo hacerlo "inhackeable"

### Capa 1: Web (ahora mismo)
| Medida | Implementación |
|--------|---------------|
| **CSP headers** | Configurar en Express: `Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://apis.google.com;` |
| **No eval** | Evitar `eval()`, `new Function()`, `setTimeout(string)` — esto bloquea XSS que inyecta scripts |
| **Subresource Integrity** | Para CDN scripts (Google OAuth, etc.) |
| **reCAPTCHA v3** | Ya implementado en login — extender a registro de dispositivos |
| **Rate limiting** | Express-rate-limit: 5 intentos de PIN en 1 minuto = bloqueo temporal |
| **HTTP-only cookies** | El token JWT debería ir en cookie httpOnly + Secure + SameSite=Strict (opcional, requiere cambiar flujo de auth) |
| **Sanitización de inputs** | Todas las entradas de usuario se limpian antes de renderizar |
| **Protección contra CSRF** | Si usamos cookies, necesitamos tokens CSRF. Con localStorage/token header no hace falta. |

### Capa 2: Mobile (próximo paso)
| Medida | Implementación |
|--------|---------------|
| **App sandboxing** | React Native / Expo: el código corre en su propio contenedor |
| **Keychain/Keystore** | La privateKey va al Secure Enclave (iOS) / KeyStore (Android), no en IndexedDB |
| **Code obfuscation** | Ofuscar el bundle JS con herramientas como Jscrambler o JavaScript Obfuscator |
| **Root/jailbreak detection** | Si detecta root, la app se niega a abrir |
| **Screen capture blocking** | `setSecureView` en Android, `preventCapture` en iOS |
| **Certificate pinning** | La app mobile solo acepta el certificado SSL de Shekael, no cualquier CA |
| **App attestation** | Google Play Integrity + iOS DeviceCheck — asegura que la app corre en un dispositivo real |

### Capa 3: Anti-AI / Anti-bot
| Medida | Implementación |
|--------|---------------|
| **Rate limiting por IP + usuario** | Máximo 10 mensajes por minuto, 100 solicitudes de amistad por hora |
| **Anomaly detection** | Si un usuario envía 1000 mensajes en 1 minuto → bloquear temporalmente |
| **Proof of work** | Opcional: antes de enviar mensaje, el cliente resuelve un pequeño PoW (como Hashcash) |
| **Hardware attestation** | Mobile: verificar que la app no corre en un emulador |

### ¿Qué hace a Shekael realmente "inhackeable"?

| Vector de ataque | Cómo lo prevenimos |
|---|---|
| Hackean servidor → roban mensajes | E2EE: solo ven basura cifrada |
| Hackean servidor → roban llaves | Las llaves privadas están cifradas con PIN del usuario o en Keystore |
| Hackean servidor → modifican datos | RLS policies + firmas en pre-keys |
| Le roban el teléfono | PIN/biométrico + forward secrecy + privateKey cifrada |
| Le roban la sesión (token) | Sin privateKey no pueden leer nada. El PIN protege la privateKey |
| Ataque MITM | Certificate pinning en mobile |
| XSS en la web | CSP headers + sanitización + sin eval |
| AI generando ataques automatizados | Rate limiting + anomaly detection + reCAPTCHA |
| AI scraping masivo | Rate limiting por IP + PoW + bloqueo de datacenters |

---

## 📦 Orden de implementación sugerido

```
Semana 1-2: Fase 1 (Ratchet + forward secrecy + recuperación)
            + CSP headers + rate limiting básico

Semana 3-4: Fase 2 (Pre-keys + X3DH + mensajes offline)

Semana 5-6: Fase 3 (PIN/Biométrico + LockScreen + expiración de sesión)

Semana 7-8: Fase 4 (Multi-dispositivo + sync de ratchets)

Paralelo:   Planificación de mobile app
            Pruebas de penetración
            Audit de seguridad
```

---

## 📱 Mobile — Preparación desde ahora

Para que el plan funcione en mobile sin reescribir todo:

1. **React Native / Expo** es el camino — compartes lógica JS con la web
2. El hook `useRatchetSession.js` se puede reutilizar tal cual (es React)
3. IndexedDB se reemplaza por:
   - iOS: `expo-secure-store` (Keychain)
   - Android: `expo-crypto` + `react-native-keychain`
4. El LockScreen se vuelve nativo (Face ID / huella)
5. WebSockets en vez de polling en mobile (para batería)

**No necesitas decidir mobile hoy.** Si escribimos todo con hooks de React desacoplados de IndexedDB, migrar a React Native es mover los stores.

---

## ✅ Lo que necesito de ti para arrancar

1. **Ejecutar los SQL de arriba** en Supabase SQL Editor (los marcados como "manual")
2. **Decidir si quieres PIN obligatorio desde la Fase 1** o lo dejamos para la Fase 3
3. **Aprobar este plan** para empezar con la Fase 1

¿Aprobado?
