import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';

import authRoutes from './routes/auth.routes.js';
import postsRoutes from './routes/posts.routes.js';
import usersRoutes from './routes/users.routes.js';
import transactionsRoutes from './routes/transactions.routes.js';
import regionalFundRoutes from './routes/regional_fund.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import questsRoutes from './routes/quests.routes.js';
import moderationRoutes from './routes/moderation.routes.js';
import searchRoutes from './routes/search.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import anchorRoutes from './routes/anchor.routes.js';
import chatRoutes from './routes/chats.routes.js';

import getDB from './database/db.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración para que express-rate-limit funcione correctamente tras el proxy de Render
app.set('trust proxy', 1);

// ── CORS Bulletproof ──────────────────────────────
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    process.env.FRONTEND_URL,
].filter(Boolean);

// Interceptar TODOS los requests y aplicar CORS headers primero
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    // Responder inmediatamente a preflight sin llegar a los routers
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

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
app.use('/moderation', moderationRoutes);
app.use('/search', searchRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/anchor', anchorRoutes);
app.use('/chats', chatRoutes);


// ── Health check ─────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        project: 'Shekael API',
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

// ── Iniciar ───────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`
  🌾  ──────────────────────────────────────── 🌾
       Shekael API Gateway v0.4.0 · Puerto ${PORT}
       Almacenamiento: R2 (Cloudflare)
       Stellar: ${process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'}
  🌾  ──────────────────────────────────────── 🌾
  `);
});

export default app;
