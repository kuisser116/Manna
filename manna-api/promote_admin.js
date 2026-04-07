import getDB from './src/database/db.js';
import dotenv from 'dotenv';
dotenv.config();

const email = process.argv[2];

if (!email) {
    console.log('Uso: node promote_admin.js TU_EMAIL');
    process.exit();
}

async function promote() {
    const supabase = getDB();
    console.log(`Buscando usuario con email: ${email}...`);

    const { data: user, error: findError } = await supabase
        .from('users')
        .select('id, display_name')
        .eq('email', email)
        .single();

    if (findError || !user) {
        console.error('No se encontró el usuario. Asegúrate de que el email sea exacto.');
        return;
    }

    console.log(`Promoviendo a ${user.display_name} (${user.id}) a Administrador...`);

    const { error: updateError } = await supabase
        .from('users')
        .update({ is_admin: true })
        .eq('id', user.id);

    if (updateError) {
        console.error('Error al actualizar:', updateError.message);
    } else {
        console.log('🚀 ¡Éxito! Ahora eres Administrador de Manná.');
        console.log('Reinicia tu sesión en el frontend (Logout/Login) para obtener el nuevo token.');
    }
}

promote();
