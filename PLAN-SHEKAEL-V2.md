# Plan Shekael v2 — Motor de Economía Local

> Documento vivo del plan completo: algoritmo, lugares, geolocalización, anuncios personalizados

---

## Fase 0 — Database Migration (tú la ejecutas)

**Archivo:** `shekael-api/src/database/migrations/shekael_v2_places_algorithm.sql`

Corre ese SQL en el SQL Editor de Supabase. Crea:
- `public_venues` — lugares públicos detectados por AI o agregados manualmente
- `purchase_intent` — intención de compra por usuario/categoría (Fase 3)
- Columnas nuevas en `users`, `posts`, `businesses`, `ads`, `ad_impressions`
- Función `geo_distance()` para calcular distancias

---

## Fase 1 — Algoritmo en PostgreSQL + Intereses Automáticos

### 1.1 Migrar algorithm.routes.js de JSON a SQL

**Archivos a modificar:**
- `shekael-api/src/routes/algorithm.routes.js` (290 líneas)

**Qué cambia:**
| Hoy (JSON) | Mañana (PostgreSQL) |
|-----------|-------------------|
| `readData()` → lee `algorithm-data.json` | SELECT de `engagement_signals`, `affinity_scores`, `post_value_scores` |
| `saveData()` → escribe JSON | INSERT/UPSERT en las 3 tablas SQL |
| Señales en memoria (máx 100k) | Señales ilimitadas en BD |
| Afinidad calculada en RAM | Afinidad persistente en `affinity_scores` |
| Post scores en RAM | Scores en `post_value_scores` |

**La lógica de pesos se mantiene exactamente igual:**
```
save: 10x, share_dm: 8x, share_feed: 6x, comment: 4x,
completion: 3x, dwell_30s: 2x, like: 1x, view: 0.1x
Decaimiento: raw / edad_horas^0.3
```

**Lo que no cambia:** los endpoints `/signal`, `/ranked`, `/scores`, `/stats`

### 1.2 Derivar intereses automáticamente

**Nuevo archivo:** `shekael-api/src/services/interest-derivation.service.js`

**Qué hace:** Cada 24h (cron), analiza `engagement_signals` de los últimos 7 días por usuario y asigna categorías de interés automáticamente.

```
Por cada usuario:
  Señales por categoría de contenido que consume:
    - 3+ saves en posts tech → interés: tecnologia
    - 5+ likes en posts de comida → interés: comida  
    - 2+ comments en gaming → interés: gaming
    - etc.
  
  Resultado: user.interest_categories = ["tech", "food"]
  Guardado en la columna interest_categories de users
```

**Categorías disponibles:**
`tech`, `faith`, `sports`, `art`, `music`, `food`, `travel`, `fashion`, `gaming`, `education`

### 1.3 Agregar ubicación a la API

**Archivos a modificar:**
- Nuevo endpoint: `POST /api/users/location` — recibe `{ lat, lng }` y actualiza `current_lat/lng`
- Frontend: llamar a este endpoint desde `useSignalTracking.js` o desde un hook nuevo `useGeolocation.js`

---

## Fase 2 — Mapa Interactivo + Venues

### 2.1 Expandir el mapa de Explorar

**Archivos a modificar:**
- `shekael-frontend/src/pages/Explorar/Explorar.jsx`
- `shekael-frontend/src/pages/Explorar/Explorar.module.css`

**Qué agregar:**

| Feature | Implementación |
|---------|---------------|
| Marker clustering | `supercluster` o `mapbox-gl-cluster` |
| Tooltip en hover (al lado del marker, no en centro) | Estado React + div posicionado con CSS |
| Sidebar izquierdo en click | `<aside>` que se desliza desde la izquierda, mapa se corre |
| Ubicación actual del usuario | Marker azul con geolocation API del navegador |
| Tab "Lugares" (posts con venue) | Nuevo endpoint GET /venues + GET /posts?venue_id= |
| Tab "Comercios" (ya existe) | Mejorar con más info en tooltip |
| Reviews en sidebar | Endpoint GET /reviews?venue_id= |

**Interacción del sidebar:**
```
Hover en marker → tooltip flotante al lado (desaparece al quitar hover)
Click en marker o tooltip → sidebar izquierdo estático con:
  - Nombre del lugar
  - Categoría y dirección
  - Rating promedio (de reseñas)
  - Posts etiquetados ahí (scrollable)
  - Reseñas recientes
  - Botón "Visitar perfil" (si es comercio)
Click fuera → sidebar se cierra
```

### 2.2 AI Place Detection al subir post

**Archivos a modificar:**
- `shekael-frontend/src/pages/CreatePost.jsx`
- Nuevo endpoint: `POST /api/ai/detect-venue`

**Flujo:**
```
1. Usuario sube imagen en CreatePost
2. Toca botón "Detectar lugar" (nuevo)
3. Frontend envía imagen a POST /api/ai/detect-venue
4. Backend llama a Gemini: "Identifica el lugar en esta imagen.
   Devuelve: nombre, categoría, zona. Si no hay lugar, null."
5. Gemini devuelve resultado
6. Se busca en public_venues si ya existe
7. Si existe → se asocia el post al venue existente
8. Si no existe → se crea nuevo venue + se asocia
9. Usuario confirma o edita
```

**La privacidad se protege porque:**
- Solo lugares públicos (restaurantes, parques, museos)
- El usuario decide si etiquetar ubicación o no
- 3 niveles: sin ubicación, zona general, lugar público
- Jamás coordenadas exactas visibles

---

## Fase 3 — Ads Personalizados + Geo-targeting

### 3.1 Consentimiento en Settings

**Archivos:**
- `shekael-frontend/src/pages/Settings.jsx` (o crear si no existe)
- `shekael-api/src/services/consent.service.js` (ya existe, conectarlo)

**UI Settings:**
```
┌─────────────────────────────────────┐
 │ Personalización de anuncios         │
 │                                     │
 │ [toggle] Permitir anuncios          │
 │          personalizados             │
 │                                     │
 │ Tus intereses detectados:           │
 │ 🎮 Gaming  🍔 Comida  🎵 Música    │
 │                                     │
 │ (detectados automáticamente por     │
 │  tu actividad en Shekael)           │
 │                                     │
 │ Si desactivas: anuncios genéricos   │
 │ Si activas: anuncios relevantes +   │
 │ más ganancias para ti               │
 └─────────────────────────────────────┘
```

**Consentimiento en ToS:** Al registrarse, el usuario acepta:
> "Shekael analiza tu actividad para personalizar tu experiencia. Puedes desactivarlo en Settings cuando quieras."

### 3.2 Match anuncio → perfil del usuario

**Archivos:**
- `shekael-api/src/services/consent.service.js` — ya tiene `matchAd()`
- `shekael-api/src/routes/ads.routes.js` — conectar matchAd en GET /ads

**Lógica de selección de anuncios:**

```javascript
function shouldShowAdToUser(ad, user) {
  // 1. ¿El usuario dio consentimiento?
  if (!user.data_consent) {
    return true; // ads genéricos (target_audience = "all")
  }

  // 2. Match por intereses
  const adTarget = ad.target_audience; // "interest:tech,gaming"
  const userInterests = JSON.parse(user.interest_categories || '[]');
  
  // 3. Match por ubicación
  const isLocal = matchLocation(ad, user);
  
  // 4. Decisión final
  if (isLocal) {
    return Math.random() < 0.9; // 90% local
  } else if (hasInterestMatch(adTarget, userInterests)) {
    return Math.random() < 0.1; // 10% global (descubrimiento)
  }
  
  return false;
}
```

### 3.3 Pool mensual sigue igual

No se cambia el sistema de pool. Los anuncios directos pagan más CPM que los genéricos, el pool crece, todos ganan más.

---

## Fase 4 — Intención de Compra

### 4.1 Calcular purchase_intent

**Nuevo archivo:** `shekael-api/src/services/purchase-intent.service.js`

**Señales que alimentan purchase_intent:**
| Señal | Peso |
|-------|:----:|
| Guardar un producto | +0.3 |
| Comentar "cuánto cuesta" | +0.4 |
| Ver perfil del negocio 3+ veces | +0.2 |
| Dar review a producto similar | +0.25 |
| Compartir producto por DM | +0.35 |
| Ignorar productos similares 3+ veces | -0.1 |

**Salida:** `purchase_intent` por usuario × categoría (0.0 a 1.0)

### 4.2 Incorporar al feed

Cuando el algoritmo rankea posts, recibe boost si el usuario tiene alta intención de compra en la categoría del post.

---

## Resumen de Archivos a Modificar/Crear

### Backend (API)

| Archivo | Acción |
|---------|--------|
| `shekael-api/src/database/migrations/shekael_v2_places_algorithm.sql` | ✅ Creado |
| `shekael-api/src/routes/algorithm.routes.js` | Modificar: JSON → SQL |
| `shekael-api/src/services/interest-derivation.service.js` | Crear: derivar intereses |
| `shekael-api/src/services/purchase-intent.service.js` | Crear: calcular intención de compra |
| `shekael-api/src/services/consent.service.js` | Ya existe, conectar |
| `shekael-api/src/routes/ads.routes.js` | Modificar: geo-targeting |
| `shekael-api/src/routes/venues.routes.js` | Crear: CRUD de lugares |
| `shekael-api/src/routes/ai.routes.js` | Crear: AI detect venue |
| `shekael-api/src/routes/users.routes.js` | Agregar: POST /location |

### Frontend

| Archivo | Acción |
|---------|--------|
| `shekael-frontend/src/pages/Explorar/Explorar.jsx` | Expandir: clustering, tooltip, sidebar |
| `shekael-frontend/src/pages/Explorar/Explorar.module.css` | Estilos nuevos |
| `shekael-frontend/src/pages/Settings.jsx` | Crear/Crear: toggle consentimiento + intereses |
| `shekael-frontend/src/pages/CreatePost.jsx` | Agregar: selector de ubicación + AI detect |
| `shekael-frontend/src/hooks/useGeolocation.js` | Crear: geolocalización en tiempo real |
| `shekael-frontend/src/api/venues.api.js` | Crear: API calls de venues |
| `shekael-frontend/src/api/consent.api.js` | Crear: API calls de consentimiento |

---

## Orden de Ejecución Recomendado

```
Semana 1: Fase 0 (SQL) + Fase 1 (algoritmo SQL + intereses)
  └─ Migration SQL (tú)
  └─ algorithm.routes.js → SQL
  └─ interest-derivation.service.js
  └─ POST /api/users/location

Semana 2: Fase 2 (mapa expandido + AI venues)
  └─ Explorar.jsx con clustering + tooltip + sidebar
  └─ venues.routes.js
  └─ AI detect venue
  └─ CreatePost con ubicación

Semana 3: Fase 3 (ads + consentimiento)
  └─ Settings con toggle
  └─ matchAd() conectado
  └─ Geo-targeting en ads

Semana 4: Fase 4 (intención de compra)
  └─ purchase-intent.service.js
  └─ Feed rankea con intención de compra
```

---

## Principios que NO cambian

1. **El usuario controla sus datos.** Consentimiento en ToS, revocable en Settings
2. **No se vende información.** Los datos son para mejorar el feed y ads de Shekael
3. **El 10% global siempre aplica.** Un negocio local puede ser descubierto en Japón si hay match de interés
4. **La privacidad es prioridad.** Ubicación en posts siempre es opt-in, 3 niveles de seguridad
5. **La economía es para la comunidad.** Usuarios ganan MXNe, negocios ganan clientes
