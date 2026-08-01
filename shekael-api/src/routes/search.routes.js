import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';

const router = Router({ strict: false });

// GET /search?q=query — Buscar usuarios y posts locales
router.get('/', authMiddleware, async (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query.trim()) {
            return res.json({ users: [], posts: [] });
        }

        const supabase = getDB();
        const currentUserId = req.user.id;
        const searchTerm = `%${query.trim()}%`;

        // Fetch user following list
        const { data: followingRecords } = await supabase
            .from('followers')
            .select('followed_id')
            .eq('follower_id', currentUserId);
        const followingSet = new Set(followingRecords?.map(r => r.followed_id) || []);

        // ── 1. Buscar Usuarios locales ──
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, display_name, avatar_url, stellar_public_key, reputation_level')
            .ilike('display_name', searchTerm)
            .limit(10);

        if (usersError) throw usersError;

        const formattedUsers = users.map(u => ({
            ...u,
            displayName: u.display_name,
            avatarUrl: u.avatar_url,
            stellarPublicKey: u.stellar_public_key,
            reputationLevel: u.reputation_level,
            isFollowing: followingSet.has(u.id),
            _source: 'shekael',
        }));

        // ── 2. Buscar Posts locales con orden por relevancia ──
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
            .limit(50);

        if (postsError) throw postsError;

        // Ordenar por relevancia en JS: match exacto > contenido empieza con query > match en título > position en content
        const q = query.trim().toLowerCase();
        posts.sort((a, b) => {
            const aContent = (a.content || '').toLowerCase();
            const bContent = (b.content || '').toLowerCase();
            const aTitle = (a.video_title || '').toLowerCase();
            const bTitle = (b.video_title || '').toLowerCase();

            const scoreA = (
                (aContent === q ? 1000 : 0) +
                (aTitle === q ? 900 : 0) +
                (aContent.startsWith(q) ? 500 : 0) +
                (aTitle.startsWith(q) ? 400 : 0) +
                // Position in content: earlier = higher score
                Math.max(0, 100 - (aContent.indexOf(q) >= 0 ? aContent.indexOf(q) : 999)) +
                Math.max(0, 50 - (aTitle.indexOf(q) >= 0 ? aTitle.indexOf(q) : 999))
            );
            const scoreB = (
                (bContent === q ? 1000 : 0) +
                (bTitle === q ? 900 : 0) +
                (bContent.startsWith(q) ? 500 : 0) +
                (bTitle.startsWith(q) ? 400 : 0) +
                Math.max(0, 100 - (bContent.indexOf(q) >= 0 ? bContent.indexOf(q) : 999)) +
                Math.max(0, 50 - (bTitle.indexOf(q) >= 0 ? bTitle.indexOf(q) : 999))
            );

            if (scoreA !== scoreB) return scoreB - scoreA;
            return new Date(b.created_at) - new Date(a.created_at);
        });

        const formattedPosts = posts.map(p => ({
            ...p,
            display_name: p.author.display_name,
            stellar_public_key: p.author.stellar_public_key,
            avatar_url: p.author.avatar_url,
            has_liked: p.post_likes && p.post_likes.some(l => l.user_id === currentUserId),
            has_saved: p.post_saves && p.post_saves.some(s => s.user_id === currentUserId),
            comments_count: p.post_comments ? p.post_comments.length : 0,
            isFollowing: followingSet.has(p.author_id),
            _source: 'shekael',
        }));

        res.json({
            users: formattedUsers,
            posts: formattedPosts,
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ message: 'Error interno en la búsqueda' });
    }
});

export default router;
