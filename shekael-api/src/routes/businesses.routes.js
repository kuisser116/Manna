import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { uploadToR2, generateFilename } from '../services/ipfs.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const router = Router({ strict: false });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'), false);
  },
});

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'Archivo demasiado grande. Máximo 8MB.', code: 'LIMIT_FILE_SIZE' });
    }
  }
  next(err);
};

async function uploadImage(file, prefix, userId) {
  const r2AccountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const filename = generateFilename(prefix);

  if (r2AccountId) {
    try {
      return await uploadToR2(file.buffer, `${prefix}-${userId}-${filename}.webp`, file.mimetype);
    } catch (r2Err) {
      console.error('R2 upload falló, guardando local:', r2Err.message);
    }
  }
  const localFilename = `${prefix}-${userId}-${filename}.jpg`;
  fs.writeFileSync(path.join(uploadsDir, localFilename), file.buffer);
  const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
  return `${baseUrl}/uploads/${localFilename}`;
}

// ─── Obtener comercios cercanos ─────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const { lat, lng, radius } = req.query;

    let query = supabase
      .from('businesses')
      .select('id, name, category, avatar_url, address, location_lat, location_lng, stellar_public_key')
      .eq('is_active', true);

    if (lat && lng) {
      const r = parseFloat(radius) || 0.05;
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      query = query
        .gte('location_lat', latNum - r)
        .lte('location_lat', latNum + r)
        .gte('location_lng', lngNum - r)
        .lte('location_lng', lngNum + r);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    res.json({ businesses: data || [] });
  } catch (err) {
    console.error('Error fetching businesses:', err);
    res.status(500).json({ message: 'Error al obtener comercios' });
  }
});

// ─── Obtener un comercio por ID ────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const bizId = req.params.id;

    const { data: biz, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', bizId)
      .maybeSingle();

    if (error) throw error;
    if (!biz) return res.status(404).json({ message: 'Comercio no encontrado' });

    // Obtener productos
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('business_id', bizId)
      .eq('is_available', true)
      .order('created_at', { ascending: false });

    // Obtener reseñas con info del usuario
    const { data: reviews } = await supabase
      .from('reviews')
      .select(`
        id, rating, comment, created_at,
        user:user_id (id, display_name, avatar_url)
      `)
      .eq('business_id', bizId)
      .order('created_at', { ascending: false });

    // Obtener rating promedio
    const { data: ratingData } = await supabase
      .rpc('get_business_rating', { biz_id: bizId });

    // Contar seguidores del comercio
    const { data: followers } = await supabase
      .from('business_followers')
      .select('id')
      .eq('business_id', bizId);

    res.json({
      business: {
        ...biz,
        avatarUrl: biz.avatar_url,
        coverUrl: biz.cover_url,
        stellarPublicKey: biz.stellar_public_key,
        location: {
          lat: biz.location_lat,
          lng: biz.location_lng,
          address: biz.address,
        },
        products: products || [],
        reviews: reviews || [],
        rating: ratingData?.[0]?.average || 0,
        reviewsCount: ratingData?.[0]?.total || 0,
        followersCount: followers?.length || 0,
        isOwner: biz.owner_id === req.user.id,
      }
    });
  } catch (err) {
    console.error('Error fetching business:', err);
    res.status(500).json({ message: 'Error al obtener el comercio' });
  }
});

// ─── Crear comercio ──────────────────────────────────────
router.post('/', authMiddleware, upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]), handleMulterError, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const { name, category, description, address, lat, lng, phone, website, stellarPublicKey, password } = req.body;

    if (!name || !category) {
      return res.status(400).json({ message: 'Nombre y categoría son requeridos' });
    }

    // Subir imágenes si vienen
    let avatarUrl = null;
    let coverUrl = null;

    if (req.files?.avatar?.[0]) {
      avatarUrl = await uploadImage(req.files.avatar[0], 'biz-avatar', userId);
    }
    if (req.files?.cover?.[0]) {
      coverUrl = await uploadImage(req.files.cover[0], 'biz-cover', userId);
    }

    // Hash simple de la contraseña (para operaciones sensibles del comercio)
    let passwordHash = null;
    if (password) {
      const { createHash } = await import('crypto');
      passwordHash = createHash('sha256').update(password).digest('hex');
    }

    const { data, error } = await supabase
      .from('businesses')
      .insert({
        owner_id: userId,
        name,
        category,
        description,
        address,
        location_lat: lat ? parseFloat(lat) : null,
        location_lng: lng ? parseFloat(lng) : null,
        phone,
        website,
        stellar_public_key: stellarPublicKey,
        avatar_url: avatarUrl,
        cover_url: coverUrl,
        password_hash: passwordHash,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Comercio registrado exitosamente',
      business: { ...data, avatarUrl: data.avatar_url, coverUrl: data.cover_url },
    });
  } catch (err) {
    console.error('Error creating business:', err);
    res.status(500).json({ message: 'Error al registrar el comercio' });
  }
});

// ─── Actualizar comercio ────────────────────────────────
router.put('/:id', authMiddleware, upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]), handleMulterError, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const bizId = req.params.id;

    // Verificar propiedad
    const { data: existing } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', bizId)
      .single();

    if (!existing) return res.status(404).json({ message: 'Comercio no encontrado' });
    if (existing.owner_id !== userId) {
      return res.status(403).json({ message: 'No eres el dueño de este comercio' });
    }

    const updates = {};
    const fields = ['name', 'category', 'description', 'address', 'phone', 'website', 'stellar_public_key'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });
    if (req.body.lat !== undefined) updates.location_lat = parseFloat(req.body.lat);
    if (req.body.lng !== undefined) updates.location_lng = parseFloat(req.body.lng);

    // Subir imágenes si vienen
    if (req.files?.avatar?.[0]) {
      updates.avatar_url = await uploadImage(req.files.avatar[0], 'biz-avatar', userId);
    }
    if (req.files?.cover?.[0]) {
      updates.cover_url = await uploadImage(req.files.cover[0], 'biz-cover', userId);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar' });
    }

    const { data, error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', bizId)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Comercio actualizado', business: data });
  } catch (err) {
    console.error('Error updating business:', err);
    res.status(500).json({ message: 'Error al actualizar el comercio' });
  }
});

// ─── Eliminar comercio ──────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const bizId = req.params.id;

    const { data: existing } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', bizId)
      .single();

    if (!existing) return res.status(404).json({ message: 'Comercio no encontrado' });
    if (existing.owner_id !== userId) {
      return res.status(403).json({ message: 'No eres el dueño de este comercio' });
    }

    const { error } = await supabase
      .from('businesses')
      .update({ is_active: false })
      .eq('id', bizId);

    if (error) throw error;
    res.json({ message: 'Comercio desactivado' });
  } catch (err) {
    console.error('Error deleting business:', err);
    res.status(500).json({ message: 'Error al eliminar el comercio' });
  }
});

// ─── Productos ──────────────────────────────────────────

// GET /businesses/:id/products — Productos de un comercio
router.get('/:id/products', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('business_id', req.params.id)
      .eq('is_available', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ products: data || [] });
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener productos' });
  }
});

// POST /businesses/:id/products — Agregar producto
router.post('/:id/products', authMiddleware, upload.single('image'), handleMulterError, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const bizId = req.params.id;

    // Verificar propiedad
    const { data: biz } = await supabase.from('businesses').select('owner_id').eq('id', bizId).single();
    if (!biz) return res.status(404).json({ message: 'Comercio no encontrado' });
    if (biz.owner_id !== userId) return res.status(403).json({ message: 'No eres el dueño' });

    const { name, description, price, category } = req.body;
    if (!name || !price) return res.status(400).json({ message: 'Nombre y precio requeridos' });

    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadImage(req.file, 'product', userId);
    }

    const { data, error } = await supabase
      .from('products')
      .insert({ business_id: bizId, name, description, price: parseFloat(price), category, image_url: imageUrl })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: 'Producto agregado', product: data });
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).json({ message: 'Error al agregar producto' });
  }
});

// DELETE /products/:id — Eliminar producto
router.delete('/products/:id', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const productId = req.params.id;

    const { data: product } = await supabase
      .from('products')
      .select('id, business_id')
      .eq('id', productId)
      .single();

    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    // Verificar propiedad via business owner
    const { data: biz } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', product.business_id)
      .single();

    if (!biz || biz.owner_id !== userId) return res.status(403).json({ message: 'No eres el dueño' });

    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) throw error;

    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar producto' });
  }
});

// ─── Reseñas ───────────────────────────────────────────

// POST /businesses/:id/reviews — Dejar reseña
router.post('/:id/reviews', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const bizId = req.params.id;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating debe ser entre 1 y 5' });
    }

    // No dejar reseña a tu propio comercio
    const { data: biz } = await supabase.from('businesses').select('owner_id').eq('id', bizId).single();
    if (!biz) return res.status(404).json({ message: 'Comercio no encontrado' });
    if (biz.owner_id === userId) return res.status(400).json({ message: 'No puedes reseñar tu propio comercio' });

    // Verificar reseña existente
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('business_id', bizId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      // Actualizar reseña existente
      const { error } = await supabase
        .from('reviews')
        .update({ rating, comment })
        .eq('id', existing.id);
      if (error) throw error;
      return res.json({ message: 'Reseña actualizada' });
    }

    const { error } = await supabase
      .from('reviews')
      .insert({ business_id: bizId, user_id: userId, rating, comment });

    if (error) throw error;
    res.status(201).json({ message: 'Reseña agregada' });
  } catch (err) {
    console.error('Error creating review:', err);
    res.status(500).json({ message: 'Error al agregar reseña' });
  }
});

// ─── Seguir/dejar de seguir comercio ────────────────────
router.post('/:id/follow', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const bizId = req.params.id;

    const { data: existing } = await supabase
      .from('business_followers')
      .select('id')
      .eq('business_id', bizId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('business_followers').delete().eq('id', existing.id);
      return res.json({ isFollowing: false });
    }

    await supabase.from('business_followers').insert({ business_id: bizId, user_id: userId });
    res.json({ isFollowing: true });
  } catch (err) {
    res.status(500).json({ message: 'Error al seguir comercio' });
  }
});

// ─── Toggle privacidad ─────────────────────────────────
router.put('/:id/privacy', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const bizId = req.params.id;
    const { showProducts, showReviews } = req.body;

    const { data: biz } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', bizId)
      .single();

    if (!biz) return res.status(404).json({ message: 'Comercio no encontrado' });
    if (biz.owner_id !== userId) return res.status(403).json({ message: 'No eres el dueño' });

    const updates = {};
    if (showProducts !== undefined) updates.show_products = showProducts;
    if (showReviews !== undefined) updates.show_reviews = showReviews;

    const { error } = await supabase.from('businesses').update(updates).eq('id', bizId);
    if (error) throw error;

    res.json({ message: 'Privacidad actualizada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar privacidad' });
  }
});

export default router;
