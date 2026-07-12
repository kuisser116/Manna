# Shekael — Red Social para tu Comunidad Local

> **Shekael** (שֶׁקֶת): "La paz que Dios creó" — un espacio de quietud, conexión real y apoyo mutuo.

## 🌾 Propósito

Shekael existe para **ayudar a la comunidad local**. Punto.

No es para atraparte en un bucle infinito de dopamina. No es para que le regales tu atención a un algoritmo. Es para conectar **gente real, cerca de ti, haciendo cosas reales.**

### Prioridades:
1. **Ayudar a los comercios locales** — que la gente de tu ciudad sepa qué negocios hay cerca, los apoye y descubra nuevos
2. **Compartir y aprender** — que la gente normal pueda enseñar algo, mostrar su talento, y que todos crezcamos juntos
3. **Ganar todos** — el comercio gana clientes, la comunidad gana conexiones, todos ganan

---

## 🏪 ¿Qué la hace diferente?

| App | ¿Ayuda a tu comunidad local? | ¿Cifrado real? | ¿Sin algoritmo adictivo? | ¿Temas con identidad? |
|-----|------------------------------|----------------|--------------------------|----------------------|
| TikTok | ❌ | ❌ | ❌ | ❌ |
| Instagram | ❌ | ❌ | ❌ | ❌ |
| Facebook | ❌ | ❌ | ❌ | ❌ |
| WhatsApp | ❌ | ✅ (sólo chat) | ❌ | ❌ |
| **Shekael** | ✅ | ✅ | ✅ | ✅ |

Shekael no te quiere pegado a la pantalla. Shekael quiere que **encuentres valor y salgas a vivirlo.**

---

## 🚀 Estado Actual

Shekael está en construcción activa. Esto es lo que ya existe:

### ✅ Funcionalidades implementadas

**Red social:**
- Feed de publicaciones (texto, imágenes, videos)
- Perfiles de usuario con foto y portada
- Creación de posts con tipos: texto, imagen, video, micro-texto, cápsula
- Reacciones, comentarios, posts guardados
- Filtros de contenido: Todo, Imágenes, Videos, Texto, Más apoyados
- QR propio y escáner QR para pagos

**Mensajería (Chats):**
- Mensajes uno-a-uno con cifrado extremo a extremo (Double Ratchet + X3DH)
- Conversaciones, búsqueda, solicitudes de mensaje
- Mensajes de audio con grabador inline, waveform en tiempo real, player custom con barra de progreso
- Velocidad de reproducción: 1x → 2x → 4x (click-to-cycle, sin dropdown)
- Stickers (enviar, guardar, favoritos, subir stickers personalizados)
- Encuestas (crear, votar, resultados en tiempo real)
- Grupos con enlaces de invitación, unirse/salir, foto de grupo
- Reenvío de mensajes
- Mensajes fijados con banner sticky + glass blur
- Búsqueda dentro de la conversación
- Notificaciones en tiempo real vía SSE
- Apodos personalizados por conversación
- PIN de seguridad que cifra la llave privada con PBKDF2 + AES-GCM

**Temas y diseño:**
- 7 temas oscuros con personalidad: Everforest, Everforest Soft, Navy, Catppuccin, Tokyo Night, Dark clásico + Light
- **Everforest Soft** como tema predeterminado (identidad visual: #333C43, #D3C6AA, #e11d48)
- Ciclo de temas con un click (botón 🎨 en la barra superior)
- Fondos con patrón SVG estático (no scrollea)
- Glassmorphism en headers y banners
- Animaciones GSAP en transiciones de mensajes
- Diseño responsive, scrollbar invisible hasta hover

### Próximas fases:
1. **Funcionalidad social pulida** — más interacciones, descubrimiento
2. **Comercios locales** — perfiles de negocio, descubrimiento geográfico
3. **QR + descuento local** — paga con QR, 5% de descuento en tu comunidad
4. **Crecimiento comunitario** — que la gente encuentre y apoye su economía local

---

## 🛠️ Stack Técnico

| Capa | Tecnología |
|------|-----------|
| **Frontend** | React 19 + Vite + Zustand + Framer Motion + GSAP |
| **Backend** | Node.js + Express |
| **Base de datos** | Supabase (PostgreSQL) |
| **Almacenamiento** | Cloudflare R2 (imágenes, videos, audios) |
| **Blockchain** | Stellar testnet (MXNe como puntos de lealtad) |
| **Cifrado** | Double Ratchet + X3DH + PBKDF2 + AES-GCM (IndexedDB) |
| **Auth** | Google OAuth + JWT |
| **Anti-bot** | reCAPTCHA v3 + rate limit |
| **Audio** | MediaRecorder API + Web Audio API (AnalyserNode) + ffmpeg |
| **Idioma** | Español (MX) |

---

## 🧑💻 Desarrollo Local

```bash
# Requisitos
node >= 18
npm

# Backend
cd shekael-api
cp .env.example .env   # configurar variables
npm install
npm run dev            # http://localhost:3001

# Frontend
cd shekael-frontend
npm install
npm run dev            # http://localhost:5173
```

---

## 🧱 Arquitectura

```
Shekael/
├── shekael-api/              # Backend (Express + Supabase + Stellar)
│   ├── src/
│   │   ├── routes/           # Chats, auth, posts, users, stickers
│   │   ├── services/         # Lógica de negocio
│   │   ├── middleware/       # Auth, rate limit, validación
│   │   └── uploads/          # Multer + R2
│   └── ...
├── shekael-frontend/         # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/       # AudioPlayer, AudioRecorder, StickerPicker,
│   │   │                     # PollCreator, PollResults, GroupCreateModal,
│   │   │                     # LockScreen, Sidebar, TopBar, PostCard...
│   │   ├── pages/            # Feed, Chat/, Profile, CreatePost, Landing...
│   │   ├── styles/           # CSS Modules con variables globales
│   │   ├── store/            # Zustand (usuario, tema, auth)
│   │   ├── hooks/            # useChatCrypto, useRatchetSession, useSessionLock...
│   │   └── api/              # Clientes HTTP (chats, posts, users)
│   └── ...
└── README.md
```

---

## 🎨 Identidad Visual

**Everforest Soft** es el tema predeterminado:
- Fondo: `#333C43` (verde-gris oscuro, cálido y calmado)
- Superficie: `#3A464C`
- Texto: `#D3C6AA` (beige suave, fácil de leer)
- Acento: `#e11d48` (rosa mexicano, vibrante pero sin gritar)
- Patrón SVG sutil como textura de fondo

La paleta completa incluye 6 variantes oscuras + modo claro, seleccionables desde un botón 🎨.

---

## 🔐 Seguridad

- **Cifrado extremo a extremo** en todos los mensajes (Double Ratchet + X3DH)
- **Llave privada cifrada con PIN** usando PBKDF2 + AES-GCM
- Sin acceso de servidor al contenido de los mensajes
- Las llaves se derivan en cliente, nunca viajan por red
- Autenticación con Google OAuth + JWT
- Rate limiting y reCAPTCHA v3 contra bots

---

## 🌱 Filosofía

Shekael no compite con Instagram ni TikTok. **No queremos tu atención, queremos tu comunidad.**

- Sin algoritmos que maximicen tiempo en pantalla
- Sin manipulación emocional
- Sin contenido diseñado para enganchar
- Sin shadowban ni censura invisible
- Sin bots ni cuentas falsas
- Tus mensajes son tuyos — cifrados de extremo a extremo

**Transparencia, autenticidad y apoyo local.** Eso es Shekael.

---

## 📜 Licencia

Proyecto privado — Kuki Corp.
