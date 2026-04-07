import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.routes.js';
import postsRoutes from './routes/posts.routes.js';
import usersRoutes from './routes/users.routes.js';
import transactionsRoutes from './routes/transactions.routes.js';
import regionalFundRoutes from './routes/regional_fund.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import questsRoutes from './routes/quests.routes.js';
import adsRoutes from './routes/ads.routes.js';
import moderationRoutes from './routes/moderation.routes.js';
import searchRoutes from './routes/search.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import anchorRoutes from './routes/anchor.routes.js';

import cron from 'node-cron';
import { cleanupExpiredLivepeerAssets, waitForLivepeerReady, repatriateHLS } from './services/hls-repatriate.js';
import getDB from './database/db.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración para que express-rate-limit funcione correctamente tras el proxy de Render
app.set('trust proxy', 1);

// ── Middlewares ──────────────────────────────────
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:4173',
        process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rutas ────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/posts', postsRoutes);
app.use('/transactions', transactionsRoutes);
app.use('/wallet', transactionsRoutes);
app.use('/regional-fund', regionalFundRoutes);
app.use('/admin', regionalFundRoutes);
app.use('/upload', uploadRoutes);
app.use('/quests', questsRoutes);
app.use('/ads', adsRoutes);
app.use('/moderation', moderationRoutes);
app.use('/search', searchRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/anchor', anchorRoutes);


// ── Health check ─────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        project: 'Manná API',
        version: '0.3.0',
        sprint: 'Sprint 3 — Comunidades + Apoyos + IA',
        pinata: !!process.env.PINATA_JWT,
        stellar: process.env.STELLAR_HORIZON_URL || 'testnet',
    });
});

// ── 404 ─────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ message: `Ruta ${req.path} no encontrada` });
});

// ── Error global ──────────────────────────────────
app.use((err, req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
});

// ── Daily HLS Cleanup Job ─────────────────────────────────
// Borra assets de Livepeer cuyo periodo de gracia de 7 días ya venció
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas
cleanupExpiredLivepeerAssets(); // Ejecutar al arrancar
setInterval(cleanupExpiredLivepeerAssets, CLEANUP_INTERVAL_MS);

// ── Polling Job: Check videos in 'processing' state ────────
// Verifica cada 30 segundos si los videos en transcodificación ya están listos
// Esto recupera videos que quedaron atascados si el servidor se reinició
const POLLING_INTERVAL_MS = 30_000; // 30 segundos

async function checkProcessingVideos() {
    const apiKey = process.env.LIVEPEER_API_KEY;
    if (!apiKey) return;

    const supabase = getDB();

    try {
        const { data: processing } = await supabase
            .from('posts')
            .select('id, video_asset_id, video_playback_id, created_at')
            .eq('video_status', 'processing')
            .not('video_asset_id', 'is', null)
            .not('video_playback_id', 'is', null);

        if (!processing?.length) return;

        console.log(`[PollingJob] ${processing.length} videos en estado 'processing'...`);

        for (const post of processing) {
            try {
                const { data: currentStatus } = await supabase.from('posts').select('video_status').eq('id', post.id).single();
                
                if (currentStatus?.video_status === 'raw') {
                    console.log(`[PollingJob] ℹ️  Post ${post.id} ya está en 'raw'. Saltando.`);
                    continue;
                }
                
                const asset = await waitForLivepeerReady(post.video_asset_id);
                if (asset) {
                    console.log(`[PollingJob] ✅ Post ${post.id} listo para repatriar`);
                    await repatriateHLS(post.id, post.video_asset_id, post.video_playback_id);
                }
            } catch (err) {
                console.error(`[PollingJob] ❌ Error verificando post ${post.id}:`, err.message);
                
                if (err.message.includes('falló') || err.message.includes('manifest no es válido') || err.message.includes('después de 5 intentos')) {
                    console.log(`[PollingJob] 🔄 Revertiendo post ${post.id} a 'raw' (fallback)`);
                    await supabase.from('posts').update({ video_status: 'raw' }).eq('id', post.id);
                }
            }
        }
    } catch (err) {
        console.error('[PollingJob] Error en job de polling:', err.message);
    }
}

checkProcessingVideos(); // Ejecutar al arrancar
setInterval(checkProcessingVideos, POLLING_INTERVAL_MS);

// ── Iniciar ───────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`
  🌾  ──────────────────────────────────────── 🌾
       Manná API Gateway v0.3.0 · Puerto ${PORT}
       R2-Native HLS Pipeline activado
       Stellar: ${process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'}
       Pinata:  ${process.env.PINATA_JWT ? '✅ Configurado' : '⚠️  Sin JWT (imágenes en modo demo)'}
       Livepeer:${process.env.LIVEPEER_API_KEY ? '✅ Configurado' : '⚠️  Sin API Key'}
       Webhooks: ${process.env.WEBHOOK_URL || '⚠️  No configurado (usando polling fallback)'}
  🌾  ──────────────────────────────────────── 🌾
  `);
});

export default app;
