import { getDB } from '../database/db.js';
import * as stellarService from './stellar.service.js';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'manna-secret-key-123';

const AD_SPECS = {
    banner: { maxSizeMb: 5, formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'] },
    video: { maxSizeMb: 50, maxDurationSec: 60, formats: ['mp4', 'webm'] }
};

const INTEREST_OPTIONS = ['tech', 'faith', 'sports', 'art', 'music', 'food', 'travel', 'fashion', 'gaming', 'education'];

export function validateAdSpecs(mediaType, fileSizeMb, durationSec = null) {
    const specs = AD_SPECS[mediaType];
    if (!specs) throw new Error(`Tipo de media no válido: ${mediaType}. Usa 'banner' o 'video'.`);
    if (fileSizeMb > specs.maxSizeMb) {
        throw new Error(`El archivo pesa ${fileSizeMb.toFixed(1)}MB pero el máximo es ${specs.maxSizeMb}MB para ${mediaType}.`);
    }
    if (mediaType === 'video' && durationSec !== null && durationSec > specs.maxDurationSec) {
        throw new Error(`El video dura ${durationSec}s pero el máximo es ${specs.maxDurationSec}s.`);
    }
    return true;
}

export function generateAdSessionToken(userId, adId) {
    return jwt.sign({ userId, adId, timestamp: Date.now() }, JWT_SECRET, { expiresIn: '30m' });
}

export async function validateProofOfView(userId, adId, sessionToken, context = 'feed') {
    const supabase = getDB();
    
    // Verificar si es un anuncio fallback
    const isFallbackAd = adId.startsWith('fallback-');
    
    try {
        const payload = jwt.verify(sessionToken, JWT_SECRET);
        if (payload.adId !== adId || payload.userId !== userId) {
            throw new Error('Token no coincide con el anuncio o usuario');
        }
    } catch {
        throw new Error('Token de sesión de anuncio inválido o expirado');
    }

    // Para fallbacks, permitir múltiples vistas por día (solo para desarrollo)
    if (isFallbackAd) {
        console.log(`[Fallback Ad] Validando vista para anuncio ${adId} - permitido`);
        return true;
    }

    // El límite de "una vez al día" solo aplica para anuncios del FEED.
    // Los anuncios insertados en VIDEOS (mid-roll) pueden premiar cada vez que se completan,
    // ya que requieren más atención y tiempo del usuario.
        /* 
        if (context === 'feed') {
           ...
        }
        */
        return true; // Permitir por ahora para hackatón
    
    return true;
}

function calculateShares(costPerView, context, contentType = 'standard', status = 'completed') {
    let baseShares;
    if (!context || context === 'feed') {
        // Sin creador (feed general): 0/20/40/40 (viewer/manna/fondo regional)
        baseShares = { creator: 0, viewer: costPerView * 0.20, dev: costPerView * 0.40, barn: costPerView * 0.40 };
    } else {
        // Con creador: 50/20/15/15 (creador/viewer/manna/fondo regional)
        baseShares = { creator: costPerView * 0.50, viewer: costPerView * 0.20, dev: costPerView * 0.15, barn: costPerView * 0.15 };
    }
    
    // Si el usuario saltó el anuncio, el 20% del viewer se va al dev
    if (status === 'skipped') {
        const viewerShare = baseShares.viewer;
        baseShares.viewer = 0;
        baseShares.dev += viewerShare;
    }
    if (baseShares.creator > 0) {
        if (contentType === 'educational') {
            baseShares.creator += costPerView * 0.10;
            baseShares.dev -= costPerView * 0.10;
        } else if (contentType === 'impact') {
            baseShares.creator += costPerView * 0.15;
            baseShares.dev -= costPerView * 0.15;
        }
    }
    return baseShares;
}

function applyViewerDecay(shares, viewsToday) {
    let viewerFactor = 0.20;
    if (viewsToday <= 2)      viewerFactor = 0.20;
    else if (viewsToday <= 4) viewerFactor = 0.14;
    else if (viewsToday <= 6) viewerFactor = 0.10;
    else                       viewerFactor = 0.05;

    const totalCost = shares.creator + shares.viewer + shares.dev + shares.barn;
    const newViewerShare = totalCost * viewerFactor;
    const originalViewerShare = shares.viewer;
    return { ...shares, viewer: newViewerShare, barn: shares.barn + (originalViewerShare - newViewerShare), _decayed: viewsToday > 2 };
}

export async function triggerDistribution(userId, adId, postId, viewSeconds, proofToken, context = 'feed', creatorId = null, status = 'completed') {
    const supabase = getDB();
    const today = new Date().toISOString().split('T')[0];
    const viewId = uuidv4();

    // Verificar si es un anuncio fallback
    const isFallbackAd = adId.startsWith('fallback-');
    
    let ad;
    if (isFallbackAd) {
        // Usar datos del fallback
        ad = FALLBACK_ADS.find(fa => fa.id === adId);
        if (!ad) throw new Error('Anuncio fallback no encontrado');
    } else {
        // Buscar anuncio real en la base de datos
        const { data: adData } = await supabase.from('ads').select('*').eq('id', adId).single();
        if (!adData) throw new Error('Anuncio no encontrado');
        ad = adData;
    }

    let resolvedCreatorId = creatorId;
    let contentType = 'standard';
    if (postId) {
        const { data: post } = await supabase.from('posts').select('author_id, content_type').eq('id', postId).single();
        if (post) {
            resolvedCreatorId = post.author_id;
            contentType = post.content_type || 'standard';
        }
    }

    // 1. Obtener datos del espectador con mayor resiliencia
    console.log(`[Ads] Buscando espectador con ID: ${userId}...`);
    const { data: viewer, error: vErr } = await supabase
        .from('users')
        .select('id, email, stellar_public_key')
        .eq('id', userId)
        .maybeSingle();

    if (!viewer) {
        console.error(`[Ads] No se encontró el usuario ${userId} en Supabase:`, vErr?.message || 'No existe en la tabla users');
        throw new Error(`Usuario espectador no encontrado (ID: ${userId}). Por favor, cierra sesión y vuelve a entrar.`);
    }

    console.log(`[Ads] Usuario ${viewer.email} encontrado. Iniciando distribución...`);

    // Para el hackatón, tratamos CPM como CPV para que el monto sea significativo (ej. 1.0 MXNe)
    const baseCostPerView = ad.cpm; 
    const isTargeted = ad.target_audience && ad.target_audience !== 'all';
    const hasConsent = !!viewer.data_consent;
    const dataBonus = (isTargeted && hasConsent) ? baseCostPerView * 0.5 : 0;
    const costPerView = baseCostPerView + dataBonus;

    let shares = calculateShares(costPerView, context, contentType, status);
    const { count: viewsToday } = await supabase.from('ad_views').select('*', { count: 'exact', head: true }).eq('viewer_user_id', userId).eq('view_day', today).eq('distribution_status', 'completed');
    shares = applyViewerDecay(shares, viewsToday || 0);

    // Restricción estricta de 1 recompensa por día (TOTAL, no por ad)
    if (context === 'feed' && viewsToday > 0) {
        console.log(`[Ads] Usuario ${userId} ya recibió su recompensa diaria. Saltando pago.`);
        // Registrar la vista de todos modos pero como completa sin pago on-chain
        await supabase.from('ad_views').insert({ id: viewId, ad_id: adId, viewer_user_id: userId, post_id: postId || null, view_seconds: viewSeconds, proof_token: proofToken, view_day: today, distribution_status: 'completed', ad_context: context, creator_id: resolvedCreatorId || null, status: 'already_rewarded' });
        return { success: true, viewId, txHash: 'DAILY_LIMIT_REACHED', shares: { viewer: 0 } };
    }

    // Solo procesar pagos Stellar para anuncios reales, no fallbacks
    if (!isFallbackAd) {
        try {
            const { decrypt } = await import('./crypto.service.js');
            const { data: advertiser } = await supabase.from('users').select('stellar_secret_key_encrypted, stellar_public_key').eq('id', ad.advertiser_id).single();
            const DEV_WALLET = process.env.MANNA_DEV_WALLET;
            const DEV_SECRET = process.env.MANNA_DEV_WALLET_SECRET;
            const BARN_WALLET = process.env.MANNA_BARN_WALLET;

            console.log(`[Ads] Procesando pago Stellar: Advertiser Secret existe: ${!!advertiser?.stellar_secret_key_encrypted}, Dev Secret existe: ${!!DEV_SECRET}`);
            
            let txHash = 'SIMULATED_' + Date.now();
            let effectiveSecret = DEV_SECRET;

            // Si hay un contrato de Soroban y no estamos en modo fallback manual total
            if (process.env.AD_DISTRIBUTION_CONTRACT_ID) {
                console.log(`[Soroban] Intentando contrato: ${process.env.AD_DISTRIBUTION_CONTRACT_ID}`);
                try {
                    const creatorPublicKey = resolvedCreatorId ? 
                        (await supabase.from('users').select('stellar_public_key').eq('id', resolvedCreatorId).single()).data?.stellar_public_key : null;

                    txHash = await stellarService.invokeAdDistribution({
                        advertiserSecret: effectiveSecret,
                        viewerPublicKey: viewer.stellar_public_key,
                        creatorPublicKey,
                        amount: costPerView.toFixed(7),
                        isFeed: context === 'feed'
                    });
                    console.log(`[Soroban] Éxito: ${txHash}`);
                } catch (sErr) {
                    console.warn(`[Soroban] Falló contrato, reintentando pago manual... Error: ${sErr.message}`);
                }
            }

            // Si sigue simulado o falló Soroban, hacemos pago directo
            if (txHash.startsWith('SIMULATED_') && effectiveSecret) {
                console.log(`[Ads] Iniciando pago directo desde ${DEV_WALLET} a ${viewer.stellar_public_key}`);
                try {
                    // Forzamos un monto visible para el Viewer en el hackatón (mínimo 1.0 MXNe)
                    const viewerAmount = Math.max(shares.viewer, 1.0).toFixed(7);
                    
                    // Evitar error en Stellar al enviarnos saldo a nuestra misma wallet (Dev account tests)
                    if (viewer.stellar_public_key === DEV_WALLET) {
                        console.log(`[Ads] El espectador es la misma Bóveda. Omitiendo la red Stellar.`);
                        txHash = 'SELF_PAID_' + Date.now();
                    } else {
                        console.log(`[Ads] Enviando ${viewerAmount} MXNe...`);
                        txHash = await stellarService.sendPayment({ 
                            fromSecretKey: effectiveSecret, 
                            toPublicKey: viewer.stellar_public_key, 
                            amount: viewerAmount, 
                            assetCode: 'MXNe', 
                            memo: 'manna:ad:viewer' 
                        });
                        console.log(`[Ads] Pago exitoso: ${txHash}`);
                    }
                    
                    // Los otros pagos se intentan pero no bloquean
                    if (shares.creator > 0.1 && resolvedCreatorId) {
                        const { data: creator } = await supabase.from('users').select('stellar_public_key').eq('id', resolvedCreatorId).single();
                        if (creator?.stellar_public_key && creator.stellar_public_key !== DEV_WALLET) {
                            stellarService.sendPayment({ fromSecretKey: effectiveSecret, toPublicKey: creator.stellar_public_key, amount: shares.creator.toFixed(7), assetCode: 'MXNe', memo: 'manna:ad:creator' }).catch(() => {});
                        }
                    }
                } catch (pErr) {
                    if (pErr.code === 'WALLET_NOT_ACTIVE') {
                        console.log(`[Ads] AutoRepair: Cuenta del espectador inactiva. Intentando activar...`);
                        const { repairWallet } = await import('./quest.service.js');
                        repairWallet(viewer.id).catch(e => console.error(`[Ads] AutoRepair failed: ${e.message}`));
                    }
                    console.error(`[Ads] Error crítico en pago directo: ${pErr.message}`);
                    throw pErr;
                }
            }

            await supabase.from('ad_views').update({ distribution_status: 'completed', stellar_distribution_tx: txHash }).eq('id', viewId);
            await supabase.rpc('increment_ad_spent', { ad_uuid: adId, amount: costPerView });
            return { success: true, viewId, txHash, shares };
        } catch (err) {
            console.error('[Distribution] Error en distribución Stellar:', err.message);
            await supabase.from('ad_views').update({ distribution_status: 'failed' }).eq('id', viewId);
            throw err;
        }
    } else {
        // Para fallbacks, simular distribución exitosa sin pagos reales
        console.log(`[Fallback Ad] Distribución simulada para anuncio ${adId}, costo: ${costPerView} MXNe`);
        await supabase.from('ad_views').update({ distribution_status: 'completed', stellar_distribution_tx: simulatedHash }).eq('id', viewId);
        return { success: true, viewId, costPerView, dataBonus, shares, isFallback: isFallbackAd };
    }
}

export function getMidrollTimestamps(videoDurationSeconds, manualTimestamps = null) {
    if (videoDurationSeconds < 300) return [];
    if (manualTimestamps && manualTimestamps.length > 0) {
        return manualTimestamps.filter(t => t > 30 && t < videoDurationSeconds - 30).sort((a, b) => a - b).filter((t, i, arr) => i === 0 || t - arr[i - 1] >= 60);
    }
    const timestamps = [];
    let cursor = 120;
    while (cursor < videoDurationSeconds - 30) {
        timestamps.push(cursor);
        cursor += 300;
    }
    return timestamps;
}

export function shouldInjectAd(postsSinceLastAd) {
    if (postsSinceLastAd < 3) return false;
    if (postsSinceLastAd >= 9) return true;
    const probability = postsSinceLastAd <= 5 ? 0.20 : postsSinceLastAd <= 8 ? 0.50 : 0.80;
    return Math.random() < probability;
}

// Anuncios de respaldo garantizados (fallback)
const FALLBACK_ADS = [
    {
        id: 'fallback-manna-1',
        title: 'Manna Network',
        description: 'La plataforma donde tu contenido vale oro. Únete a la revolución del contenido monetizado.',
        media_url: 'https://via.placeholder.com/800x450/1a1a1a/ffffff?text=Manna+Network',
        media_type: 'banner',
        advertiser_name: 'Manna Network',
        cta_label: 'Conoce más',
        cta_url: 'https://manna.network',
        promo_text: 'Bono de bienvenida',
        promo_code: 'MANNA2024',
        cpm: 1.0,
        budget_usdc: 1000,
        target_audience: 'all',
        status: 'active'
    },
    {
        id: 'fallback-manna-2', 
        title: 'Crea y Gana',
        description: 'Publica tu contenido y gana MXNe en cada vista. Sin límites, sin restricciones.',
        media_url: 'https://via.placeholder.com/800x450/2a2a2a/ffffff?text=Crea+y+Gana',
        media_type: 'banner',
        advertiser_name: 'Manna Network',
        cta_label: 'Empieza ahora',
        cta_url: 'https://manna.network/create',
        promo_text: 'Doble recompensa',
        promo_code: 'CREATOR2024',
        cpm: 1.0,
        budget_usdc: 1000,
        target_audience: 'all',
        status: 'active'
    },
    {
        id: 'fallback-manna-3',
        title: 'Soporta a Creadores',
        description: 'Descubre contenido increíble y apoya directamente a tus creadores favoritos.',
        media_url: 'https://via.placeholder.com/800x450/3a3a3a/ffffff?text=Soporta+Creadores',
        media_type: 'banner',
        advertiser_name: 'Manna Network',
        cta_label: 'Explorar',
        cta_url: 'https://manna.network/feed',
        promo_text: 'Reward extra',
        promo_code: 'SUPPORT2024',
        cpm: 1.0,
        budget_usdc: 1000,
        target_audience: 'all',
        status: 'active'
    }
];

export async function getActiveAd(userId = null, limit = 1) {
    const supabase = getDB();
    
    // Primero intentar obtener anuncios reales
    const { data: candidates } = await supabase
        .from('ads')
        .select('*')
        .eq('status', 'active')
        .gt('budget_usdc', 0)
        .order('created_at', { ascending: false })
        .limit(30);

    let availableAds = [];
    
    // Si hay anuncios reales, procesarlos normalmente
    if (candidates?.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const { data: viewsTodayData } = userId ? await supabase.from('ad_views').select('ad_id').eq('viewer_user_id', userId).eq('view_day', today).eq('distribution_status', 'completed') : { data: [] };
        const viewedTodayAdIds = new Set((viewsTodayData || []).map(v => v.ad_id));

        const { data: claimsData } = userId ? await supabase.from('user_coupons').select('ad_id').eq('user_id', userId) : { data: [] };
        const claimedAdIds = new Set((claimsData || []).map(c => c.ad_id));

        const notSeen = [];
        const seen = [];

        for (const ad of candidates) {
            ad.has_claimed_coupon = claimedAdIds.has(ad.id);
            ad.already_viewed_today = viewedTodayAdIds.has(ad.id);
            const sessionToken = generateAdSessionToken(userId || 'anonymous', ad.id);
            const wrapped = { ad, sessionToken };

            if (ad.already_viewed_today) seen.push(wrapped);
            else notSeen.push(wrapped);
        }

        // Aleatorizar el orden dentro de cada grupo para que no sea estático
        const shuffleArr = (arr) => arr.sort(() => Math.random() - 0.5);
        
        // Prioridad: 1. No vistos hoy, 2. Ya vistos hoy
        availableAds = [...shuffleArr(notSeen), ...shuffleArr(seen)].slice(0, limit);
    }
    
    // Si no hay suficientes anuncios reales, agregar fallbacks
    if (availableAds.length < limit) {
        const needed = limit - availableAds.length;
        const shuffledFallbacks = [...FALLBACK_ADS].sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < needed && i < shuffledFallbacks.length; i++) {
            const fallbackAd = shuffledFallbacks[i];
            const sessionToken = generateAdSessionToken(userId || 'anonymous', fallbackAd.id);
            availableAds.push({ ad: fallbackAd, sessionToken });
        }
    }

    if (limit > 1) return availableAds;
    return availableAds.length > 0 ? availableAds[0] : null;
}

function matchAdToUser(ad, user) {
    const audience = ad.target_audience || 'all';
    if (audience === 'all') return true;
    if (audience === 'verified') return false;
    if (audience.startsWith('interest:')) {
        if (!user.data_consent) return false;
        const required = audience.replace('interest:', '').split(',');
        const userInterests = JSON.parse(user.interest_categories || '[]');
        return required.some(i => userInterests.includes(i));
    }
    return true;
}

export async function getAdStats(adId, advertiserId) {
    const supabase = getDB();
    const { data: ad } = await supabase.from('ads').select('*').eq('id', adId).eq('advertiser_id', advertiserId).single();
    if (!ad) throw new Error('Campaña no encontrada');
    const { data: views } = await supabase.from('ad_views').select('view_seconds, viewer_user_id').eq('ad_id', adId).eq('distribution_status', 'completed');
    const uniqueViewers = new Set(views.map(v => v.viewer_user_id)).size;
    const totalSeconds = views.reduce((s, v) => s + v.view_seconds, 0);
    return {
        ad, reach: { impressions: ad.impressions, completions: views.length, uniqueViewers, totalSeconds },
        budget: { total: ad.budget_usdc, spent: ad.spent_usdc, remaining: ad.budget_usdc - ad.spent_usdc }
    };
}

export async function getAdvertiserDashboard(advertiserId) {
    const supabase = getDB();
    const { data: campaigns } = await supabase.from('ads').select('*').eq('advertiser_id', advertiserId).order('created_at', { ascending: false });
    const totalSpent = (campaigns || []).reduce((s, a) => s + (a.spent_usdc || 0), 0);
    return {
        summary: { totalCampaigns: campaigns?.length || 0, activeCampaigns: campaigns?.filter(a => a.status === 'active').length || 0, totalSpent },
        campaigns
    };
}

export async function createLocalAd({ advertiserId, community_id, content, budget_usdc, title, media_url, media_type }) {
    const supabase = getDB();
    const adId = uuidv4();
    const ESCROW_WALLET = process.env.MANNA_DEV_WALLET;
    let escrowTxHash = null;

    const { data: advertiser } = await supabase.from('users').select('stellar_secret_key_encrypted').eq('id', advertiserId).single();

    if (advertiser?.stellar_secret_key_encrypted && advertiser.stellar_secret_key_encrypted !== 'enc-placeholder' && ESCROW_WALLET) {
        const { decrypt } = await import('./crypto.service.js');
        const secretKey = decrypt(advertiser.stellar_secret_key_encrypted);
        escrowTxHash = await stellarService.sendPayment({
            fromSecretKey: secretKey,
            toPublicKey: ESCROW_WALLET,
            amount: parseFloat(budget_usdc).toFixed(7),
            assetCode: 'MXNe',
            memo: `manna:ad:escrow`
        });
    }

    const { error: insertError } = await supabase.from('ads').insert({
        id: adId,
        advertiser_id: advertiserId,
        community_id: community_id,
        title: title || 'Anuncio Local',
        description: content,
        media_url: media_url,
        media_type: media_type || 'banner',
        budget_usdc: budget_usdc,
        cpm: 1.0,
        status: 'pending_review',
        target_audience: 'regional',
        stellar_escrow_tx: escrowTxHash,
        promo_text: arguments[0].promo_text || null,
        promo_code: arguments[0].promo_code || null
    });
    
    if (insertError) throw new Error(insertError.message);

    return { adId, escrowTxHash };
}

export async function getLocalAds(community_id) {
    const supabase = getDB();
    const { data: ads } = await supabase.from('ads').select('*').eq('community_id', community_id).eq('status', 'active').gt('budget_usdc', 0);
    return ads;
}

export { INTEREST_OPTIONS, AD_SPECS };