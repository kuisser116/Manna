/**
 * seed_demo_ad.js
 * 
 * Crea un anuncio de demo activo en Supabase para que aparezca en el feed.
 * 
 * Uso: node scripts/seed_demo_ad.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function seedDemoAd() {
    void('🌱 Creando anuncio de demo en Supabase...\n');

    // 1. Buscar un usuario para ser el anunciante de demo
    const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, email, display_name')
        .limit(1)
        .single();

    if (usersError || !users) {
        console.error('❌ No se encontró ningún usuario. Asegúrate de que haya al menos un usuario registrado.');
        process.exit(1);
    }

    void(`✅ Usando usuario como anunciante: ${users.display_name || users.email} (${users.id})`);

    // 2. Verificar si ya existe un anuncio activo
    const { data: existing } = await supabase
        .from('ads')
        .select('id, title, status')
        .eq('status', 'active')
        .limit(1)
        .single();

    if (existing) {
        void(`ℹ️  Ya existe un anuncio activo: "${existing.title}" (ID: ${existing.id})`);
        void('   No es necesario crear uno nuevo.\n');
        process.exit(0);
    }

    // 3. Insertar el anuncio de demo
    const adId = uuidv4();
    const { error: insertError } = await supabase.from('ads').insert({
        id: adId,
        advertiser_id: users.id,
        title: '🚀 Shekael — La Red Social que te Paga',
        description: 'Únete a Shekael y gana USDC por ver videos y crear contenido. ¡Tu tiempo vale!',
        media_url: 'https://pub-c009c323337e42b48a1815156b1b51d2.r2.dev/Shekael-demo-ad.png',
        media_type: 'banner',
        budget_usdc: 50.0,
        cpm: 1.0,
        status: 'active',           // ← Activo directamente para el demo
        target_audience: 'all',
        cta_label: 'Conoce Shekael',
        cta_url: 'https://Shekael.app',
        alt_text: 'Anuncio de Shekael - Gana USDC por usar redes sociales',
    });

    if (insertError) {
        console.error('❌ Error al insertar el anuncio:', insertError.message);
        process.exit(1);
    }

    void(`✅ Anuncio de demo creado:`);
    void(`   ID: ${adId}`);
    void(`   Título: 🚀 Shekael — La Red Social que te Paga`);
    void(`   Estado: active`);
    void(`   Budget: $50 USDC`);
    void(`   CPM: $1.00 USDC`);
    void('\n🎉 ¡Listo! El anuncio aparecerá en el feed después de cada 7 posts.');
    void('   Abre el feed y cierra/abre la app para que cargue el nuevo anuncio.\n');
}

seedDemoAd().catch(console.error);
