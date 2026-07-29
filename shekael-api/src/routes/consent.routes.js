import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { recordConsent, revokeConsent, getConsentProfile } from '../services/consent.service.js';

const router = Router({ strict: false });

// ─── Obtener perfil de consentimiento del usuario ───
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const profile = await getConsentProfile(req.user.id);
        res.json({ success: true, ...profile });
    } catch (err) {
        console.error('Error fetching consent profile:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Registrar consentimiento e intereses ───
router.post('/record', authMiddleware, async (req, res) => {
    try {
        const { interests = [], ageRange = null, region = null } = req.body;
        const result = await recordConsent(req.user.id, interests, ageRange, region);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('Error recording consent:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Revocar consentimiento ───
router.post('/revoke', authMiddleware, async (req, res) => {
    try {
        const result = await revokeConsent(req.user.id);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('Error revoking consent:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
