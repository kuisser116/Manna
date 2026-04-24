import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';

const router = Router({ strict: false });

// GET /search?q=query — Buscar usuarios y posts
router.get('/', authMiddleware, async (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query.trim()) {
            return res.json({ users: [], posts: [] });
        }

        const supabase = getDB();
        const currentUserId = req.user.id;
        const searchTerm = `%${query.trim()}%`;

        // 1. Buscar Usuarios
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, display_name, avatar_url, stellar_public_key, reputation_level')
            .ilike('display_name', searchTerm)
            .limit(10);

        if (usersError) throw usersError;

        // Fetch user following list to populate isFollowing flag for both users and posts
        const { data: followingRecords } = await supabase
            .from('followers')
            .select('followed_id')
            .eq('follower_id', currentUserId);
        const followingSet = new Set(followingRecords?.map(r => r.followed_id) || []);

        const formattedUsers = users.map(u => ({
            ...u,
            displayName: u.display_name,
            avatarUrl: u.avatar_url,
            stellarPublicKey: u.stellar_public_key,
            reputationLevel: u.reputation_level,
            isFollowing: followingSet.has(u.id)
        }));

        // 2. Buscar Posts (Texto, Imágenes, Videos)
        const { data: posts, error: postsError } = await supabase
            .from('posts')
            .select(`
                *,
                author:users!posts_author_id_fkey (id, display_name, stellar_public_key, avatar_url),
                post_likes (user_id),
                post_saves (user_id),
                post_comments (id)
            `)
            .eq('is_banned', false)
            .or(`content.ilike.${searchTerm},video_title.ilike.${searchTerm},video_description.ilike.${searchTerm}`)
            .order('created_at', { ascending: false })
            .limit(20);

        if (postsError) throw postsError;

        const formattedPosts = posts.map(p => ({
            ...p,
            display_name: p.author.display_name,
            stellar_public_key: p.author.stellar_public_key,
            avatar_url: p.author.avatar_url,
            has_liked: p.post_likes && p.post_likes.some(l => l.user_id === currentUserId),
            has_saved: p.post_saves && p.post_saves.some(s => s.user_id === currentUserId),
            comments_count: p.post_comments ? p.post_comments.length : 0,
            isFollowing: followingSet.has(p.author_id)
        }));

        res.json({ users: formattedUsers, posts: formattedPosts });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ message: 'Error interno en la búsqueda' });
    }
});

export default router;
