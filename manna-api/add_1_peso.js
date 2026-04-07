import 'dotenv/config';
import { triggerDistribution } from './src/services/ads.service.js';
import getDB from './src/database/db.js';

async function main() {
    const publicKey = process.env.MANNA_DEV_WALLET;
    if (!publicKey) {
        console.error('❌ No se encontró MANNA_DEV_WALLET en el .env');
        process.exit(1);
    }

    const supabase = getDB();
    const { data: user, error } = await supabase
        .from('users')
        .select('id, email')
        .eq('stellar_public_key', publicKey)
        .single();

    if (error || !user) {
        console.error('❌ No se encontró el usuario en la DB con esa wallet:', error?.message);
        process.exit(1);
    }

    console.log(`💰 Aumentando balance para: ${user.email}`);
    console.log(`🔑 Wallet: ${publicKey}`);

    try {
        // fallback-manna-1 garantiza un payout de 1.0 MXNc según la lógica de ads.service.js
        const result = await triggerDistribution(
            user.id, 
            'fallback-manna-1', 
            null, 
            15, 
            'manual-debug-token', 
            'feed'
        );
        console.log('\n✅ Balance aumentado exitosamente en +1.00 MXNc.');
        console.log('🚀 Si el frontend está abierto, solo dale clic al icono de actualización en la billetera.');
    } catch (err) {
        console.error('\n❌ Error al ejecutar la distribución:', err.message);
    }
    process.exit(0);
}

main();
