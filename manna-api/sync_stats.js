import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function syncStats() {
    console.log('🔄 Sincronizando estadísticas desde tablas de relación...\n');

    // 1. Obtener todos los usuarios
    const { data: users, error: usersError } = await supabase.from('users').select('id, email');
    if (usersError) return console.error('Error users:', usersError);

    for (const user of users) {
        console.log(`[${user.email}] Sincronizando...`);

        // A. Contar Seguidores (donde el usuario es el seguidor)
        const { count: followsCount, error: fError } = await supabase
            .from('followers')
            .select('*', { count: 'exact', head: true })
            .eq('follower_id', user.id);

        // B. Contar Likes
        const { count: likesCount, error: lError } = await supabase
            .from('post_likes')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        // C. Sumar segundos de video
        const { data: views, error: vError } = await supabase
            .from('video_views')
            .select('watched_seconds')
            .eq('user_id', user.id);
        
        const totalWatch = (views || []).reduce((acc, curr) => acc + (curr.watched_seconds || 0), 0);

        // Actualizar tabla users
        const { error: updateError } = await supabase
            .from('users')
            .update({
                current_follows: followsCount || 0,
                current_likes: likesCount || 0,
                current_watch_seconds: totalWatch || 0
            })
            .eq('id', user.id);

        if (updateError) {
            console.error(`   ❌ Error actualizando ${user.email}:`, updateError.message);
        } else {
            console.log(`   ✅ Sincronizado: Follows=${followsCount}, Likes=${likesCount}, Watch=${totalWatch}s`);
        }
    }
    console.log('\n✨ Sincronización terminada.');
}

syncStats();
