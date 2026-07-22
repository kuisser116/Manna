import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import getDB from '../database/db.js';
import * as StellarSdk from '@stellar/stellar-sdk';
import { ensureTrustline, sendPayment } from '../services/stellar.service.js';
import { decryptWithFallback } from '../services/crypto.service.js';
import { convertToUSDC } from '../services/price.service.js';

const router = Router({ strict: false });

// ─── GET /admin/pending-posts — Posts pendientes con perfil del autor ───
router.get('/pending-posts', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { data: posts, error } = await supabase
            .from('posts')
            .select(`
                id, content, type, created_at, image_url, video_url,
                author:users!posts_author_id_fkey (
                    id, display_name, avatar_url, email,
                    stellar_public_key, wallet_activated,
                    bonus_total_mxn, bonus_released_mxn,
                    created_at
                ),
                post_likes (user_id),
                post_comments (id),
                post_views (id)
            `)
            .eq('approval_status', 'pending')
            .order('created_at', { ascending: true })
            .limit(50);

        if (error) throw error;

        // Enriquecer con conteos
        const enriched = (posts || []).map(p => ({
            ...p,
            like_count: p.post_likes?.length || 0,
            comment_count: p.post_comments?.length || 0,
            view_count: p.post_views?.length || 0,
            post_likes: undefined,
            post_comments: undefined,
            post_views: undefined,
        }));

        res.json({ posts: enriched });
    } catch (err) {
        console.error('[Admin] Error fetching pending posts:', err);
        res.status(500).json({ message: 'Error al obtener posts pendientes' });
    }
});

// ─── POST /admin/approve-post/:postId — Aprobar un post ───
router.post('/approve-post/:postId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { postId } = req.params;
        const adminId = req.user.id;

        const supabase = getDB();

        // 1. Obtener post y usuario
        const { data: post, error: postError } = await supabase
            .from('posts')
            .select('id, author_id, created_at')
            .eq('id', postId)
            .single();

        if (postError || !post) {
            return res.status(404).json({ message: 'Post no encontrado' });
        }

        if (post.author_id === adminId) {
            return res.status(400).json({ message: 'No puedes aprobar tu propio post' });
        }

        const { data: author, error: authorError } = await supabase
            .from('users')
            .select('*')
            .eq('id', post.author_id)
            .single();

        if (authorError || !author) {
            return res.status(404).json({ message: 'Autor no encontrado' });
        }

        // 2. Activar wallet si no está activa
        if (!author.wallet_activated) {
            console.log(`[Admin] Activando wallet de ${author.display_name}...`);
            await activateWallet(author);
            await supabase
                .from('users')
                .update({ wallet_activated: true })
                .eq('id', author.id);
        }

        // 3. Calcular cuánto liberar ($1 MXN ≈ 0.057 USDC)
        const releaseAmountUSDC = await convertToUSDC(1);
        console.log(`[Admin] Liberando ${releaseAmountUSDC} USDC (equivalente a $1 MXN)`);

        // 4. Enviar USDC desde la cuenta maestra
        const masterSecret = process.env.MANNA_DEV_WALLET_SECRET;
        if (!masterSecret) {
            return res.status(500).json({ message: 'Wallet maestra no configurada' });
        }

        const txHash = await sendPayment({
            fromSecretKey: masterSecret,
            toPublicKey: author.stellar_public_key,
            amount: releaseAmountUSDC,
            memo: `Shekael:bonus-post-${postId.slice(0, 8)}`
        });

        // 5. Actualizar bonus del usuario
        const newReleased = (parseFloat(author.bonus_released_mxn || 0) + 1).toFixed(2);
        await supabase
            .from('users')
            .update({
                bonus_released_mxn: newReleased,
                last_post_approved_at: new Date().toISOString()
            })
            .eq('id', author.id);

        // 6. Marcar post como aprobado
        await supabase
            .from('posts')
            .update({
                approval_status: 'approved',
                approved_at: new Date().toISOString(),
                approved_by: adminId
            })
            .eq('id', postId);

        console.log(`[Admin] Post ${postId} aprobado. ${releaseAmountUSDC} USDC enviado a ${author.display_name}. Bonus: $${newReleased} MXN`);

        res.json({
            success: true,
            message: `Post aprobado. $1 MXN liberado a ${author.display_name}.`,
            txHash,
            bonus_released_mxn: newReleased,
            bonus_total_mxn: author.bonus_total_mxn || 50
        });

    } catch (err) {
        console.error('[Admin] Error approving post:', err);
        res.status(500).json({ message: err.message || 'Error al aprobar post' });
    }
});

// ─── POST /admin/reject-post/:postId — Rechazar un post ───
router.post('/reject-post/:postId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { postId } = req.params;
        const adminId = req.user.id;

        const supabase = getDB();

        const { data: post, error } = await supabase
            .from('posts')
            .select('id, author_id')
            .eq('id', postId)
            .single();

        if (error || !post) {
            return res.status(404).json({ message: 'Post no encontrado' });
        }

        await supabase
            .from('posts')
            .update({
                approval_status: 'rejected',
                rejected_at: new Date().toISOString(),
                rejected_by: adminId
            })
            .eq('id', postId);

        res.json({ success: true, message: 'Post rechazado' });

    } catch (err) {
        console.error('[Admin] Error rejecting post:', err);
        res.status(500).json({ message: err.message || 'Error al rechazar post' });
    }
});

// ─── GET /admin/stats — Estadísticas de aprobaciones ───
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const supabase = getDB();

        const { data: pendingCount } = await supabase
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('approval_status', 'pending');

        const { data: approvedToday } = await supabase
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('approval_status', 'approved')
            .gte('approved_at', new Date(Date.now() - 86400000).toISOString());

        const { data: totalUsers } = await supabase
            .from('users')
            .select('id', { count: 'exact', head: true });

        const { data: activatedWallets } = await supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('wallet_activated', true);

        res.json({
            pending_posts: pendingCount || 0,
            approved_today: approvedToday || 0,
            total_users: totalUsers || 0,
            activated_wallets: activatedWallets || 0
        });

    } catch (err) {
        console.error('[Admin] Error fetching stats:', err);
        res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
});

// ─── Helper: Activar wallet de un usuario ───
async function activateWallet(user) {
    const { ensureTrustline, fundWithFriendbot } = await import('../services/stellar.service.js');

    // 1. Descifrar la secret key del usuario
    let secretKey;
    try {
        secretKey = decryptWithFallback(user.id, user.stellar_public_key, user.stellar_secret_key_encrypted);
    } catch (e) {
        throw new Error(`No se pudo descifrar la clave de ${user.display_name}: ${e.message}`);
    }

    // 2. Intentar fondear con Friendbot (si la cuenta no existe en Stellar)
    try {
        await fundWithFriendbot(user.stellar_public_key);
    } catch (e) {
        console.warn(`[Admin] Friendbot skip: ${e.message}`);
    }

    // 3. Crear trustline USDC
    const trustlineOk = await ensureTrustline(secretKey);
    if (!trustlineOk) {
        throw new Error(`No se pudo crear trustline para ${user.display_name}`);
    }

    // 4. Enviar XLM mínimo desde la maestra para que pueda operar
    const masterSecret = process.env.MANNA_DEV_WALLET_SECRET;
    if (masterSecret) {
        const masterKeypair = StellarSdk.Keypair.fromSecret(masterSecret);
        const server = new StellarSdk.Horizon.Server(
            process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
        );

        try {
            const masterAccount = await server.loadAccount(masterKeypair.publicKey());

            const xlmTx = new StellarSdk.TransactionBuilder(masterAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: StellarSdk.Networks.TESTNET,
            })
                .addOperation(StellarSdk.Operation.payment({
                    destination: user.stellar_public_key,
                    asset: StellarSdk.Asset.native(),
                    amount: '2.0000000', // 2 XLM — reserve + fees
                }))
                .addMemo(StellarSdk.Memo.text('Shekael:wallet-activation'))
                .setTimeout(30)
                .build();

            xlmTx.sign(masterKeypair);
            await server.submitTransaction(xlmTx);
            console.log(`[Admin] 2 XLM enviados a ${user.stellar_public_key}`);
        } catch (err) {
            console.warn(`[Admin] Error enviando XLM: ${err.message}`);
        }
    }

    console.log(`[Admin] Wallet activada para ${user.display_name}`);
}

export default router;
