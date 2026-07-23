import dotenv from 'dotenv';
dotenv.config({ override: true });
import http from 'http';
import express from 'express';
import helmet from 'helmet';

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
import businessesRoutes from './routes/businesses.routes.js';
import paymentsRoutes from './routes/payments.routes.js';
import musicRoutes from './routes/music.routes.js';
import adminRoutes from './routes/admin.routes.js';
import adsRoutes from './routes/ads.routes.js';

import { apiLimiter, uploadLimiter, chatLimiter } from './middleware/rateLimiter.js';
import { initSocketIO } from './services/socket.js';

import getDB from './database/db.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración para que express-rate-limit funcione correctamente tras el proxy de Render
app.set('trust proxy', 1);

// ── Seguridad: Helmet ────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false, // Desactivado porque el frontend maneja su propio CSP
    crossOriginEmbedderPolicy: false,
}));

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

// ── Archivos subidos localmente ────────────────
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ── Rate Limiting Global ──────────────────────────
// Aplica a TODAS las rutas API
app.use(apiLimiter);

// ── Uploads: rate limit más restrictivo ────────────
app.use('/upload', uploadLimiter);

// ── Chats: rate limit específico ───────────────────
// (aplica dentro de chatRoutes)

// ── Rutas ────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/posts', postsRoutes);
app.use('/transactions', transactionsRoutes);
app.use('/wallet', transactionsRoutes);
app.use('/regional-fund', regionalFundRoutes);
app.use('/admin', adminRoutes);
app.use('/upload', uploadRoutes);
app.use('/quests', questsRoutes);
app.use('/moderation', moderationRoutes);
app.use('/search', searchRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/anchor', anchorRoutes);
app.use('/chats', chatRoutes);
app.use('/businesses', businessesRoutes);
app.use('/payments', paymentsRoutes);
app.use('/music', musicRoutes);
app.use('/ads', adsRoutes);

// ── Tipo de cambio USD/MXN para el frontend ──
import { getMxnRate } from './services/price.service.js';
app.get('/price/usd-mxn', async (_req, res) => {
  try {
    const rate = await getMxnRate();
    res.json({ rate, currency: 'MXN', updatedAt: new Date().toISOString() });
  } catch {
    res.json({ rate: 18.50, currency: 'MXN', fallback: true });
  }
});

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

// ── HTTP Server + WebSocket ─────────────────────────────
const server = http.createServer(app);
const io = initSocketIO(server);

// ── Iniciar ───────────────────────────────────────────────
server.listen(PORT, () => {
    void(`
  🌾  ──────────────────────────────────────── 🌾
       Shekael API Gateway v0.4.0 · Puerto ${PORT}
       Almacenamiento: R2 (Cloudflare)
       Stellar: ${process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'}
  🌾  ──────────────────────────────────────── 🌾
  `);
});

export { io };
export default app;
