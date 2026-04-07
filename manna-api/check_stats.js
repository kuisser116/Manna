import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkStats() {
    console.log('📊 Consultando estadísticas de usuarios en Supabase...\n');
    
    const { data: users, error } = await supabase
        .from('users')
        .select('email, display_name, current_follows, current_likes, current_watch_seconds, target_follows, target_likes, target_watch_seconds');

    if (error) {
        console.error('❌ Error al consultar:', error.message);
        return;
    }

    if (!users || users.length === 0) {
        console.log('ℹ️ No hay usuarios registrados.');
        return;
    }

    console.table(users.map(u => ({
        Email: u.email,
        Nombre: u.display_name || 'N/A',
        'Seguidores (Act/Obj)': `${u.current_follows || 0} / ${u.target_follows || 0}`,
        'Likes (Act/Obj)': `${u.current_likes || 0} / ${u.target_likes || 0}`,
        'Vista seg (Act/Obj)': `${u.current_watch_seconds || 0} / ${u.target_watch_seconds || 0}`
    })));
}

checkStats();
