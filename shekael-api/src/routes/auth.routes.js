import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import getDB from '../database/db.js';
import { createWallet, fundWithFriendbot, ensureTrustline } from '../services/stellar.service.js';
import { encrypt } from '../services/crypto.service.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { strictLimiter } from '../middleware/rateLimiter.js';
import { repairWallet } from '../services/quest.service.js';

// ── reCAPTCHA v3 Verification ──
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;
const RECAPTCHA_SCORE_THRESHOLD = 0.5;

async function verifyRecaptcha(token) {
    if (!token || !RECAPTCHA_SECRET) return { success: true, score: 1 }; // skip if not configured
    try {
        const params = new URLSearchParams({ secret: RECAPTCHA_SECRET, response: token });
        const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            body: params
        });
        const data = await res.json();
        return {
            success: data.success && data.score >= RECAPTCHA_SCORE_THRESHOLD,
            score: data.score || 0,
            action: data.action
        };
    } catch (err) {
        console.error('[Recaptcha] Error verificando:', err.message);
        return { success: false, score: 0, error: err.message };
    }
}

// ── Configuración de Términos y Condiciones ──
const TERMS_VERSION = 'v1.0';
const TERMS_CONTENT_HASH = crypto.createHash('sha256').update(`
Términos y Condiciones de Shekael v1.0
Última actualización: 10 de Julio de 2026

Shekael es una red social que ofrece un sistema de puntos de lealtad (MXNe).
MXNe no es dinero real, no tiene valor fuera de la app, y no puede ser canjeado por efectivo.
Al usar Shekael aceptas estos términos.
`).digest('hex');
const TERMS_LAST_UPDATED = '2026-07-10T00:00:00.000Z';

const router = Router({ strict: false });
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


function generateJWT(user) {
    return jwt.sign(
        { 
            id: user.id, 
            email: user.email, 
            stellarPublicKey: user.stellar_public_key,
            is_admin: !!user.is_admin 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
}


// POST /auth/google — Escudo 1: Login/Registro sin contraseña
router.post('/google', strictLimiter, async (req, res) => {
    try {
        const { credential, recaptchaToken } = req.body;
        if (!credential) {
            return res.status(400).json({ message: 'Token de Google requerido' });
        }

        // 0. Verificar reCAPTCHA v3 (anti-bot invisible)
        const captchaResult = await verifyRecaptcha(recaptchaToken);
        if (!captchaResult.success) {
            console.warn(`[Recaptcha] Bloqueado — score ${captchaResult.score}`);
            return res.status(403).json({ message: 'No se pudo verificar que eres humano. Intenta de nuevo.' });
        }

        // 1. Verificar token con Google
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { email, name: displayName } = payload;

        const supabase = getDB();
        
        // 2. Buscar si el usuario ya existe
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        // Si hubo un error real en el SELECT (no solo "no encontrado"), lanzarlo
        // para evitar que el código intente crear un usuario que ya existe.
        if (userError) throw userError;

        // 3. Si no existe, lo registramos auto-mágicamente
        if (!user) {
            const keypair = createWallet();
            const secretKey = keypair.secret();
            const encSecret = encrypt(secretKey);
            const userId = uuidv4();

            // 1. El usuario se registra solo en Supabase.
            // La billetera Stellar se queda "off-chain" hasta que complete las misiones
            // (Proof of Engagement). Esto evita el error "Not Found" y ahorra recursos.
            
            const targetWatchSeconds = Math.floor(Math.random() * (240 - 120 + 1)) + 120;
            const targetLikes = Math.floor(Math.random() * (15 - 5 + 1)) + 5;
            const targetFollows = Math.floor(Math.random() * (3 - 1 + 1)) + 1;

            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert({
                    id: userId,
                    email,
                    display_name: displayName,
                    stellar_public_key: keypair.publicKey(),
                    stellar_secret_key_encrypted: encSecret,
                    target_watch_seconds: targetWatchSeconds,
                    target_likes: targetLikes,
                    target_follows: targetFollows
                })
                .select()
                .single();

            if (insertError) throw insertError;
            
            // Re-asignar para el JWT
            const finalUser = newUser;
            const token = generateJWT(finalUser);

            return res.json({
                token,
                user: {
                    id: finalUser.id,
                    email: finalUser.email,
                    displayName: finalUser.display_name,
                    stellarPublicKey: finalUser.stellar_public_key,
                    is_admin: !!finalUser.is_admin,
                    terms_accepted_at: null,
                },
            });
        }

        // 4. Generar sesión
        const token = generateJWT(user);

        // 5. Reparación Proactiva: Asegurar que su wallet está bien en Stellar
        // Lo corremos en "background" (sin await) para no retrasar el login, 
        // pero registramos si falla.
        repairWallet(user.id).catch(err => console.error(`[AuthRepair] Error reparando wallet de ${user.email}:`, err.message));

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                stellarPublicKey: user.stellar_public_key,
                is_admin: !!user.is_admin,
                terms_accepted_at: user.terms_accepted_at || null,
            },
        });
    } catch (err) {
        console.error('Google Auth error:', err);
        res.status(500).json({ message: 'Error al iniciar sesión con Google' });
    }
});

// POST /auth/accept-terms — Aceptar términos y condiciones (con auditoría legal)
router.post('/accept-terms', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const now = new Date().toISOString();
        const version = req.body.version || TERMS_VERSION;
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';

        // 1. Actualizar usuario
        const { error: updateError } = await supabase
            .from('users')
            .update({ 
                terms_accepted_at: now,
                terms_version: version 
            })
            .eq('id', req.user.id);

        if (updateError) throw updateError;

        // 2. Registrar en tabla de auditoría legal
        const logId = uuidv4();
        const { error: logError } = await supabase
            .from('terms_acceptance_log')
            .insert({
                id: logId,
                user_id: req.user.id,
                terms_version: version,
                accepted_at: now,
                ip_address: ipAddress,
                user_agent: userAgent,
                terms_hash: TERMS_CONTENT_HASH
            });

        if (logError) {
            console.error('[TermsAudit] Error guardando auditoría:', logError.message);
            // No bloqueamos — la aceptación ya quedó registrada en users
        }

        res.json({ 
            terms_accepted_at: now,
            terms_version: version 
        });
    } catch (err) {
        console.error('Accept terms error:', err);
        res.status(500).json({ message: 'Error al aceptar términos' });
    }
});

// GET /auth/terms/current — Versión actual de términos
router.get('/terms/current', (req, res) => {
    res.json({
        version: TERMS_VERSION,
        last_updated: TERMS_LAST_UPDATED,
        hash: TERMS_CONTENT_HASH,
        summary: 'Al usar Shekael aceptas estos términos. MXNe no es dinero real, no tiene valor fuera de la app.'
    });
});

// GET /auth/me — Restaurar sesión
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (!user || error) return res.status(404).json({ message: 'Usuario no encontrado' });

        // Reparación Proactiva en cada reconexión
        repairWallet(user.id).catch(err => console.error(`[AuthRepair/Me] Error:`, err.message));

        res.json({
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                stellarPublicKey: user.stellar_public_key,
                is_admin: !!user.is_admin,
                avatarUrl: user.avatar_url,
                createdAt: user.created_at,
                terms_accepted_at: user.terms_accepted_at || null,
                terms_version: user.terms_version || null,
            },
        });
    } catch (err) {
        console.error('Me error:', err);
        res.status(500).json({ message: 'Error al obtener usuario' });
    }
});

export default router;
