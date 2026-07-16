import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import getDB from '../database/db.js';
import { createWallet, fundWithFriendbot, ensureTrustline } from '../services/stellar.service.js';
import { encryptAll } from '../services/crypto.service.js';
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
const TERMS_VERSION = 'v1.3';
const TERMS_CONTENT_HASH = crypto.createHash('sha256').update(`
Términos y Condiciones de Shekael v1.3
Última actualización: 12 de Julio de 2026

1. NATURALEZA DE LA PLATAFORMA
Shekael es una red social descentralizada que opera sobre la red Stellar (testnet).
MXNe es un token digital (asset) emitido en la blockchain de Stellar. MXNe no es
una moneda fiduciaria, no está respaldado por ningún gobierno ni entidad financiera,
y no cuenta con seguro de depósitos ni garantía de convertibilidad a moneda fiduciaria.

2. RIESGOS
El valor de MXNe depende de la oferta y demanda dentro del ecosistema Shekael y,
en el futuro, de la integración con anchors de Stellar. El uso de tecnología blockchain
implica riesgos técnicos: pérdida de llaves privadas, errores de smart contract,
y volatilidad de red. Shekael no se responsabiliza por pérdidas derivadas de estos
riesgos. El usuario es el único custodio de su llave privada.

3. PROHIBICIONES
- No está permitido el lavado de dinero, evasión fiscal, fraude, o cualquier
  actividad ilícita usando MXNe.
- No está permitido presentar MXNe como una inversión, acción, bono, o cualquier
  valor financiero regulado.
- No está permitido operar MXNe en mercados secundarios no autorizados.
- No está permitido el uso de la plataforma por menores de 13 años.

4. NATURALEZA DIGITAL, NO SERVICIO FINANCIERO
Shekael es una plataforma de contenido social. No es una institución de dinero
electrónico, casa de cambio, banco, ni proveedor de servicios financieros.
La transferencia de MXNe entre usuarios es una transferencia directa en la
blockchain de Stellar, no un servicio de pagos regulado.

5. PRIVACIDAD Y DATOS
Shekael almacena la información mínima necesaria para el funcionamiento del servicio
(email, nombre, avatar). Las llaves privadas de Stellar se cifran con el PIN
del usuario y se almacenan localmente (IndexedDB) y en servidor de forma cifrada.
Shekael no comparte datos personales con terceros sin consentimiento explícito.

6. MODIFICACIONES
Shekael se reserva el derecho de modificar estos términos. Los cambios serán
notificados en la app y requieren aceptación explícita para continuar usando
el servicio.

7. LEY APLICABLE
Estos términos se rigen por las leyes de México. Cualquier disputa será
resuelta en los tribunales de la Ciudad de México.

Al usar Shekael aceptas estos términos.
`).digest('hex');
const TERMS_LAST_UPDATED = '2026-07-12T00:00:00.000Z';

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
             const encSecret = encryptAll(userId, secretKey, keypair.publicKey());

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
                    avatarUrl: finalUser.avatar_url || null,
                    terms_accepted_at: null,
                    terms_version: null,
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
                username: user.username,
                displayName: user.display_name,
                stellarPublicKey: user.stellar_public_key,
                is_admin: !!user.is_admin,
                avatarUrl: user.avatar_url || null,
                terms_accepted_at: user.terms_accepted_at || null,
                terms_version: user.terms_version || null,
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
        summary: 'Al usar Shekael aceptas estos términos. MXNe es un token digital en Stellar, no una moneda fiduciaria ni un servicio financiero regulado.'
    });
});

// POST /auth/migrate-terms — Actualizar términos de usuarios existentes a v1.2
router.post('/migrate-terms', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const now = new Date().toISOString();
        
        // Actualizar el usuario actual si tiene versión anterior
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('terms_version, id')
            .eq('id', req.user.id)
            .single();
            
        if (fetchError) throw fetchError;
        
        if (!user || user.terms_version === TERMS_VERSION) {
            return res.json({ migrated: false, message: 'Ya estás en la última versión' });
        }
        
        const { error: updateError } = await supabase
            .from('users')
            .update({
                terms_accepted_at: now,
                terms_version: TERMS_VERSION
            })
            .eq('id', req.user.id);
            
        if (updateError) throw updateError;
        
        void(`[MigrateTerms] Usuario ${req.user.id} actualizado a ${TERMS_VERSION}`);
        res.json({ migrated: true, terms_version: TERMS_VERSION, terms_accepted_at: now });
    } catch (err) {
        console.error('[MigrateTerms] Error:', err.message);
        res.status(500).json({ message: 'Error al migrar términos' });
    }
});

// ── PIN endpoints (per-user) ──

// GET /auth/pin-status — ¿El usuario tiene PIN configurado?
router.get('/pin-status', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { data: user, error } = await supabase
            .from('users')
            .select('pin_hash')
            .eq('id', req.user.id)
            .maybeSingle();

        if (error) throw error;
        res.json({ hasPin: !!user?.pin_hash });
    } catch (err) {
        console.error('[PIN] Error checking status:', err.message);
        res.status(500).json({ message: 'Error al verificar estado del PIN' });
    }
});

// POST /auth/set-pin — Guardar/actualizar PIN + encrypted_private_key
router.post('/set-pin', authMiddleware, async (req, res) => {
    try {
        const { pinHash, encryptedPrivateKey } = req.body;
        if (!pinHash || typeof pinHash !== 'string' || pinHash.length < 5) {
            return res.status(400).json({ message: 'PIN hash inválido' });
        }

        const updateData = { pin_hash: pinHash };
        if (encryptedPrivateKey && typeof encryptedPrivateKey === 'string') {
            updateData.encrypted_private_key = encryptedPrivateKey;
        }

        const supabase = getDB();
        const { error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', req.user.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('[PIN] Error setting PIN:', err.message);
        res.status(500).json({ message: 'Error al guardar PIN' });
    }
});

// POST /auth/verify-pin — Verificar PIN
router.post('/verify-pin', authMiddleware, async (req, res) => {
    try {
        const { pinHash } = req.body;
        if (!pinHash || typeof pinHash !== 'string') {
            return res.status(400).json({ message: 'PIN hash inválido' });
        }

        const supabase = getDB();
        const { data: user, error } = await supabase
            .from('users')
            .select('pin_hash, encrypted_private_key')
            .eq('id', req.user.id)
            .maybeSingle();

        if (error) throw error;

        if (!user?.pin_hash) {
            return res.status(400).json({ message: 'No has configurado un PIN' });
        }

        if (user.pin_hash !== pinHash) {
            return res.status(401).json({ message: 'PIN incorrecto' });
        }

        res.json({
            success: true,
            encryptedPrivateKey: user.encrypted_private_key || null
        });
    } catch (err) {
        console.error('[PIN] Error verifying PIN:', err.message);
        res.status(500).json({ message: 'Error al verificar PIN' });
    }
});

// POST /auth/clear-pin — Limpiar PIN (para regeneración de llaves)
router.post('/clear-pin', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { error } = await supabase
            .from('users')
            .update({ pin_hash: null })
            .eq('id', req.user.id);
        if (error) throw error;
        void(`[PIN] Cleared PIN for user ${req.user.id?.substring(0,8)}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[PIN] Error clearing PIN:', err.message);
        res.status(500).json({ message: 'Error al limpiar PIN' });
    }
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

        // Auto-migrate terms_version si está desactualizado o incompleto
        if (!user.terms_version || user.terms_version !== TERMS_VERSION) {
            void(`[Auth/Me] Auto-migrating terms ${user.terms_version || 'null'} → ${TERMS_VERSION} for ${user.email}`);
            const { error: migrateErr } = await supabase
                .from('users')
                .update({ terms_version: TERMS_VERSION })
                .eq('id', user.id);
            if (!migrateErr) {
                user.terms_version = TERMS_VERSION; // actualizar objeto para respuesta
                void(`[Auth/Me] Migrated ${user.email} to ${TERMS_VERSION}`);
            } else {
                console.error(`[Auth/Me] Migration error:`, migrateErr.message);
            }
        }

        res.json({
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
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
