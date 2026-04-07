import { getDB } from '../database/db.js';
import * as stellarService from './stellar.service.js';

const CONSENT_VERSION = 'V1';
const INTEREST_OPTIONS = ['tech', 'faith', 'sports', 'art', 'music', 'food', 'travel', 'fashion', 'gaming', 'education'];

export async function recordConsent(userId, interests = [], ageRange = null, region = null) {
    const supabase = getDB();
    const validInterests = interests.filter(i => INTEREST_OPTIONS.includes(i));

    let consentTx = null;
    try {
        const { data: user } = await supabase.from('users').select('stellar_public_key, stellar_secret_key_encrypted').eq('id', userId).single();
        if (user) {
            const txResult = await stellarService.sendConsentMemo(user, `MANNA_CONSENT_${CONSENT_VERSION}`);
            consentTx = txResult?.hash || null;
        }
    } catch (err) {
        console.warn(`[Consent] No se pudo registrar en Stellar para user ${userId}:`, err.message);
    }

    await supabase.from('users').update({
        data_consent: true,
        data_consent_tx: consentTx,
        data_consent_at: new Date().toISOString(),
        interest_categories: JSON.stringify(validInterests),
        age_range: ageRange,
        region: region
    }).eq('id', userId);

    return { success: true, interests: validInterests, consentTx, message: 'Consentimiento registrado correctamente.' };
}

export async function revokeConsent(userId) {
    const supabase = getDB();
    try {
        const { data: user } = await supabase.from('users').select('stellar_public_key, stellar_secret_key_encrypted').eq('id', userId).single();
        if (user) {
            await stellarService.sendConsentMemo(user, `MANNA_REVOKE_${CONSENT_VERSION}`);
        }
    } catch (err) {
        console.warn(`[Consent] No se pudo registrar revocación en Stellar para user ${userId}:`, err.message);
    }

    await supabase.from('users').update({
        data_consent: false,
        data_consent_tx: null,
        data_consent_at: null,
        interest_categories: '[]',
        age_range: null,
        region: null
    }).eq('id', userId);

    return { success: true, message: 'Consentimiento revocado.' };
}

export async function getConsentProfile(userId) {
    const supabase = getDB();
    const { data: user, error } = await supabase.from('users').select('data_consent, data_consent_tx, data_consent_at, interest_categories, age_range, region').eq('id', userId).single();
    if (error || !user) throw new Error('Usuario no encontrado');

    return {
        hasConsent: !!user.data_consent,
        consentTx: user.data_consent_tx,
        consentAt: user.data_consent_at,
        interests: JSON.parse(user.interest_categories || '[]'),
        ageRange: user.age_range,
        region: user.region,
        availableInterests: INTEREST_OPTIONS
    };
}

export function matchAd(ad, userProfile) {
    const audience = ad.target_audience || 'all';
    if (audience === 'all') return true;
    if (audience === 'verified') return false;    if (audience.startsWith('interest:')) {
        if (!userProfile.data_consent) return false;
        const requiredInterests = audience.replace('interest:', '').split(',');
        const userInterests = JSON.parse(userProfile.interest_categories || '[]');
        return requiredInterests.some(i => userInterests.includes(i));
    }
    return true;
}

export { INTEREST_OPTIONS };
