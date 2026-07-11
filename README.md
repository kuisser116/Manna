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

| App | ¿Ayuda a tu comunidad local? | ¿Prioriza comercios de tu ciudad? | ¿Respeta tu atención? |
|-----|------------------------------|-----------------------------------|----------------------|
| TikTok | ❌ | ❌ | ❌ |
| Instagram | ❌ | ❌ | ❌ |
| Facebook | ❌ | ❌ | ❌ |
| **Shekael** | ✅ | ✅ | ✅ |

Shekael no te quiere pegado a la pantalla. Shekael quiere que **encuentres valor y salgas a vivirlo.**

---

## 🚀 Estado Actual

Shekael está en construcción activa como red social con:
- Feed de publicaciones (texto, imágenes, videos)
- Perfiles de usuario
- Términos y condiciones con logging forense
- Moderación local (sin IA costosa)
- Almacenamiento en R2 (Cloudflare)
- Autenticación con Google OAuth
- Antibot con reCAPTCHA v3 + rate limiting

### Próximas fases:
1. **Funcionalidad social** — posts, reacciones, comentarios pulidos
2. **Comercios locales** — perfiles de negocio, descubrimiento geográfico
3. **QR + descuento local** — paga con QR, 5% de descuento en tu comunidad
4. **Crecimiento comunitario** — que la gente encuentre y apoye su economía local

---

## 🛠️ Stack Técnico

| Capa | Tecnología |
|------|-----------|
| **Frontend** | React 19 + Vite + Zustand + Framer Motion |
| **Backend** | Node.js + Express |
| **Base de datos** | Supabase (PostgreSQL) |
| **Almacenamiento** | Cloudflare R2 |
| **Blockchain** | Stellar testnet (MXNe como puntos de lealtad) |
| **Auth** | Google OAuth + JWT |
| **Anti-bot** | reCAPTCHA v3 + rate limit |
| **Idioma** | Español (MX) |

---

## 🧑‍💻 Desarrollo Local

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
├── shekael-api/          # Backend (Express + Supabase + Stellar)
│   ├── src/
│   │   ├── routes/       # Endpoints REST
│   │   ├── services/     # Lógica de negocio
│   │   └── middleware/   # Auth, rate limit, validación
│   └── ...
├── shekael-frontend/     # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/   # Componentes UI
│   │   ├── pages/        # Páginas (Feed, Perfil, etc.)
│   │   ├── store/        # Estado global (Zustand)
│   │   ├── hooks/        # Custom hooks
│   │   └── api/          # Clientes HTTP
│   └── ...
└── README.md
```

---

## 🌱 Filosofía

Shekael no compite con Instagram ni TikTok. **No queremos tu atención, queremos tu comunidad.**

- Sin algoritmos que maximicen tiempo en pantalla
- Sin manipulación emocional
- Sin contenido diseñado para enganchar
- Sin shadowban ni censura invisible
- Sin bots ni cuentas falsas

**Transparencia, autenticidad y apoyo local.** Eso es Shekael.

---

## 📜 Licencia

Proyecto privado — Kuki Corp.
