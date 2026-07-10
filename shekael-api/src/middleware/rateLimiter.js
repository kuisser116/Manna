import rateLimit from 'express-rate-limit';

// Escudo anti-automatización: 5 intentos cada 15 min por IP
// Google OAuth + reCAPTCHA v3 + rate limiting = bot-proof
export const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: 5, // 5 intentos por IP
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        message: 'Demasiados intentos desde esta IP. Intenta de nuevo en 15 minutos.'
    }
});

// Limitador para registro de nuevas cuentas: máx 3 por IP al día
export const signupLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 horas
    limit: 3, // 3 cuentas nuevas por IP
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        message: 'Has alcanzado el límite de cuentas nuevas desde esta IP.'
    }
});
