import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';

const router = Router({ strict: false });

// ─── Buscar lugares (por texto, como OSM) ───
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length < 2) {
            return res.json({ success: true, venues: [] });
        }

        const supabase = getDB();
        const search = `%${q.trim()}%`;

        const { data, error } = await supabase
            .from('public_venues')
            .select('id, name, category, address, zone, city, state, lat, lng, verified')
            .or(`name.ilike.${search},zone.ilike.${search},address.ilike.${search}`)
            .limit(20);

        if (error) throw error;

        res.json({ success: true, venues: data || [] });
    } catch (err) {
        console.error('Error searching venues:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Lugares cercanos a coordenadas ───
router.get('/nearby', authMiddleware, async (req, res) => {
    try {
        const { lat, lng, radius = 0.1 } = req.query;
        if (!lat || !lng) {
            return res.status(400).json({ success: false, message: 'lat y lng requeridos' });
        }

        const supabase = getDB();
        const r = parseFloat(radius);
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);

        const { data, error } = await supabase
            .from('public_venues')
            .select('id, name, category, address, zone, city, state, lat, lng, verified')
            .gte('lat', latNum - r)
            .lte('lat', latNum + r)
            .gte('lng', lngNum - r)
            .lte('lng', lngNum + r)
            .limit(50);

        if (error) throw error;

        res.json({ success: true, venues: data || [] });
    } catch (err) {
        console.error('Error fetching nearby venues:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Detalle de un lugar ───
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const supabase = getDB();
        const { id } = req.params;

        const { data: venue, error } = await supabase
            .from('public_venues')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, message: 'Lugar no encontrado' });
            }
            throw error;
        }

        // Obtener posts asociados a este venue
        const { data: posts } = await supabase
            .from('posts')
            .select('id, content, type, created_at, author_id')
            .eq('venue_id', id)
            .order('created_at', { ascending: false })
            .limit(20);

        // Obtener reseñas de negocios relacionadas (si el venue es también un business)
        const { data: reviews } = await supabase
            .from('reviews')
            .select('id, rating, comment, user_id, created_at')
            .eq('business_id', id)
            .limit(10);

        res.json({
            success: true,
            venue,
            posts: posts || [],
            reviews: reviews || [],
        });
    } catch (err) {
        console.error('Error fetching venue:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Crear un lugar nuevo ───
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { name, category, address, zone, city, state, lat, lng } = req.body;

        if (!name || !zone || lat === undefined || lng === undefined) {
            return res.status(400).json({ success: false, message: 'name, zone, lat y lng requeridos' });
        }

        const supabase = getDB();

        // Verificar si ya existe uno similar (mismo nombre + zona)
        const { data: existing } = await supabase
            .from('public_venues')
            .select('id')
            .eq('name', name.trim())
            .eq('zone', zone.trim())
            .limit(1);

        if (existing && existing.length > 0) {
            return res.json({ success: true, venue: existing[0], existed: true });
        }

        const { data, error } = await supabase
            .from('public_venues')
            .insert({
                name: name.trim(),
                category: category || null,
                address: address || null,
                zone: zone.trim(),
                city: city || null,
                state: state || null,
                lat: parseFloat(lat),
                lng: parseFloat(lng),
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ success: true, venue: data, existed: false });
    } catch (err) {
        console.error('Error creating venue:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
