import { Router } from 'express';
import getDB from '../database/db.js';

const router = Router({ strict: false });

// Stellar Federation Protocol
// GET /federation?q=<name>&type=name
// Responde con la dirección Stellar asociada al nombre
// Ejemplo: GET /federation?q=kuki&type=name → { stellar_address: "GCZSFI..." }
router.get('/', async (req, res) => {
    try {
        const { q, type } = req.query;

        if (!q || !type) {
            return res.status(400).json({
                error: 'Missing parameters. Required: q, type'
            });
        }

        // Solo soportamos type=name por ahora
        if (type !== 'name') {
            return res.status(400).json({
                error: 'Only type=name is supported'
            });
        }

        const supabase = getDB();

        // Buscar en federation table
        // El nombre puede venir como "user" o "user*WALLET" (wallet case-sensitive).
        // Buscar por coincidencia parcial del prefijo (antes del '*').
        const baseName = q.trim().split('*')[0].toLowerCase();
        const { data: fed, error } = await supabase
            .from('federation')
            .select('stellar_address, name')
            .ilike('name', baseName + '*%')
            .maybeSingle();

        if (error) throw error;

        if (!fed) {
            return res.status(404).json({
                error: 'Account not found',
                name: q
            });
        }

        // Formato Stellar Federation
        res.json({
            stellar_address: fed.stellar_address,
            account_id: fed.stellar_address,
            memo_type: 'id',
            memo: null,
            name: fed.name
        });
    } catch (err) {
        console.error('[Federation] Error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /federation/lookup/:name — Alias simple
router.get('/lookup/:name', async (req, res) => {
    try {
        const name = req.params.name.toLowerCase().trim();
        const supabase = getDB();

        const { data: fed, error } = await supabase
            .from('federation')
            .select('stellar_address, name, user_id')
            .ilike('name', name + '*%')
            .maybeSingle();

        if (error) throw error;

        if (!fed) {
            return res.status(404).json({ found: false, name });
        }

        res.json({
            found: true,
            name: fed.name,
            stellar_address: fed.stellar_address,
            full_name: `${fed.name}*shekael.app`
        });
    } catch (err) {
        console.error('[Federation Lookup] Error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
