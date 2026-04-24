import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import getDB from '../database/db.js';
import { createWallet, fundWithFriendbot, ensureTrustline } from '../services/stellar.service.js';
import { encrypt } from '../services/crypto.service.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { strictLimiter } from '../middleware/rateLimiter.js';
import { repairWallet } from '../services/quest.service.js';

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
        const { credential } = req.body;
        if (!credential) {
            return res.status(400).json({ message: 'Token de Google requerido' });
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
            },
        });
    } catch (err) {
        console.error('Google Auth error:', err);
        res.status(500).json({ message: 'Error al iniciar sesión con Google' });
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

        res.json({
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                stellarPublicKey: user.stellar_public_key,
                is_admin: !!user.is_admin,
                avatarUrl: user.avatar_url,
                createdAt: user.created_at,
            },
        });
    } catch (err) {
        console.error('Me error:', err);
        res.status(500).json({ message: 'Error al obtener usuario' });
    }
});

export default router;
