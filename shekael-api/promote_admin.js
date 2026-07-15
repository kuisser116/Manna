import getDB from './src/database/db.js';
import dotenv from 'dotenv';
dotenv.config();

const email = process.argv[2];

if (!email) {
    void('Uso: node promote_admin.js TU_EMAIL');
    process.exit();
}

async function promote() {
    const supabase = getDB();
    void(`Buscando usuario con email: ${email}...`);

    const { data: user, error: findError } = await supabase
        .from('users')
        .select('id, display_name')
        .eq('email', email)
        .single();

    if (findError || !user) {
        console.error('No se encontró el usuario. Asegúrate de que el email sea exacto.');
        return;
    }

    void(`Promoviendo a ${user.display_name} (${user.id}) a Administrador...`);

    const { error: updateError } = await supabase
        .from('users')
        .update({ is_admin: true })
        .eq('id', user.id);

    if (updateError) {
        console.error('Error al actualizar:', updateError.message);
    } else {
        void('🚀 ¡Éxito! Ahora eres Administrador de Shekael.');
        void('Reinicia tu sesión en el frontend (Logout/Login) para obtener el nuevo token.');
    }
}

promote();
