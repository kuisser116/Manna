import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import getDB from './src/database/db.js';
dotenv.config();

const API_URL = 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET;

async function simulateReports(postId, numReports = 5) {
    const supabase = getDB();
    
    // 1. Obtener un usuario real para el token
    const { data: user } = await supabase.from('users').select('id, email, stellar_public_key').limit(1).single();
    if (!user) {
        console.error('No hay usuarios en la base de datos.');
        return;
    }

    // 2. Generar JWT para el usuario
    const token = jwt.sign(
        { id: user.id, email: user.email, stellarPublicKey: user.stellar_public_key },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    console.log(`🚀 Iniciando simulación de ${numReports} reportes vía API para el post: ${postId}`);
    console.log(`Usando token del usuario: ${user.id}`);

    for (let i = 0; i < numReports; i++) {
        process.stdout.write(`Enviando reporte ${i + 1}/${numReports}... `);
        try {
            const res = await fetch(`${API_URL}/moderation/report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ postId, reason: `Prueba automática ${i + 1}` })
            });
            const data = await res.json();
            if (res.ok) {
                console.log('✅ OK');
            } else {
                console.log(`❌ Error: ${data.message}`);
            }
        } catch (err) {
            console.log(`❌ Fallo de conexión: ${err.message}`);
        }
    }

    console.log('\n✨ Simulación completada.');
    console.log('👉 Revisa la terminal donde corre el servidor (manna-api) para ver los logs de la IA.');
}

const postId = process.argv[2];
const count = parseInt(process.argv[3]);

if (!postId) {
    console.log('Uso: node simulate_ban.js ID_DEL_POST [cantidad]');
} else {
    simulateReports(postId, count || 5);
}
