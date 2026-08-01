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
const TERMS_VERSION = 'v1.4';
const TERMS_CONTENT_HASH = crypto.createHash('sha256').update(`Términos y Condiciones de Shekael v1.4
Última actualización: 30 de Julio de 2026

1. ACEPTACIÓN. Al registrarte y usar Shekael aceptas estos Términos. Si no aceptas, no uses la app. Shekael puede modificarlos; los cambios se notifican en la app y requieren aceptación explícita.

2. ELEGIBILIDAD. Debes tener 13+ años (13-18 requieren autorización parental). No debes estar en listas OFAC/sanciones. Si fuiste suspendido previamente por violar términos, no puedes registrarte de nuevo sin autorización.

3. SERVICIO. Shekael es una red social con ecosistema digital propio basado en la red Stellar (actualmente testnet, migrable a mainnet). Incluye: publicaciones, chat privado cifrado, apoyos entre usuarios, bono promocional de $20 MXN, recompensas por anuncios, pagos QR en comercios afiliados, y Fondo Regional (10% de comisión en apoyos).

4. USDC — TOKEN DIGITAL, NO MONEDA. USDC es un token digital emitido en Stellar. NO es moneda de curso legal, NO está respaldado por ningún gobierno, NO está asegurado por FDIC/IPAB/nadie, NO está registrado como valor (security). No tiene valor garantizado. Su valor percibido depende de oferta/demanda dentro del ecosistema. No genera intereses ni rendimientos. No puede ser canjeado por efectivo a través de Shekael. Cualquier equivalencia en MXN es aspiracional y no vinculante.

5. BONO PROMOCIONAL $20 MXN. Usuarios nuevos reciben un bono virtual de $20 MXN. Se libera $1 MXN (en USDC equivalente) por cada post aprobado por Shekael, máximo 1 por día, hasta 20 liberaciones. El bono expira 70 días después del primer post aprobado; los fondos no reclamados vuelven al Fondo Regional. Shekael puede modificar, suspender o cancelar este programa en cualquier momento.

6. APOYOS (SUPPORTS). Los usuarios pueden enviar apoyos económicos a creadores. Cada apoyo genera una comisión del 10% que se deposita en el Fondo Regional. Las transacciones son irrevocables en la red Stellar. Shekael no garantiza la recepción del apoyo por parte del destinatario.

7. WALLET STELLAR. Shekael genera y custodia claves Stellar cifradas por usuario con PIN. Shekael NO puede recuperar claves perdidas. La pérdida de acceso a tu cuenta de Google o PIN resulta en pérdida permanente de acceso a tus USDC. Shekael no garantiza la seguridad absoluta del sistema de encriptación.

8. RECOMPENSAS POR ANUNCIOS. Shekael puede mostrar anuncios recompensados. Al verlos completos ganas MXNe. Shekael puede modificar las tasas, requisitos y disponibilidad en cualquier momento sin responsabilidad.

9. SERVICIOS DE TERCEROS. Depósitos, retiros y swaps ocurren en exchanges, anchors (MoneyGram) o el DEX de Stellar — todos externos. Shekael no opera, controla ni es responsable por ellos. El usuario asume todo riesgo.

10. CONTENIDO. Shekael defiende la libertad de expresión. No censura temas controversiales. Está prohibido: contenido ilegal, spam, estafas, incitación a violencia, discriminación. Shekael usa filtro automatizado + detección NSFW local. Violaciones pueden resultar en suspensión. En suspensión definitiva, los USDC acumulados pasan al Fondo Regional sin compensación.

11. PROPIEDAD INTELECTUAL. El usuario conserva derechos de su contenido, otorgando a Shekael licencia para operar la plataforma. La marca Shekael, logo y código son propiedad exclusiva de Shekael.

12. PRIVACIDAD. Shekael recopila: email, nombre, avatar, contenido publicado, datos de uso, ubicación aproximada (solo para comercios cercanos), IP, user-agent. No comparte datos con terceros sin consentimiento. Cumple con LFPDPPP mexicana. Puedes solicitar eliminación de tus datos contactando a soporte.

13. RIESGOS. USDC puede volverse cero. Transacciones en Stellar son irreversibles. La red Stellar puede sufrir forks, ataques o fallas. El marco regulatorio de tokens está en evolución. No hay seguro ni protección al consumidor. Al usar Shekael ACEPTAS TODOS ESTOS RIESGOS EXPRESAMENTE.

14. LIMITACIÓN DE RESPONSABILIDAD. Shekael NO es responsable por: daños directos/indirectos por uso de la plataforma, pérdida de USDC por errores técnicos o de red, contenido de usuarios, pérdida de acceso a cuenta, interrupciones del servicio. El software se proporciona "tal cual", sin garantía. Responsabilidad máxima acumulada limitada al USDC que el usuario haya recibido en los últimos 12 meses.

15. EVIDENCIA. Cada aceptación de términos registra: versión, hash SHA-256 del texto exacto, timestamp, IP, user-agent, user_id. Este registro tiene valor probatorio y se conserva indefinidamente. Shekael almacena el texto íntegro de cada versión para su verificación.

16. LEY Y JURISDICCIÓN. Ley aplicable: México (Ciudad de México). Renuncia expresa a acción colectiva (class action). Cualquier disputa se resolverá en tribunales de la CDMX.

Al usar Shekael aceptas estos términos v1.4.
`).digest('hex');
const TERMS_LAST_UPDATED = '2026-07-30T00:00:00.000Z';

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
            const userId = uuidv4();
            const keypair = createWallet();
            const secretKey = keypair.secret();
            const encSecret = encryptAll(userId, secretKey, keypair.publicKey());

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
                    target_follows: targetFollows,
                    bonus_total_mxn: 20,
                    bonus_released_mxn: 0,
                    wallet_activated: false,
                    tutorial_completed: false,
                    bonus_expired: false
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
                    bonus_total_mxn: finalUser.bonus_total_mxn || 20,
                    bonus_released_mxn: finalUser.bonus_released_mxn || 0,
                    wallet_activated: !!finalUser.wallet_activated,
                    bonus_expired: !!finalUser.bonus_expired,
                    tutorial_completed: !!finalUser.tutorial_completed,
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
                bonus_total_mxn: user.bonus_total_mxn || 0,
                bonus_released_mxn: user.bonus_released_mxn || 0,
                wallet_activated: !!user.wallet_activated,
                bonus_expired: !!user.bonus_expired,
                tutorial_completed: !!user.tutorial_completed,
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
        summary: 'Al usar Shekael aceptas estos términos. USDC es un token digital en Stellar, no una moneda fiduciaria ni un servicio financiero regulado.'
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
            .select('pin_hash, encrypted_private_key, stellar_secret_key_encrypted, stellar_public_key')
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
            encryptedPrivateKey: user.encrypted_private_key || null,
            stellarSecretKeyEncrypted: user.stellar_secret_key_encrypted || null,
            stellarPublicKey: user.stellar_public_key || null,
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

        // NOTA: NO auto-migrar terms_version aquí.
        // El frontend verifica si user.terms_version === TERMS_VERSION
        // y redirige a /terminos si no coinciden.
        // Si auto-migráramos aquí, el usuario nunca vería la pantalla de aceptación.

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
                bonus_total_mxn: user.bonus_total_mxn || 0,
                bonus_released_mxn: user.bonus_released_mxn || 0,
                wallet_activated: !!user.wallet_activated,
                bonus_expired: !!user.bonus_expired,
                tutorial_completed: !!user.tutorial_completed,
            },
        });
    } catch (err) {
        console.error('Me error:', err);
        res.status(500).json({ message: 'Error al obtener usuario' });
    }
});

export default router;
