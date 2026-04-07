import { Router } from 'express';
import multer from 'multer';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { checkAndFundQuest } from '../services/quest.service.js';
import { uploadToR2, computeCID } from '../services/ipfs.service.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

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

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, display_name, bio, stellar_public_key, avatar_url, cover_url, created_at')
            .eq('id', targetUserId)
            .single();

        if (!user || userError) {
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

        console.log(`[FollowRoute] User ${currentUserId} attempting to toggle follow on ${targetUserId}`);

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
            console.log(`[FollowRoute] Already following. Unfollowing...`);
            const { error: deleteError } = await supabase
                .from('followers')
                .delete()
                .eq('follower_id', currentUserId)
                .eq('followed_id', targetUserId);
            if (deleteError) throw deleteError;
            return res.json({ message: 'Dejaste de seguir a este usuario', isFollowing: false });
        } else {
            console.log(`[FollowRoute] Not following. Inserting record and incrementing...`);
            const { error: insertError } = await supabase
                .from('followers')
                .insert({ follower_id: currentUserId, followed_id: targetUserId });
            if (insertError) {
                console.error('[FollowRoute] Error inserting into followers:', insertError);
                throw insertError;
            }

            // Actualizar cuenta de progreso de misión (RPC)
            console.log(`[FollowRoute] Calling increment_user_follows for ${currentUserId}`);
            const { error: rpcError } = await supabase.rpc('increment_user_follows', { user_uuid: currentUserId });
            if (rpcError) {
                console.error('[FollowRoute] RPC ERROR increment_user_follows:', rpcError);
            } else {
                console.log(`[FollowRoute] RPC success.`);
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

        try {
            contentCID = await computeCID(req.file.buffer);
        } catch (e) {
            contentCID = `cover-${uuidv4().slice(0, 8)}`;
        }

        if (r2AccountId) {
            fileUrl = await uploadToR2(
                req.file.buffer,
                `cover-${req.user.id}-${contentCID}.webp`,
                req.file.mimetype
            );
        } else {
            console.warn('CLOUDFLARE_R2_ACCOUNT_ID no configurado — modo demo');
            fileUrl = `demo-cover://${contentCID}`;
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

        // 1. Calcular CID localmente para firma criptográfica
        try {
            contentCID = await computeCID(req.file.buffer);
        } catch (e) {
            console.error('Error calculando CID local:', e);
            contentCID = `avatar-${uuidv4().slice(0, 8)}`;
        }

        // 2. Subir a R2 (o modo demo)
        if (r2AccountId) {
            fileUrl = await uploadToR2(
                req.file.buffer,
                `avatar-${req.user.id}-${contentCID}.webp`,
                req.file.mimetype
            );
        } else {
            console.warn('CLOUDFLARE_R2_ACCOUNT_ID no configurado — modo demo');
            fileUrl = `demo-avatar://${contentCID}`;
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
