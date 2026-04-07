import getDB from '../database/db.js';

export const createNotification = async ({ userId, actorId, type, postId }) => {
    if (!userId || !actorId || userId === actorId) return;

    try {
        const supabase = getDB();
        
        const { error } = await supabase
            .from('notifications')
            .upsert({
                user_id: userId,
                actor_id: actorId,
                type,
                post_id: postId,
                is_read: false,
                created_at: new Date().toISOString()
            }, { onConflict: 'user_id, actor_id, type, post_id' });

        if (error) {
            console.error('[Notification DB Error]:', error.message);
        }
    } catch (err) {
        console.error('[Notification Error]:', err);
    }
};

export const getPostAuthorId = async (postId) => {
    try {
        const supabase = getDB();
        const { data } = await supabase.from('posts').select('author_id').eq('id', postId).single();
        return data?.author_id;
    } catch (e) {
        return null;
    }
};
