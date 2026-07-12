# PLAN: Chat Completo — Mejor que WhatsApp

> **Filosofía:** Todo lo que WhatsApp tiene, Shekael lo tiene mejor.
> Sin comprometer seguridad, sin dark patterns, sin límites artificiales.

---

## ⚠️ SQL para Supabase (correr ANTES de empezar)

```sql
-- =============================================
-- Migración: Chat Completo v2
-- =============================================

-- 1. Eliminación de mensajes (borrado suave para sincronización)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- 2. Replies (responder a un mensaje concreto)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES chat_messages(id);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_preview TEXT; -- texto preview del mensaje original

-- 3. Mensajes fijados en conversación
CREATE TABLE IF NOT EXISTS chat_pinned_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id UUID NOT NULL REFERENCES chat_messages(id),
  pinned_by TEXT NOT NULL,
  pinned_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pinned_conv ON chat_pinned_messages(conversation_id);

-- 4. Conversaciones fijadas (pin de chat)
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- 5. Apodo por chat (rename)
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS nickname TEXT;

-- 6. Fondo personalizado por chat
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS custom_bg_url TEXT;

-- 7. Tabla de stickers
CREATE TABLE IF NOT EXISTS chat_stickers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  image_url TEXT NOT NULL,
  emoji TEXT DEFAULT '😊',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stickers_user ON chat_stickers(user_id);

-- 8. Mensajes con tipo (text, image, audio, file, location, poll)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_thumb_url TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS duration REAL; -- para audios
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS location_lat REAL;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS location_lng REAL;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS location_name TEXT;

-- 9. Encuestas
CREATE TABLE IF NOT EXISTS chat_polls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id UUID NOT NULL REFERENCES chat_messages(id),
  question TEXT NOT NULL,
  created_by TEXT NOT NULL,
  is_multiple_choice BOOLEAN DEFAULT FALSE,
  is_closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_poll_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID NOT NULL REFERENCES chat_polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_poll_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID NOT NULL REFERENCES chat_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES chat_poll_options(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  voted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, user_id, option_id)
);

-- 10. Reenvío de mensajes (forward)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS forwarded_from TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS forwarded_at TIMESTAMPTZ;

-- 11. Favoritos (mensajes guardados)
CREATE TABLE IF NOT EXISTS chat_saved_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  message_id UUID NOT NULL REFERENCES chat_messages(id),
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, message_id)
);

-- 12. Grupos
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_photo_url TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_description TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_theme TEXT; -- JSON con colores/fondo
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_created_by TEXT REFERENCES users(id);

ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS group_invite_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  code TEXT UNIQUE NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  max_uses INTEGER DEFAULT 0, -- 0 = ilimitado
  use_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invite_code ON group_invite_links(code);

CREATE TABLE IF NOT EXISTS group_join_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);
```

---

## Orden de Implementación

### Lote 1 — Multimedia + Preview (base para todo lo demás)
| # | Feature | Backend | Frontend |
|---|---------|---------|----------|
| 1 | **Enviar fotos** | Subir imagen a R2/local → guardar URL en message.media_url | File picker → preview → cifrar y enviar como tipo 'image' |
| 2 | **Preview de imágenes** | Solo thumb URL | Modal/galería al tocar imagen en el chat |
| 3 | **Enviar documentos** | Subir archivo → guardar metadata | File picker (cualquier tipo) → mostrar icono+nombre+size |
| 4 | **Re-enviar fotos "de una sola vez"** | Misma lógica de subida | Compresión automática antes de cifrar |

### Lote 2 — Interacción de mensajes
| # | Feature | Backend | Frontend |
|---|---------|---------|----------|
| 5 | **Responder mensaje (reply)** | Guardar reply_to_id + reply_preview | UI: swipe o tap → reply → preview del original arriba del input |
| 6 | **Reenviar mensajes** | Duplicar encrypted_content con nuevo msg_index | Select mensaje → elegir chat destino |
| 7 | **Eliminar sin rastro** | Soft delete (deleted_at) | No mostrar mensaje, eliminar de UI |
| 8 | **Buscar en el chat** | Endpoint GET /chats/:id/search?q= | Barra de búsqueda + resultados resaltados |

### Lote 3 — Organización
| # | Feature | Backend | Frontend |
|---|---------|---------|----------|
| 9 | **Fijar conversación (pin)** | UPDATE conversation_participants SET is_pinned = true | Icono de pin + ordenar pins primero |
| 10 | **Fijar mensaje en el chat** | INSERT chat_pinned_messages | Badge + ir al mensaje |
| 11 | **Filtros: no leídos / todos** | Query con LEFT JOIN last_read_at | Toggle pill en cabecera del panel de chats |
| 12 | **Archivos del chat (media gallery)** | GET /chats/:id/media (solo type IN image,audio,file) | Sheet con tabs: Fotos, Audios, Docs |

### Lote 4 — Personalización
| # | Feature | Backend | Frontend |
|---|---------|---------|----------|
| 13 | **Apodo por chat (rename)** | UPDATE conversation_participants SET nickname | Input en header del chat |
| 14 | **Fondo personalizado por chat** | Guardar URL en custom_bg_url | File picker → subir imagen → aplicar como bg |
| 15 | **Tema global vs por chat** | — | CSS variables por conversación |

### Lote 5 — Stickers + Emojis
| # | Feature | Backend | Frontend |
|---|---------|---------|----------|
| 16 | **Emoji picker** | — | Librería emoji-mart o similar + popover |
| 17 | **Enviar stickers** | Servir stickers como imágenes | Picker con stickers precargados + importar |
| 18 | **Importar stickers propios** | Subir imagen → guardar en chat_stickers | UI de importación + categorías |
| 19 | **Favoritos y descargar stickers** | chat_stickers con is_favorite | Botón ❤️ en sticker + colección de favoritos |

### Lote 6 — Features avanzadas
| # | Feature | Backend | Frontend |
|---|---------|---------|----------|
| 20 | **Audios** | Subir archivo de audio → guardar duración | MediaRecorder (grabar) +波形 visualización |
| 21 | **Ubicación** | Guardar lat/lng + nombre | OpenStreetMap embed + enviar ubicación actual |
| 22 | **Encuestas** | 3 tablas: polls, options, votes | Crear encuesta + votar + ver resultados en tiempo real |
| 23 | **Notificaciones** | SSE/WebSocket para eventos nuevos | Push API + badge en el icono |

### Lote 7 — Grupos
| # | Feature | Backend | Frontend |
|---|---------|---------|----------|
| 24 | **Crear grupo** | INSERT conversations con is_group=true + participantes + admins | Modal crear grupo + seleccionar miembros |
| 25 | **Foto de grupo** | Subir foto → guardar en group_photo_url | File picker + preview circular |
| 26 | **Tema del grupo** | Guardar group_theme (JSON) en conversations | Modal con opciones de color/fondo para todo el grupo |
| 27 | **Salir/eliminar grupo** | DELETE participant o soft-delete | Confirmación + notificar miembros |
| 28 | **Invitar por link** | group_invite_links con código único | Generar link + compartir |
| 29 | **Solicitudes de unión** | group_join_requests con approve/reject | Aprobación por admins |
| 30 | **Roles (admin/member)** | is_admin en conversation_participants | Badge de admin + settings solo para admins |

---

## Resumen de Nuevos Endpoints

### Multimedia (subida)
```
POST /chats/upload          → sube imagen/audio/doc → devuelve URL
GET  /chats/:id/media       → lista archivos del chat (fotos, audios, docs)
```

### Búsqueda
```
GET  /chats/:id/search?q=   → busca en mensajes de la conversación
```

### Stickers
```
POST /chats/stickers        → subir sticker propio
GET  /chats/stickers        → obtener mis stickers + defaults
POST /chats/stickers/fav    → marcar/desmarcar favorito
```

### Encuestas
```
POST /chats/polls           → crear encuesta (incluye opciones)
POST /chats/polls/:id/vote  → votar
POST /chats/polls/:id/close → cerrar encuesta
GET  /chats/polls/:id       → resultados
```

### Utilidades
```
GET  /chats/:id/pinned-message   → mensaje fijado
POST /chats/:id/pin-message      → fijar/desfijar mensaje
POST /chats/:id/pin              → fijar/desfijar conversación (participant)
PUT  /chats/:id/nickname         → cambiar apodo
PUT  /chats/:id/background       → cambiar fondo
DELETE /chats/messages/:id       → eliminar mensaje
POST /chats/messages/:id/forward → reenviar
POST /chats/messages/:id/save    → guardar en favoritos
GET  /chats/saved-messages       → ver favoritos
```

---

## Total estimado

| Lote | Features | Endpoints nuevos | Archivos a tocar | Tiempo estimado |
|------|----------|-----------------|-----------------|----------------|
| 1 | 4 | 2 | 8 | 2-3 días |
| 2 | 4 | 3 | 6 | 1-2 días |
| 3 | 4 | 2 | 5 | 1 día |
| 4 | 3 | 2 | 4 | 1 día |
| 5 | 4 | 3 | 5 | 2 días |
| 6 | 4 | 5 | 7 | 3-4 días |
| **Total** | **23** | **~17** | **~35** | **~2 semanas** |
