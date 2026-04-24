import getDB from '../database/db.js';
import { generatePresignedUrl } from './ipfs.service.js';

// Helper: fetch con timeout y reintentos automáticos para resiliencia en red
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            return res;
        } catch (err) {
            clearTimeout(timer);
            const isLast = attempt === retries;
            if (isLast) throw err;
            console.warn(`   ⚠️  Intento ${attempt + 1} fallido (${err.message}). Reintentando en 3s...`);
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

export async function createUploadUrl(name) {
    const apiKey = process.env.LIVEPEER_API_KEY;
    if (!apiKey) throw new Error("LIVEPEER_API_KEY no configurado en el .env");

    const res = await fetchWithTimeout("https://livepeer.studio/api/asset/request-upload", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ name })
    });

    if (!res.ok) {
        let errMessage = 'Error desconocido';
        try {
            const errData = await res.json();
            errMessage = errData.errors?.join(', ') || res.statusText;
        } catch {
            errMessage = await res.text();
        }
        throw new Error(`Livepeer API Error: ${errMessage}`);
    }

    const data = await res.json();
    return {
        uploadUrl: data.url,
        playbackId: data.asset.playbackId,
        assetId: data.asset.id
    };
}

export async function proxyUploadVideo(uploadUrl, fileBuffer, mimeType) {
    const res = await fetch(uploadUrl, {
        method: "PUT",
        body: fileBuffer,
        headers: {
            "Content-Type": mimeType || "video/mp4"
        }
    });

    if (!res.ok) {
        throw new Error(`Error transmitiendo video a Livepeer Storage: ${res.statusText}`);
    }

    return true;
}

/**
 * Fase 2 + Fase 3: Transcodificación diferida + Repatriación automática a R2
 *
 * 1. Envía la URL del video raw en R2 a Livepeer para transcodificar.
 * 2. Guarda el assetId en DB (video_status = 'processing').
 * 3. En background: espera que Livepeer termine (polling 30s).
 * 4. Cuando está listo: inicia la repatriación completa de HLS a R2.
 * 5. Al completar: video_status = 'r2-hls', costo egress = $0 para siempre.
 *
 * Durante todo el proceso (steps 2-4), el usuario sigue viendo el video
 * desde R2 raw (MP4 directo) — sin interrupciones y con egress $0.
 */
export async function triggerTranscoding(postId, r2Url) {
    if (!r2Url || !r2Url.startsWith('http')) {
        console.warn(`[Livepeer] Ignorado: URL no válida o demo (${r2Url}) para post ${postId}`);
        return null;
    }

    const apiKey = process.env.LIVEPEER_API_KEY;
    if (!apiKey) {
        console.warn('[Livepeer] LIVEPEER_API_KEY no configurado');
        return null;
    }

    const supabase = getDB();

    try {
        // ⚠️ VERIFICACIÓN CRÍTICA: Solo iniciar si el video aún está en 'raw'
        const { data: currentStatus } = await supabase
            .from('posts')
            .select('video_status')
            .eq('id', postId)
            .single();

        if (!currentStatus) {
            console.warn(`[Livepeer] Post ${postId} no existe en DB`);
            return null;
        }

        if (currentStatus.video_status !== 'raw') {
            console.log(`[Livepeer] Post ${postId} ya está en estado '${currentStatus.video_status}'. Saltando transcodificación.`);
            return null;
        }

        console.log(`\n🎬 [Livepeer] Iniciando transcodificación para post ${postId}...`);
        console.log(`   URL R2 original: ${r2Url}`);
        
        let encodedUrl;
        const isTestMode = process.env.LIVEPEER_TEST_MODE === 'true';
        if (isTestMode) {
            const testVideoUrl = process.env.TEST_VIDEO_URL || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
            console.log(`   🧪 MODO PRUEBA: Usando video público de Google`);
            console.log(`   URL de prueba: ${testVideoUrl}`);
            encodedUrl = testVideoUrl;
        } else {
            // Modo producción: generar Presigned URL para que Livepeer pase el escudo de Cloudflare
            console.log(`   🔑 Generando Presigned URL para permitir acceso de Livepeer...`);
            try {
                // Extraer la clave (key) de R2 desde la URL pública
                const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/$/, '');
                const r2Key = r2Url.replace(`${publicUrl}/`, '');
                encodedUrl = await generatePresignedUrl(r2Key, 7200); // 2 horas de vigencia
                console.log(`   ✅ Presigned URL generada (vigente 2 horas)`);
            } catch (presignErr) {
                console.warn(`   ⚠️ No se pudo generar Presigned URL: ${presignErr.message}`);
                console.warn(`   ⚠️ Usando URL pública (puede ser bloqueada por Cloudflare)`);
                encodedUrl = encodeURI(r2Url);
            }
        }

        // Marcar como 'processing' ANTES de llamar a Livepeer para evitar llamadas duplicadas
        await supabase.from('posts').update({ video_status: 'processing' }).eq('id', postId);

        const res = await fetchWithTimeout("https://livepeer.studio/api/asset/upload/url", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: `Ehise-${postId}`,
                url: encodedUrl,
                profiles: [
                    { width: 1280, height: 720, name: '720p', fps: 30, bitrate: 3000000 },
                    { width: 854, height: 480, name: '480p', fps: 30, bitrate: 1500000 }
                ]
            })
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`   Error response: ${errorText}`);
            throw new Error(`Error Livepeer URL Ingest: ${errorText}`);
        }

        const data = await res.json();
        const assetId = data.asset.id;
        const playbackId = data.asset.playbackId;

        console.log(`   Asset ID: ${assetId}`);
        console.log(`   Playback ID: ${playbackId}`);

        // Guardar assetId y playbackId en DB — video sigue sirviendo como raw (MP4 de R2) mientras tanto
        await supabase.from('posts').update({ 
            video_asset_id: assetId, 
            video_playback_id: playbackId 
        }).eq('id', postId);

        console.log(`✅ [Livepeer] Transcodificación iniciada (status='processing'). Polling iniciará en background...`);

        const webhookUrl = process.env.WEBHOOK_URL;
        if (webhookUrl) {
            try {
                console.log(`   📡 Registrando webhook: ${webhookUrl}`);
                await fetchWithTimeout('https://livepeer.studio/api/webhook', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: 'Ehise-transcode-webhook',
                        events: ['asset.ready', 'asset.failed'],
                        url: webhookUrl
                    })
                });
                console.log(`   ✅ Webhook registrado en Livepeer`);
            } catch (webhookErr) {
                console.warn(`   ⚠️  No se pudo registrar webhook: ${webhookErr.message}`);
            }
        } else {
            console.warn(`   ⚠️  WEBHOOK_URL no configurado - usando polling como fallback`);
        }

        // Fire-and-forget (en background): esperar que esté listo y repatriar todo a R2
        (async () => {
            try {
                // Importación dinámica para evitar dependencia circular
                const { waitForLivepeerReady, repatriateHLS } = await import('./hls-repatriate.js');
                const asset = await waitForLivepeerReady(assetId);
                if (asset) {
                    await repatriateHLS(postId, assetId, playbackId, asset?.playbackUrl);
                }
            } catch (err) {
                console.error(`\n❌ [Livepeer] Pipeline de repatriación falló para post ${postId}:`, err.message);
                // Revertir a raw para no dejar el post en estado processing indefinidamente
                const supabase = getDB();
                await supabase.from('posts').update({ video_status: 'raw' }).eq('id', postId);
            }
        })();

        return playbackId;

    } catch (err) {
        console.error(`\n❌ [Livepeer] Error iniciando transcodificación para post ${postId}:`, err.message);
        // Revertir a raw
        const supabase = getDB();
        await supabase.from('posts').update({ video_status: 'raw' }).eq('id', postId);
        return null;
    }
}
