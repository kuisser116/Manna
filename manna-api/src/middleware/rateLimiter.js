import rateLimit from 'express-rate-limit';

// Limitador estricto desactivado para hackatón (antes 5 cada 15m)
export const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: 10000, // Prácticamente ilimitado
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        message: 'Demasiados intentos desde esta IP.'
    }
});
