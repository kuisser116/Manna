# PLAN: Algoritmo de Valor — Shekael Feed Rankeado

## Filosofía

Instagram prioriza **engagement = más tiempo en la app**.
TikTok prioriza **retención = bucle infinito**.

Shekael prioriza **valor real** PERO también **atracción genuina**. No es una app aburrida donde nadie quiere entrar — tiene ganchos, pero sanos. La diferencia:

| App tradicional | Shekael |
|----------------|---------|
| "No puedo dejar de scrollear aunque sea basura" | "Quiero entrar porque sé que hay algo bueno" |
| Dopamina barata (siguiente video random) | Dopamina earned (encontré algo que valió la pena) |
| Rage-bait, doom-scrolling | Contenido que me hace sentir bien/informado/mejor |
| FOMO artificial (streaks, notis) | Anticipación genuina (creadores que me interesan) |

**El gancho de Shekael no es la adicción — es la calidad.** La gente vuelve porque SABE que lo que encuentra ahí vale la pena. Y eso, combinado con buen contenido, variedad y descubrimiento, crea una app que la gente AMA usar.

Las señales que importan:
- **Saves** → "Esto es útil, lo guardo para después"
- **Shares (DM/Compartir)** → "Esto le sirve a alguien que conozco"
- **Completion rate** → "Vi el contenido completo porque valió la pena"
- **Dwell time** → "Pasé tiempo procesando esto, no solo lo skipeé"
- **Afinitdad** → "Este creador consistentemente me da valor"

Las señales que NO importan tanto:
- Likes rápidos (unlike fácil, sin costo)
- Scroll infinito sin fin
- Notificaciones push de contenido basura

---

## Fase 1: Tablas de Señales en Supabase

### Tabla: `engagement_signals`

```sql
CREATE TABLE engagement_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    post_id TEXT NOT NULL,  -- UUID o fed__instance__id
    signal_type TEXT NOT NULL,  -- 'save', 'share_dm', 'share_feed', 'like', 'comment', 'view', 'dwell_5s', 'dwell_30s', 'completion'
    source TEXT DEFAULT 'shekael',  -- 'shekael' o 'fediverso'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_user ON engagement_signals(user_id);
CREATE INDEX idx_signals_post ON engagement_signals(post_id);
CREATE INDEX idx_signals_type ON engagement_signals(signal_type);
CREATE INDEX idx_signals_user_type ON engagement_signals(user_id, signal_type);
```

### Tabla: `affinity_scores`

```sql
CREATE TABLE affinity_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL,  -- UUID de Shekael o fed__instance__user
    affinity_score DECIMAL(5,2) DEFAULT 0,
    interaction_count INT DEFAULT 0,
    last_interaction TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, author_id)
);
```

### Tabla: `post_value_scores`

```sql
CREATE TABLE post_value_scores (
    post_id TEXT PRIMARY KEY,  -- UUID o fed__instance__id
    source TEXT DEFAULT 'shekael',
    save_count INT DEFAULT 0,
    share_dm_count INT DEFAULT 0,
    share_feed_count INT DEFAULT 0,
    like_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    view_count INT DEFAULT 0,
    dwell_total_seconds DECIMAL(10,2) DEFAULT 0,
    completion_count INT DEFAULT 0,
    value_score DECIMAL(10,4) DEFAULT 0,  -- Score compuesto
    trending_score DECIMAL(10,4) DEFAULT 0,  -- Score temporal (últimas 24h)
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Ponderación del Value Score

```
value_score = (
    saves × 10 +
    share_dm × 8 +
    share_feed × 6 +
    comments × 4 +
    completions × 3 +
    dwell_30s × 2 +
    likes × 1 +
    views × 0.1
) / max_age_hours^0.3
```

- **Saves** tienen el peso más alto (10x) — indican intención de volver
- **Shares DM** (8x) — indican valor social real
- **Comments** (4x) — indican conversación/reflexión
- **Likes** (1x) — engagement mínimo, casi no pesan
- **Views** (0.1x) — casi nada, evita que posts populares dominen solo por vistas
- **Decaimiento temporal**: `age^0.3` — contenido reciente tiene ventaja pero contenido evergreen mantiene score

---

## Fase 2: Endpoint de Feed Algoritmizado

### `GET /feed/ranked`

Parámetros:
- `limit` (default 20)
- `offset` (default 0)
- `include_fediverse` (default true)

**Lógica del backend:**

```
1. Obtener affinity scores del usuario hacia creadores
2. Obtener post_value_scores de los últimos N posts
3. Calcular ranking compuesto:

   ranking_score = (
       affinity(user, author) × 0.3 +
       value_score(post) × 0.5 +
       freshness(post) × 0.15 +
       diversity_bonus × 0.05
   )

   donde:
   - affinity: qué tanto interactúa el usuario con ese creador (0-1)
   - value_score: qué tan valioso es el post (normalizado 0-1)
   - freshness: qué tan reciente (última hora = 1, > 1 semana ≈ 0)
   - diversity_bonus: asegura variedad de creadores y tipos de contenido

4. Interleaving:
   - 70% posts rankeados (locales + federados mezclados por score)
   - 20% descubrimiento (posts de no-seguidos con alto value_score)
   - 10% aleatorio (exploración, contenido fresco sin señales aún)

5. Para Fediverso:
   - Los posts federados también reciben engagement_signals
   - saves/shares/comments en Mastodon NO son trackeables (limitación)
   - Pero el dwell time y completion rate SÍ son medibles en Shekael
   - Los posts federados parten con value_score base = 0 y suben con señales locales
```

### Fórmula de Affinity Score

```
affinity = (
    likes_given_to_author / total_likes +
    comments_on_author / total_comments +
    saves_from_author / total_saves +
    dwell_time_on_author / total_dwell_time
) / 4

Se actualiza cada vez que el usuario interactúa.
Decae lentamente si no hay interacción reciente (-0.05/día).
```

---

## Fase 3: Tracking de Señales (Frontend)

### Lo que ya tenemos:
- ✅ `AdSlot` con IntersectionObserver + Page Visibility + dwell timer
- ✅ Like/Unlike en PostCard y PostDetail
- ✅ Comments en PostDetail

### Lo que necesitamos agregar:

**Save button** (bookmark):
```jsx
// En PostCard y PostDetail
<button onClick={handleSave}>
  <Bookmark size={18} fill={isSaved ? 'var(--color-primary)' : 'none'} />
</button>
```

**Share con tracking:**
```jsx
// Al compartir por DM o feed link
fetch(`${API_URL}/signals`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    post_id: post.id,
    signal_type: 'share_dm' // o 'share_feed'
  })
});
```

**Dwell time tracking (ya existe en AdSlot, reusar):**
```jsx
// Cuando un post está en viewport > 5s y > 30s
if (visibleTime >= 5000) trackSignal('dwell_5s');
if (visibleTime >= 30000) trackSignal('dwell_30s');
```

**Completion tracking:**
- Videos: cuando llega al 90% → `completion`
- Texto: cuando el usuario hace scroll al 90% del contenido → `completion`

---

## Fase 4: Cómo se ve en el Frontend

### Feed actual (ahora):
```
[Post 1] [Post 2] [Post 3] [Ad] [Post 4] [Fed 1] [Post 5] ...
```
→ Orden: interleaving fijo (cada 4 locales, 1 federado)

### Feed con algoritmo:
```
[Mejor score del día] ← top global que no has visto
[Post de creador favorito] ← alta afinidad
[Post viral Fediverso] ← alto value_score federado
[Ad]
[Post educativo que guardaste similar] ← recomendación por contenido
[Post descubrimiento] ← no sigues al autor pero tiene alto score
[Post de otro creador que sigues] ← variedad
...
```

El usuario puede cambiar entre:
- **"Para ti"** (default) — algoritmo de valor
- **"Siguiendo"** — solo cuentas que sigues, cronológico
- **"Reciente"** — último 24h, ordenado por score

---

## Fase 5: Consideraciones Fediverso

Los posts del Fediverso **no tienen señales nativas** (no podemos medir likes/saves en Mastodon directamente). Pero sí podemos medir:

| Señal | Fediverso | Shekael |
|-------|-----------|---------|
| Like | ❌ (abre Mastodon) | ✅ |
| Save | ✅ (bookmark en Shekael) | ✅ |
| Share DM | ✅ (compartir link) | ✅ |
| Dwell time | ✅ (viewport tracking) | ✅ |
| Completion | ✅ (scroll/video) | ✅ |
| Comment | ❌ (abre Mastodon) | ✅ |

Los posts federados empiezan con **value_score = 0** y ganan tracción solo con interacciones locales. Esto es justo porque el contenido que la comunidad de Shekael realmente valora subirá naturalmente.

---

## Roadmap

| Fase | Qué | Dependencias |
|------|-----|--------------|
| **1** | Tablas Supabase + migración | Acceso a Supabase |
| **2** | Backend: endpoint `/feed/ranked` | Fase 1 |
| **3** | Frontend: save button + tracking signals | Fase 1 |
| **4** | Frontend: feed con ranking | Fase 2 + 3 |
| **5** | Ponderación + tuning | Datos reales de beta |
| **6** | Feediverso: señales cross-instancia | Fase 2 de Fediverso |

---

## Lo que NO va a tener Shekael

- ❌ **No hay "página para ti" tipo TikTok** que mezcla basura aleatoria
- ❌ **No hay notificaciones de "fulano publicó"** que interrumpen — el usuario elige
- ❌ **No hay streaks ni gamificación barata** — no necesitamos inventar FOMO
- ❌ **No hay rage-bait, contenido negativo o shock value** priorizado

### Pero SÍ va a tener:

- ✅ **Feed infinito pero inteligente** — no se acaba rápido pero cada post tiene razón de estar ahí
- ✅ **Ganchos genuinos:** saves, shares, completions — el usuario SIENTE que ganó algo
- ✅ **Descubrimiento emocionante** — posts de no-seguidos con alto valor, no aleatorios
- ✅ **Notificaciones que SÍ importan** — cuando alguien que te importa publica, cuando tu contenido recibe un save
- ✅ **"Algo nuevo para ti"** — al abrir la app sabes que hay contenido fresco y relevante
- ✅ **Recomendaciones de contenido similar a lo que guardaste** — como cuando encuentras un canal que te encanta

### Y también:

- ✅ **Transparencia**: el usuario puede ver por qué ve cada post ("alta afinidad", "trending", "similar a lo que guardaste")
- ✅ **Control**: "muéstrame menos de esto", "no me interesa"
- ✅ **Reset**: reiniciar el algoritmo si quieres empezar de cero
- ✅ **"Has visto todo. Nuevo contenido pronto."** — mejor que bucle infinito de basura

---

## Métricas de Éxito

| Métrica | Qué mide | Target |
|---------|----------|--------|
| Save rate | saves / views | > 8% (vs Instagram ~3%) |
| Share DM rate | shares_dm / views | > 4% |
| Completion rate | completions / views | > 40% |
| Dwell time promedio | tiempo en post | > 15s |
| DAU/MAU ratio | usuarios diarios / mensuales | > 40% |
| Sesiones/día | cuántas veces abre la app | > 2 |
| Tiempo por sesión | cuánto dura cada visita | ~15-25 min |
| Net Promoter Score | "¿Recomendarías Shekael?" | > 50 |

El objetivo es maximizar **calidad de interacción + deseo genuino de volver**.
No se trata de tiempo récord en la app, sino de que el usuario sienta que cada visita valió la pena.
