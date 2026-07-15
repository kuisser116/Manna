/**
 * Livepeer desactivado.
 * Todos los videos se sirven como MP4 directo desde R2.
 * Cuando Shekael crezca, se puede reactivar con Cloudflare Stream o Mux.
 */

export async function createUploadUrl() {
    throw new Error('Livepeer desactivado. Los videos se suben directo a R2 como MP4.');
}

export async function proxyUploadVideo() {
    throw new Error('Livepeer desactivado.');
}

export async function triggerTranscoding() {
    // No-op: videos se sirven como MP4 raw desde R2
    void('[Livepeer] Desactivado - video servido como MP4 directo desde R2');
    return null;
}

export default { createUploadUrl, proxyUploadVideo, triggerTranscoding };
