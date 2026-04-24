import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { checkAndFundQuest } from '../services/quest.service.js';
import { triggerTranscoding } from '../services/livepeer.service.js';
import { analyzeContentWithAI } from '../services/moderation.service.js';
import { createNotification, getPostAuthorId } from '../services/notifications.service.js';
import { deleteFromR2 } from '../services/ipfs.service.js';

const router = Router();

// ─── Helper: intercala cápsulas cada 5 posts ─────────────────────
function weaveCapsulesIntoFeed(regularPosts, capsulePosts) {
    const result = [];
    let capsuleIdx = 0;
    for (let i = 0; i < regularPosts.length; i++) {
        result.push(regularPosts[i]);
        // Cada 5 posts regulares, insertar 1 cápsula de Aseria
        if ((i + 1) % 5 === 0 && capsuleIdx < capsulePosts.length) {
            result.push({ ...capsulePosts[capsuleIdx], _injected: true });
            capsuleIdx++;
        }
    }
    return result;
}

// GET /posts/feed — Feed con algoritmo: score + cápsulas intercaladas
router.get('/feed', authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const limit = 15;
        const offset = page * limit;
        const currentUserId = req.user.id;
        const supabase = getDB();

        // 1. Obtener posts regulares (No cápsulas)
        // Nota: El algoritmo de ordenamiento complejo se simplifica para Supabase-JS 
        // o se puede mover a un RPC si el ordenamiento por seguidores/likes es crítico.
        const { data: regularPosts, error: regError } = await supabase
            .from('posts')
            .select(`
                *,
                author:users!posts_author_id_fkey (id, display_name, stellar_public_key, avatar_url),
                post_likes (user_id),
                post_saves (user_id),
                post_comments (id)
            `)
            .eq('is_banned', false)
            .neq('type', 'capsule')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (regError) throw regError;

        // 2. Obtener cápsulas para intercalar
        const { data: capsulePosts, error: capError } = await supabase
            .from('posts')
            .select(`
                *,
                author:users!posts_author_id_fkey (id, display_name, stellar_public_key, avatar_url),
                post_comments (id)
            `)
            .eq('is_banned', false)
            .eq('type', 'capsule')
            .order('supports_count', { ascending: false })
            .limit(5);

        if (capError) throw capError;

        // Fetch user following list to populate isFollowing flag
        const { data: followingRecords } = await supabase
            .from('followers')
            .select('followed_id')
            .eq('follower_id', currentUserId);
        const followingSet = new Set(followingRecords?.map(r => r.followed_id) || []);

        // Formatear posts para que coincidan con la estructura esperada por el frontend
        const formattedPosts = regularPosts.map(p => ({
            ...p,
            display_name: p.author.display_name,
            stellar_public_key: p.author.stellar_public_key,
            avatar_url: p.author.avatar_url,
            has_liked: p.post_likes && p.post_likes.some(l => l.user_id === currentUserId),
            has_saved: p.post_saves && p.post_saves.some(s => s.user_id === currentUserId),
            comments_count: p.post_comments ? p.post_comments.length : 0,
            isFollowing: followingSet.has(p.author_id)
        }));

        const formattedCapsules = capsulePosts.map(p => ({
            ...p,
            display_name: p.author.display_name,
            stellar_public_key: p.author.stellar_public_key,
            avatar_url: p.author.avatar_url,
            has_liked: false, // Simplificado
            comments_count: p.post_comments ? p.post_comments.length : 0,
            isFollowing: followingSet.has(p.author_id)
        }));

        const feed = weaveCapsulesIntoFeed(formattedPosts, formattedCapsules);

        res.json({ posts: feed, page, hasMore: regularPosts.length === limit });
    } catch (err) {
        console.error('Feed error:', err);
        res.status(500).json({ message: 'Error al cargar el feed' });
    }
});

// POST /posts/create — Crear post
router.post('/create', authMiddleware, async (req, res) => {
    try {
        const { type = 'micro-text', content, contentCID, contentType = 'standard' } = req.body;
        if (!content && !contentCID) {
            return res.status(400).json({ message: 'Se requiere contenido' });
        }

        const supabase = getDB();
        const postId = uuidv4();
        const finalContent = contentCID || content;

        // --- Moderación Automática por IA ---
        const aiCheck = await analyzeContentWithAI(finalContent, type);
        if (aiCheck.verdict === 'rejected' && aiCheck.confidence > 0.8) {
            return res.status(400).json({ 
                message: 'Contenido rechazado por nuestras normas de comunidad',
                reason: aiCheck.reason 
            });
        }

        const { data: post, error } = await supabase
            .from('posts')
            .insert({
                id: postId,
                author_id: req.user.id,
                type,
                content: finalContent,
                trust_deposit_locked: true
            })
            .select(`
                *,
                author:users!posts_author_id_fkey (display_name, stellar_public_key)
            `)
            .single();

        if (error) throw error;

        // Aplanar para el frontend
        const formattedPost = {
            ...post,
            display_name: post.author.display_name,
            stellar_public_key: post.author.stellar_public_key,
            comments_count: 0
        };

        res.status(201).json({ post: formattedPost });
    } catch (err) {
        console.error('Create post error:', err);
        res.status(500).json({ message: 'Error al crear post' });
    }
});

// GET /posts/user/my-stats — Estadísticas para el Aseria Studio
router.get('/user/my-stats', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const userId = req.user.id;

        const { data: posts, error } = await supabase
            .from('posts')
            .select(`
                id,
                type,
                content,
                video_title,
                video_thumbnail_url,
                video_view_count,
                likes_count,
                supports_count,
                is_banned,
                created_at
            `)
            .eq('author_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ posts });
    } catch (err) {
        console.error('Error fetching creator stats:', err);
        res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
});

// GET /posts/user/:userId — Posts de un usuario específico
router.get('/user/:userId', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { data: posts, error } = await supabase
            .from('posts')
            .select(`
                *,
                author:users!posts_author_id_fkey (display_name, stellar_public_key, avatar_url),
                post_likes (user_id),
                post_saves (user_id),
                post_comments (id)
            `)
            .eq('author_id', req.params.userId)
            .eq('is_banned', false)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        const formattedPosts = posts.map(p => ({
            ...p,
            display_name: p.author.display_name,
            stellar_public_key: p.author.stellar_public_key,
            avatar_url: p.author.avatar_url,
            has_liked: p.post_likes && p.post_likes.some(l => l.user_id === req.user.id),
            has_saved: p.post_saves && p.post_saves.some(s => s.user_id === req.user.id),
            comments_count: p.post_comments ? p.post_comments.length : 0
        }));

        res.json({ posts: formattedPosts });
    } catch (err) {
        console.error('User posts error:', err);
        res.status(500).json({ message: 'Error al obtener los posts del usuario' });
    }
});

// POST /posts/:postId/like — Dar un corazón gratuito
router.post('/:postId/like', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const postId = req.params.postId;
        const currentUserId = req.user.id;

        // Verificar que no sea el autor del post
        const { data: targetPost } = await supabase.from('posts').select('author_id').eq('id', postId).single();
        if (targetPost && targetPost.author_id === currentUserId) {
            return res.status(400).json({ message: 'No puedes dar like a tu propia publicación' });
        }

        // Ver si ya le dio like
        const { data: likeRecord, error: fetchError } = await supabase
            .from('post_likes')
            .select('*')
            .eq('user_id', currentUserId)
            .eq('post_id', postId)
            .single();

        if (!likeRecord && (fetchError?.code === 'PGRST116' || !fetchError)) {
            // Guardar like
            const { error: insertError } = await supabase
                .from('post_likes')
                .insert({ user_id: currentUserId, post_id: postId });

            if (insertError) throw insertError;

            // Incrementar likes del post (RPC)
            const { error: incrementLikesError } = await supabase.rpc('increment_likes', { post_uuid: postId });
            if (incrementLikesError) console.error('[RPC Error] increment_likes:', incrementLikesError);

            // Actualizar cuenta de progreso de misión (RPC o Update directo)
            const { error: rpcError } = await supabase.rpc('increment_user_likes', { user_uuid: currentUserId });
            if (rpcError) console.error('[RPC Error] increment_user_likes:', rpcError);

            // Ejecutar el validador
            const justFunded = await checkAndFundQuest(currentUserId);

            // Notificación (Like)
            const authorId = await getPostAuthorId(postId);
            if (authorId) {
                await createNotification({ userId: authorId, actorId: currentUserId, type: 'like', postId });
            }

            res.json({ message: 'Like registrado', liked: true, missionCompleted: justFunded });
        } else {
            // Ya tiene like -> Remover Like (Unlike)
            const { error: deleteError } = await supabase
                .from('post_likes')
                .delete()
                .eq('user_id', currentUserId)
                .eq('post_id', postId);

            if (deleteError) throw deleteError;

            // Decrementar likes del post (RPC)
            const { error: decrementLikesError } = await supabase.rpc('decrement_likes', { post_uuid: postId });
            if (decrementLikesError) console.error('[RPC Error] decrement_likes:', decrementLikesError);

            // Decrementar progreso del usuario (RPC)
            const { error: rpcError } = await supabase.rpc('decrement_user_likes', { user_uuid: currentUserId });
            if (rpcError) console.error('[RPC Error] decrement_user_likes:', rpcError);

            res.json({ message: 'Like removido', liked: false, missionCompleted: false });
        }
    } catch (err) {
        console.error('Like error:', err);
        res.status(500).json({ message: 'Error al registrar el like' });
    }
});

// POST /posts/:postId/unlike — Quitar un like
router.post('/:postId/unlike', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const postId = req.params.postId;
        const currentUserId = req.user.id;

        // Ver si existe el like
        const { data: likeRecord, error: fetchError } = await supabase
            .from('post_likes')
            .select('*')
            .eq('user_id', currentUserId)
            .eq('post_id', postId)
            .single();

        if (likeRecord && (!fetchError || fetchError.code === 'PGRST116')) { // Si existe el like
            // Eliminar like
            const { error: deleteError } = await supabase
                .from('post_likes')
                .delete()
                .eq('user_id', currentUserId)
                .eq('post_id', postId);

            if (deleteError) throw deleteError;

            // Decrementar likes del post de forma manual o RPC
            // Primero intentamos la forma directa
            const { data: post } = await supabase.from('posts').select('likes_count').eq('id', postId).single();
            if (post && post.likes_count > 0) {
                await supabase.from('posts').update({ likes_count: post.likes_count - 1 }).eq('id', postId);
            }

            res.json({ message: 'Like removido', liked: false });
        } else {
            res.json({ message: 'No has dado like a esta publicación', liked: false });
        }
    } catch (err) {
        console.error('Unlike error:', err);
        res.status(500).json({ message: 'Error al remover el like' });
    }
});

// POST /posts/:postId/view — Registrar vista
router.post('/:postId/view', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const postId = req.params.postId;
        const { watchedSeconds = 0, videoDuration = 0 } = req.body || {};

        const { data: post, error: postError } = await supabase
            .from('posts')
            .select('*')
            .eq('id', postId)
            .single();

        if (!post || postError) return res.status(404).json({ message: 'Post no encontrado' });

        // Evitar que las vistas del propio autor sumen al contador
        if (post.author_id === req.user.id) {
            return res.json({ 
                message: 'Vista propia (no suma al contador global)', 
                views: post.video_view_count, 
                addedSeconds: 0 
            });
        }

        if (post.type === 'video') {
            // Si no hay duración (videoDuration = 0 o undefined), usamos un mínimo default de 10s
            const duration = Number(videoDuration) || post.video_duration || 0;
            const minRequired = duration > 0 
                ? Math.min(30, duration * 0.8)
                : 10;

            if (watchedSeconds < minRequired) {
                return res.status(400).json({
                    message: `Vista insuficiente`,
                    watchedSeconds,
                    minRequired: Math.ceil(minRequired)
                });
            }
        }

        // 1. Obtener todas las vistas/heartbeats de hoy para este post/usuario
        const { data: todayViews, error: fetchError } = await supabase
            .from('video_views')
            .select('watched_seconds')
            .eq('post_id', postId)
            .eq('user_id', req.user.id)
            .gt('viewed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        const totalWatchedSoFar = (todayViews || []).reduce((acc, v) => acc + (v.watched_seconds || 0), 0);
        const remainder = Math.max(0, watchedSeconds - totalWatchedSoFar);

        // solo insertamos si hay segundos nuevos (ej. lo que no cubrió el último heartbeat)
        if (remainder > 0) {
            await supabase.from('video_views').insert({
                id: uuidv4(),
                post_id: postId,
                user_id: req.user.id,
                watched_seconds: remainder
            });

            // Incrementar progreso del usuario (solo por el remanente)
            await supabase.rpc('increment_user_watch_seconds', { 
                user_uuid: req.user.id, 
                seconds: remainder 
            });
            
            // Re-verificar si completó misiones
            await checkAndFundQuest(req.user.id);
        }

        // 2. Incrementar el contador global del post SOLO si es la primera interacción del día
        if (!todayViews || todayViews.length === 0) {
            await supabase.rpc('increment_video_views', { post_uuid: postId });
            
            if (post.type === 'video' && post.video_status === 'raw' && (post.video_view_count + 1) >= 50) {
                triggerTranscoding(postId, post.video_r2_url).catch(() => { });
            }
        }

        res.json({ 
            message: 'Vista sincronizada', 
            views: (todayViews?.length > 0) ? post.video_view_count : (post.video_view_count + 1),
            addedSeconds: remainder 
        });
    } catch (err) {
        console.error('View error:', err);
        res.status(500).json({ message: 'Error al registrar vista' });
    }
});


// GET /posts/:postId — Obtener un post y sus comentarios
router.get('/:postId', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const postId = req.params.postId;
        const currentUserId = req.user.id;

        let query = supabase
            .from('posts')
            .select(`
                *,
                author:users!posts_author_id_fkey (display_name, stellar_public_key, avatar_url),
                post_likes (user_id)
            `)
            .eq('id', postId);

        const { data: userData } = await supabase.from('users').select('is_admin').eq('id', currentUserId).single();
        const isAdmin = !!(req.user.is_admin || userData?.is_admin);

        const { data: post, error: postError } = await query.maybeSingle();
        console.log(`[GET /posts/${postId}] post found:`, !!post, 'error:', postError);

        if (!post || postError) return res.status(404).json({ message: 'Post no encontrado' });

        // Si está baneado, solo el autor o un admin pueden verlo
        if (post.is_banned && !isAdmin && post.author_id !== currentUserId) {
            return res.status(403).json({ message: 'Esta publicación ha sido suspendida' });
        }

        const { data: comments, error: commentError } = await supabase
            .from('post_comments')
            .select(`
                *,
                author:users!post_comments_author_id_fkey (display_name, stellar_public_key, avatar_url)
            `)
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        const formattedPost = {
            ...post,
            display_name: post.author.display_name,
            stellar_public_key: post.author.stellar_public_key,
            avatar_url: post.author.avatar_url,
            has_liked: post.post_likes && post.post_likes.some(l => l.user_id === currentUserId),
            comments_count: comments ? comments.length : 0
        };

        const formattedComments = (comments || []).map(c => ({
            ...c,
            display_name: c.author.display_name,
            stellar_public_key: c.author.stellar_public_key,
            avatar_url: c.author.avatar_url
        }));

        res.json({ post: formattedPost, comments: formattedComments });
    } catch (err) {
        console.error('Post detail error:', err);
        res.status(500).json({ message: 'Error al obtener el post' });
    }
});

// POST /posts/:postId/comments — Agregar un comentario
router.post('/:postId/comments', authMiddleware, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ message: 'El comentario no puede estar vacío' });
        }

        const supabase = getDB();
        const postId = req.params.postId;
        const commentId = uuidv4();

        const { data: newComment, error } = await supabase
            .from('post_comments')
            .insert({
                id: commentId,
                post_id: postId,
                author_id: req.user.id,
                content: content.trim()
            })
            .select(`
                *,
                author:users!post_comments_author_id_fkey (display_name, stellar_public_key)
            `)
            .single();

        if (error) throw error;

        const formattedComment = {
            ...newComment,
            display_name: newComment.author.display_name,
            stellar_public_key: newComment.author.stellar_public_key
        };

        // Notificación (Comment)
        const authorId = await getPostAuthorId(postId);
        if (authorId) {
            await createNotification({ userId: authorId, actorId: req.user.id, type: 'comment', postId });
        }

        res.status(201).json({ comment: formattedComment });
    } catch (err) {
        console.error('Create comment error:', err);
        res.status(500).json({ message: 'Error al crear comentario' });
    }
});

// GET /posts/liked/:userId — Posts que le gustan a un usuario
router.get('/liked/:userId', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { userId } = req.params;
        const currentUserId = req.user.id;

        // Primero obtener los IDs de los posts que le gustan
        const { data: likes, error: likesError } = await supabase
            .from('post_likes')
            .select('post_id')
            .eq('user_id', userId);

        if (likesError) throw likesError;

        if (!likes || likes.length === 0) {
            return res.json({ posts: [] });
        }

        const postIds = likes.map(l => l.post_id);

        const { data: posts, error: postsError } = await supabase
            .from('posts')
            .select(`
                *,
                author:users!posts_author_id_fkey (display_name, stellar_public_key, avatar_url),
                post_likes (user_id),
                post_saves (user_id),
                post_comments (id)
            `)
            .in('id', postIds)
            .eq('is_banned', false)
            .order('created_at', { ascending: false });

        if (postsError) throw postsError;

        const formattedPosts = posts.map(p => ({
            ...p,
            display_name: p.author.display_name,
            stellar_public_key: p.author.stellar_public_key,
            avatar_url: p.author.avatar_url,
            has_liked: p.post_likes && p.post_likes.some(l => l.user_id === currentUserId),
            has_saved: p.post_saves && p.post_saves.some(s => s.user_id === currentUserId),
            comments_count: p.post_comments ? p.post_comments.length : 0
        }));

        res.json({ posts: formattedPosts });
    } catch (err) {
        console.error('Liked posts error:', err);
        res.status(500).json({ message: 'Error al obtener los likes' });
    }
});

// GET /posts/bookmarks — Posts guardados por el usuario actual (Personal)
router.get('/bookmarks/me', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const currentUserId = req.user.id;

        const { data: saves, error: savesError } = await supabase
            .from('post_saves')
            .select('post_id')
            .eq('user_id', currentUserId);

        if (savesError) throw savesError;

        if (!saves || saves.length === 0) {
            return res.json({ posts: [] });
        }

        const postIds = saves.map(s => s.post_id);

        const { data: posts, error: postsError } = await supabase
            .from('posts')
            .select(`
                *,
                author:users!posts_author_id_fkey (display_name, stellar_public_key, avatar_url),
                post_likes (user_id),
                post_saves (user_id),
                post_comments (id)
            `)
            .in('id', postIds)
            .eq('is_banned', false)
            .order('created_at', { ascending: false });

        if (postsError) throw postsError;

        const formattedPosts = posts.map(p => ({
            ...p,
            display_name: p.author.display_name,
            stellar_public_key: p.author.stellar_public_key,
            avatar_url: p.author.avatar_url,
            has_liked: p.post_likes && p.post_likes.some(l => l.user_id === currentUserId),
            has_saved: true, // Por definición están guardados
            comments_count: p.post_comments ? p.post_comments.length : 0
        }));

        res.json({ posts: formattedPosts });
    } catch (err) {
        console.error('Bookmarks error:', err);
        res.status(500).json({ message: 'Error al obtener los guardados' });
    }
});

// POST /posts/:postId/save — Alternar guardado (Bookmark)
router.post('/:postId/save', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { postId } = req.params;
        const currentUserId = req.user.id;

        // Ver si ya está guardado
        const { data: existing, error: fetchError } = await supabase
            .from('post_saves')
            .select('*')
            .eq('user_id', currentUserId)
            .eq('post_id', postId)
            .single();

        if (existing) {
            // Unsave
            const { error: deleteError } = await supabase
                .from('post_saves')
                .delete()
                .eq('user_id', currentUserId)
                .eq('post_id', postId);
            if (deleteError) throw deleteError;
            return res.json({ message: 'Post eliminado de guardados', saved: false });
        } else {
            // Save
            const { error: insertError } = await supabase
                .from('post_saves')
                .insert({ user_id: currentUserId, post_id: postId });
            if (insertError) throw insertError;

            // Notificación (Save) - Opcional, pero se añade según requerimiento
            const authorId = await getPostAuthorId(postId);
            if (authorId) {
                await createNotification({ userId: authorId, actorId: currentUserId, type: 'save', postId });
            }

            return res.json({ message: 'Post guardado', saved: true });
        }
    } catch (err) {
        console.error('Save toggle error:', err);
        res.status(500).json({ message: 'Error al guardar el post' });
    }
});


// DELETE /posts/:postId — Eliminar una publicación (Propia o Admin)
router.delete('/:postId', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { postId } = req.params;
        const currentUserId = req.user.id;

        // 1. Obtener datos del post para verificar autoría y archivos
        const { data: post, error: fetchError } = await supabase
            .from('posts')
            .select('*')
            .eq('id', postId)
            .single();

        if (fetchError || !post) return res.status(404).json({ message: 'Post no encontrado' });

        // Verificar si es el autor o admin consultando la BD
        const { data: userData } = await supabase.from('users').select('is_admin').eq('id', currentUserId).single();
        const isAdmin = !!(req.user.is_admin || userData?.is_admin);

        if (post.author_id !== currentUserId && !isAdmin) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar esta publicación' });
        }

        // 2. Extraer llaves de archivos de R2 para limpieza
        const filesToDelete = [];
        if (post.type === 'image' && post.content.includes('http')) {
             const url = post.content.split('|||')[0];
             const key = url.split('/').pop();
             if (key) filesToDelete.push(key);
        }
        if (post.type === 'video') {
            if (post.video_r2_url) filesToDelete.push(post.video_r2_url.split('/').pop());
            if (post.video_thumbnail_url) filesToDelete.push(post.video_thumbnail_url.split('/').pop());
        }

        // 3. Borrado en Cascada (Manual)
        await supabase.from('post_likes').delete().eq('post_id', postId);
        await supabase.from('post_comments').delete().eq('post_id', postId);
        await supabase.from('post_reports').delete().eq('post_id', postId);
        await supabase.from('post_saves').delete().eq('post_id', postId);
        await supabase.from('video_views').delete().eq('post_id', postId);
        await supabase.from('academy_completions').delete().eq('post_id', postId);
        
        // El post principal
        const { error: deletePostError } = await supabase.from('posts').delete().eq('id', postId);
        if (deletePostError) throw deletePostError;

        // 4. Limpieza de R2 (Asíncrona)
        filesToDelete.forEach(key => {
            deleteFromR2(key).catch(err => console.error(`[Cleanup Error] No se pudo borrar ${key}:`, err));
        });

        res.json({ message: 'Publicación eliminada correctamente' });
    } catch (err) {
        console.error('Delete post error:', err);
        res.status(500).json({ message: 'Error al eliminar la publicación' });
    }
});

export default router;
