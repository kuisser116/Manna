import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { checkAndFundQuest } from '../services/quest.service.js';
import { uploadToR2, generateFilename } from '../services/ipfs.service.js';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const router = Router({ strict: false });

// Multer en memoria para avatares
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo para avatares
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes'), false);
        }
    },
});

// Middleware para manejar errores de Multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                message: 'El archivo es demasiado grande. El tamaño máximo es 5MB.',
                code: 'LIMIT_FILE_SIZE'
            });
        }
    }
    next(err);
};

// GET /users/:id — Obtiene el perfil público
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const targetUserId = req.params.id;
        const currentUserId = req.user.id;

        // Intentar con username, fallback si la columna no existe
        let user;
        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, email, display_name, username, bio, stellar_public_key, public_key, avatar_url, cover_url, created_at')
                .eq('id', targetUserId)
                .maybeSingle();
            if (error) throw error;
            user = data;
        } catch {
            // Si username column no existe aún, consultar sin ella
            const { data, error } = await supabase
                .from('users')
                .select('id, email, display_name, bio, stellar_public_key, public_key, avatar_url, cover_url, created_at')
                .eq('id', targetUserId)
                .maybeSingle();
            if (error) throw error;
            user = { ...data, username: null };
        }

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const { data: followRecord } = await supabase
            .from('followers')
            .select('*')
            .eq('follower_id', currentUserId)
            .eq('followed_id', targetUserId)
            .single();

        const { data: userFollowers } = await supabase
            .from('followers')
            .select('*')
            .eq('followed_id', targetUserId);
            
        const { data: userFollowing } = await supabase
            .from('followers')
            .select('*')
            .eq('follower_id', targetUserId);

        const { data: userPosts } = await supabase
            .from('posts')
            .select('id')
            .eq('author_id', targetUserId)
            .eq('is_banned', false);

        res.json({
            user: {
                ...user,
                displayName: user.display_name,
                stellarPublicKey: user.stellar_public_key,
                reputationLevel: user.reputation_level,
                avatarUrl: user.avatar_url,
                coverUrl: user.cover_url || null,
                followersCount: userFollowers ? userFollowers.length : 0,
                followingCount: userFollowing ? userFollowing.length : 0,
                postsCount: userPosts ? userPosts.length : 0
            },
            isFollowing: !!followRecord
        });
    } catch (err) {
        console.error('Error fetching user profile:', err);
        res.status(500).json({ message: 'Error al obtener el perfil' });
    }
});

// POST /users/:id/follow — Alterna el estado de seguimiento
router.post('/:id/follow', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const targetUserId = req.params.id;
        const currentUserId = req.user.id;

        if (targetUserId === currentUserId) {
            return res.status(400).json({ message: 'No puedes seguirte a ti mismo' });
        }

        void(`[FollowRoute] User ${currentUserId} attempting to toggle follow on ${targetUserId}`);

        const { data: followRecord, error: fetchError } = await supabase
            .from('followers')
            .select('*')
            .eq('follower_id', currentUserId)
            .eq('followed_id', targetUserId)
            .maybeSingle();

        if (fetchError) {
            console.error('[FollowRoute] Error fetching followRecord:', fetchError);
            throw fetchError;
        }

        if (followRecord) {
            void(`[FollowRoute] Already following. Unfollowing...`);
            const { error: deleteError } = await supabase
                .from('followers')
                .delete()
                .eq('follower_id', currentUserId)
                .eq('followed_id', targetUserId);
            if (deleteError) throw deleteError;
            return res.json({ message: 'Dejaste de seguir a este usuario', isFollowing: false });
        } else {
            void(`[FollowRoute] Not following. Inserting record and incrementing...`);
            const { error: insertError } = await supabase
                .from('followers')
                .insert({ follower_id: currentUserId, followed_id: targetUserId });
            if (insertError) {
                console.error('[FollowRoute] Error inserting into followers:', insertError);
                throw insertError;
            }

            // Actualizar cuenta de progreso de misión (RPC)
            void(`[FollowRoute] Calling increment_user_follows for ${currentUserId}`);
            const { error: rpcError } = await supabase.rpc('increment_user_follows', { user_uuid: currentUserId });
            if (rpcError) {
                console.error('[FollowRoute] RPC ERROR increment_user_follows:', rpcError);
            } else {
                void(`[FollowRoute] RPC success.`);
            }

            const justFunded = await checkAndFundQuest(currentUserId);
            return res.json({ message: 'Ahora sigues a este usuario', isFollowing: true, missionCompleted: justFunded });
        }
    } catch (err) {
        console.error('[FollowRoute] Fatal Error:', err);
        res.status(500).json({ message: 'Error al procesar la solicitud de seguimiento' });
    }
});

// GET /users/me/export — Exporta todos los posts
router.get('/me/export', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;

        const { data: posts, error } = await supabase
            .from('posts')
            .select('id, type, content, created_at')
            .eq('author_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const exported = (posts || []).map((post) => {
            const parts = (post.content || '').split('|||');
            let fileUrl = null;
            let cid = null;
            let caption = null;

            if (post.type === 'image') {
                if (parts[0].startsWith('http') || parts[0].startsWith('r2://')) {
                    fileUrl = parts[0].startsWith('http') ? parts[0] : null;
                    cid = parts[1] || null;
                    caption = parts[2] || null;
                } else {
                    cid = parts[0] || null;
                    caption = parts[1] || null;
                }
            } else if (post.type === 'video') {
                cid = parts[0] || null;
                caption = parts[1] || null;
                fileUrl = parts[2] ? `https://lvpr.tv/?v=${parts[2]}` : null;
            } else {
                caption = post.content;
            }

            return { postId: post.id, type: post.type, createdAt: post.created_at, cid, downloadUrl: fileUrl, caption };
        });

        res.json({
            userId,
            totalPosts: exported.length,
            exportedAt: new Date().toISOString(),
            posts: exported,
        });
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ message: 'Error al exportar el contenido' });
    }
});

// PUT /users/me — Actualiza perfil general (nombre y bio)
// PUT /users/me/public-key — Guardar llave pública E2EE
router.put('/me/public-key', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { publicKey } = req.body;
        if (!publicKey) return res.status(400).json({ message: 'Llave pública requerida' });

        const { error } = await supabase
            .from('users')
            .update({ public_key: publicKey })
            .eq('id', req.user.id);

        if (error) throw error;
        res.json({ saved: true });
    } catch (err) {
        console.error('Error saving public key:', err);
        res.status(500).json({ message: 'Error al guardar llave pública' });
    }
});

// GET /users/me/check-username?username=xxx — Verificar disponibilidad
router.get('/me/check-username', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const raw = req.query.username?.trim();

        if (!raw) return res.json({ available: false, error: 'Nombre requerido' });
        if (raw.length < 2 || raw.length > 30) {
            return res.json({ available: false, error: 'Entre 2 y 30 caracteres' });
        }
        if (!/^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9 ._-]+$/.test(raw)) {
            return res.json({ available: false, error: 'Solo letras, números, espacios, puntos y guiones' });
        }

        const dbUsername = raw.toLowerCase().replace(/\s+/g, '_');

        let data;
        try {
            const result = await supabase
                .from('users')
                .select('id')
                .eq('username', dbUsername)
                .maybeSingle();
            if (result.error) throw result.error;
            data = result.data;
        } catch {
            // username column no existe aún — no disponible hasta migrar
            return res.json({ available: false, error: 'Sistema de nombres no disponible — ejecuta la migración' });
        }

        res.json({
            available: !data,
            error: data ? 'Este nombre ya está en uso' : null
        });
    } catch (err) {
        console.error('Error checking username:', err);
        res.status(500).json({ available: false, error: 'Error al verificar' });
    }
});

// PUT /users/me/username — Establecer nombre de usuario (único, visible en toda la app)
router.put('/me/username', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;
        let username = req.body.username?.trim();

        if (!username) return res.status(400).json({ message: 'Nombre requerido' });

        // Validar: entre 2 y 30 caracteres, letras, números, espacios, puntos y guiones
        if (username.length < 2 || username.length > 30) {
            return res.status(400).json({ message: 'El nombre debe tener entre 2 y 30 caracteres' });
        }
        if (!/^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9 ._-]+$/.test(username)) {
            return res.status(400).json({ message: 'Solo letras, números, espacios, puntos y guiones' });
        }

        // El username a nivel BD se guarda en lowercase para unique check
        const dbUsername = username.toLowerCase().replace(/\s+/g, '_');

        // Verificar disponibilidad
        let existing;
        try {
            const result = await supabase
                .from('users')
                .select('id')
                .eq('username', dbUsername)
                .maybeSingle();
            if (result.error) throw result.error;
            existing = result.data;
        } catch {
            return res.status(400).json({ message: 'Sistema de nombres no disponible — ejecuta la migración SQL en Supabase' });
        }

        if (existing && existing.id !== userId) {
            return res.status(409).json({ message: 'Este nombre ya está en uso' });
        }

        // Actualizar username + display_name al mismo valor
        try {
            const { error } = await supabase
                .from('users')
                .update({ username: dbUsername, display_name: username })
                .eq('id', userId);
            if (error) throw error;
        } catch (updateErr) {
            if (updateErr.code === '42703') {
                return res.status(400).json({ message: 'Ejecuta la migración SQL en Supabase primero: ALTER TABLE users ADD COLUMN username TEXT UNIQUE' });
            }
            throw updateErr;
        }

        res.json({ username: dbUsername, displayName: username, message: 'Nombre guardado' });
    } catch (err) {
        console.error('Error setting username:', err);
        res.status(500).json({ message: 'Error al guardar nombre' });
    }
});

router.put('/me', authMiddleware, async (req, res) => {
    try {
        const { displayName, bio } = req.body;
        const supabase = getDB();
        
        const updates = {};
        if (displayName !== undefined) updates.display_name = displayName;
        if (bio !== undefined) updates.bio = bio;

        if (Object.keys(updates).length > 0) {
            const { error } = await supabase.from('users').update(updates).eq('id', req.user.id);
            if (error) throw error;
        }

        res.json({ message: 'Perfil actualizado correctamente', user: updates });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ message: 'Error al actualizar perfil' });
    }
});

// PUT /users/me/cover — Actualiza la imagen de portada del usuario
const uploadCover = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB para banners (son más anchos)
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Solo se permiten imágenes'), false);
    },
});

router.put('/me/cover', authMiddleware, uploadCover.single('cover'), handleMulterError, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No se recibió ninguna imagen' });
        }

        const r2AccountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
        let contentCID;
        let fileUrl;

        contentCID = generateFilename("cover");

        if (r2AccountId) {
            try {
                fileUrl = await uploadToR2(
                    req.file.buffer,
                    `cover-${req.user.id}-${contentCID}.webp`,
                    req.file.mimetype
                );
            } catch (r2Err) {
                console.error('R2 upload falló, guardando local:', r2Err.message);
                const localFilename = `cover-${req.user.id}-${contentCID}.jpg`;
                fs.writeFileSync(path.join(uploadsDir, localFilename), req.file.buffer);
                const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
                fileUrl = `${baseUrl}/uploads/${localFilename}`;
            }
        } else {
            console.warn('CLOUDFLARE_R2_ACCOUNT_ID no configurado — guardando local');
            const localFilename = `cover-${req.user.id}-${contentCID}.jpg`;
            fs.writeFileSync(path.join(uploadsDir, localFilename), req.file.buffer);
            const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
            fileUrl = `${baseUrl}/uploads/${localFilename}`;
        }

        const supabase = getDB();
        await supabase.from('users').update({ cover_url: fileUrl }).eq('id', req.user.id);

        res.status(200).json({
            coverUrl: fileUrl,
            message: 'Portada actualizada correctamente'
        });
    } catch (err) {
        console.error('Cover upload error:', err);
        res.status(500).json({ message: err.message || 'Error al actualizar portada' });
    }
});

// PUT /users/me/avatar — Actualiza la foto de perfil del usuario actual
router.put('/me/avatar', authMiddleware, upload.single('avatar'), handleMulterError, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No se recibió ninguna imagen' });
        }

        const r2AccountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
        let contentCID;
        let fileUrl;

        contentCID = generateFilename("avatar");

        // 2. Subir a R2 (o modo demo)
        if (r2AccountId) {
            try {
                fileUrl = await uploadToR2(
                    req.file.buffer,
                    `avatar-${req.user.id}-${contentCID}.webp`,
                    req.file.mimetype
                );
            } catch (r2Err) {
                console.error('R2 upload falló, guardando local:', r2Err.message);
                const localFilename = `avatar-${req.user.id}-${contentCID}.jpg`;
                fs.writeFileSync(path.join(uploadsDir, localFilename), req.file.buffer);
                const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
                fileUrl = `${baseUrl}/uploads/${localFilename}`;
            }
        } else {
            console.warn('CLOUDFLARE_R2_ACCOUNT_ID no configurado — guardando local');
            const localFilename = `avatar-${req.user.id}-${contentCID}.jpg`;
            fs.writeFileSync(path.join(uploadsDir, localFilename), req.file.buffer);
            const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
            fileUrl = `${baseUrl}/uploads/${localFilename}`;
        }

        // 3. Actualizar avatar_url en DB
        const supabase = getDB();
        await supabase.from('users').update({ avatar_url: fileUrl }).eq('id', req.user.id);

        res.status(200).json({
            avatarUrl: fileUrl,
            message: 'Avatar actualizado correctamente'
        });
    } catch (err) {
        console.error('Avatar upload error:', err);
        res.status(500).json({ message: err.message || 'Error al actualizar avatar' });
    }
});

// POST /users/tutorial-complete — Marca el tutorial como completado
router.post('/tutorial-complete', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { error } = await supabase
            .from('users')
            .update({ tutorial_completed: true })
            .eq('id', req.user.id);

        if (error) {
            console.error('Error saving tutorial:', error);
            return res.status(500).json({ message: 'Error al guardar progreso' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Tutorial error:', err);
        res.status(500).json({ message: 'Error interno' });
    }
});

// GET /users/me/verify-wallet — Fuerza la activación de trustlines y fondeo si hubo errores
router.get('/me/verify-wallet', authMiddleware, async (req, res) => {
    try {
        const { repairWallet } = await import('../services/quest.service.js');
        const result = await repairWallet(req.user.id);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (err) {
        console.error('Verify wallet error:', err);
        res.status(500).json({ message: 'Error al verificar la billetera' });
    }
});

export default router;
