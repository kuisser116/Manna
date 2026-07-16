import rateLimit from 'express-rate-limit';

// ═══════════════════════════════════════════
// Rate Limiters — Shekael API
// ═══════════════════════════════════════════

// Global: 120 requests por minuto por IP (protección base)
export const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        message: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.'
    }
});

// Uploads: 10 solicitudes por minuto por IP (evita abuso de almacenamiento)
export const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        message: 'Demasiadas subidas de archivos. Espera un minuto.'
    }
});

// Chats: 60 mensajes por minuto por IP (anti-spam en mensajería)
export const chatLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        message: 'Demasiados mensajes. Reduce la velocidad.'
    }
});

// Auth estricto: 5 intentos cada 15 min por IP
// Google OAuth + reCAPTCHA v3 + rate limiting = bot-proof
export const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        message: 'Demasiados intentos desde esta IP. Intenta de nuevo en 15 minutos.'
    }
});

// Registro: máx 3 cuentas por IP al día
export const signupLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 horas
    limit: 3,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        message: 'Has alcanzado el límite de cuentas nuevas desde esta IP.'
    }
});
