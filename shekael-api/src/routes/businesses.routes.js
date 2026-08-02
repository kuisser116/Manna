import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import authMiddleware from '../middleware/authMiddleware.js';
import getDB from '../database/db.js';
import { uploadToR2, generateFilename } from '../services/ipfs.service.js';
import { createWallet, fundWithFriendbot, ensureTrustline, fundAccountWithXlm } from '../services/stellar.service.js';
import { encryptAll } from '../services/crypto.service.js';

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

// Activar la billetera del comercio: se le crea una cuenta Stellar SEPARADA
// de la del dueño, se fondea con XLM (activación) y se le agrega la trustline USDC.
// En testnet se usa Friendbot (gratis); en mainnet se fondea desde la wallet maestra.
async function activateBusinessWallet() {
  const keypair = createWallet();
  const secretKey = keypair.secret();
  const publicKey = keypair.publicKey();

  const isTestnet = (process.env.STELLAR_HORIZON_URL || '').includes('testnet');

  try {
    if (isTestnet) {
      await fundWithFriendbot(publicKey);
    } else {
      const masterSecret = process.env.MANNA_DEV_WALLET_SECRET || process.env.BONUS_WALLET_SECRET;
      if (!masterSecret) throw new Error('No hay wallet maestra para fondear en mainnet');
      await fundAccountWithXlm(masterSecret, publicKey, 2); // 2 XLM = reserva base + trustline
    }
    // La trustline USDC solo se puede crear si la cuenta ya existe y está fondeada
    await ensureTrustline(secretKey);
    return { publicKey, secretKey, activated: true };
  } catch (err) {
    console.warn('[Business] No se pudo activar la billetera:', err.message);
    return { publicKey, secretKey, activated: false };
  }
}

// ─── Obtener comercios cercanos ─────────────────────────────
router.get('/check-name', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const name = String(req.query.name || '').trim();
    if (!name) return res.json({ available: false });
    const { data } = await supabase
      .from('businesses')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    res.json({ available: !data });
  } catch {
    res.status(500).json({ message: 'Error al verificar nombre' });
  }
});

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
        // Seguridad: NUNCA enviar stellar_secret_key_encrypted ni campos
        // privados de la fila; solo lo que necesita el perfil público.
        id: biz.id,
        owner_id: biz.owner_id,
        name: biz.name,
        category: biz.category,
        description: biz.description,
        address: biz.address,
        phone: biz.phone,
        email: biz.email,
        website: biz.website,
        location_lat: biz.location_lat,
        location_lng: biz.location_lng,
        avatar_url: biz.avatar_url,
        cover_url: biz.cover_url,
        stellar_public_key: biz.stellar_public_key,
        is_active: biz.is_active,
        created_at: biz.created_at,
        updated_at: biz.updated_at,
        show_products: biz.show_products,
        show_reviews: biz.show_reviews,
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
      passwordHash = createHash('sha256').update(password).digest('hex');
    }

    // Crear billetera Stellar SEPARADA del dueño (el comercio lleva sus propias cuentas)
    const { publicKey, secretKey, activated } = await activateBusinessWallet();
    const encSecret = encryptAll(userId, secretKey, publicKey);

    const insertPayload = {
      owner_id: userId,
      name,
      category,
      description,
      address,
      location_lat: lat ? parseFloat(lat) : null,
      location_lng: lng ? parseFloat(lng) : null,
      phone,
      website,
      stellar_public_key: publicKey,
      avatar_url: avatarUrl,
      cover_url: coverUrl,
      password_hash: passwordHash,
      stellar_secret_key_encrypted: encSecret,
    };

    let { data, error } = await supabase
      .from('businesses')
      .insert(insertPayload)
      .select()
      .single();

    // Si la columna stellar_secret_key_encrypted aún no existe en la DB,
    // reintentar sin ella (la billetera sigue creada y activa).
    if (error && /stellar_secret_key_encrypted/i.test(error.message)) {
      console.warn('[Business] Columna stellar_secret_key_encrypted no existe, insertando sin ella.');
      delete insertPayload.stellar_secret_key_encrypted;
      ({ data, error } = await supabase
        .from('businesses')
        .insert(insertPayload)
        .select()
        .single());
    }

    if (error) throw error;

    // Notificación al dueño: comercio registrado (click → /business/:id)
    try {
      await supabase.from('notifications').insert({
        user_id: userId,
        actor_id: userId,
        // El id del comercio va codificado en type (post_id tiene FK a posts)
        type: 'business_registered:' + data.id,
        post_id: null,
        is_read: false,
      });
    } catch (nErr) {
      console.warn('[Business] No se pudo crear notificación:', nErr.message);
    }

    res.status(201).json({
      message: activated
        ? 'Comercio registrado exitosamente. Su cuenta Stellar fue activada.'
        : 'Comercio registrado exitosamente. La cuenta Stellar está pendiente de activación.',
      business: { ...data, avatarUrl: data.avatar_url, coverUrl: data.cover_url },
      wallet: {
        publicKey,
        activated,
        note: 'Cuenta Stellar separada del dueño. Sin bono de bienvenida.',
      },
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
    const fields = ['name', 'category', 'description', 'address', 'phone', 'website', 'email', 'stellar_public_key'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    // Nombre del comercio único en Shekael (como el username de usuarios)
    if (req.body.name !== undefined) {
      const cleanName = String(req.body.name).trim();
      if (cleanName.length < 2 || cleanName.length > 60) {
        return res.status(400).json({ message: 'El nombre debe tener entre 2 y 60 caracteres' });
      }
      const { data: dup } = await supabase
        .from('businesses')
        .select('id')
        .eq('name', cleanName)
        .neq('id', bizId)
        .maybeSingle();
      if (dup) {
        return res.status(400).json({ message: 'Ya existe un comercio con ese nombre. Prueba otro.' });
      }
      updates.name = cleanName;
    }

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
// ─── Verificar contraseña del comercio (dueño) ──────────────
router.post('/:id/verify-password', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const bizId = req.params.id;
    const { password } = req.body;

    if (!password) return res.status(400).json({ message: 'Contraseña requerida' });

    const { data: biz } = await supabase
      .from('businesses')
      .select('owner_id, password_hash')
      .eq('id', bizId)
      .single();

    if (!biz) return res.status(404).json({ message: 'Comercio no encontrado' });
    if (biz.owner_id !== userId) return res.status(403).json({ message: 'No eres el dueño' });

    if (!biz.password_hash) return res.status(400).json({ message: 'Este comercio no tiene contraseña configurada' });

    const hash = createHash('sha256').update(password).digest('hex');
    if (hash !== biz.password_hash) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    res.json({ valid: true });
  } catch (err) {
    res.status(500).json({ message: 'Error al verificar contraseña' });
  }
});

// ─── Cambiar contraseña del comercio (dueño) ────────────────
router.put('/:id/password', authMiddleware, async (req, res) => {
  try {
    const supabase = getDB();
    const userId = req.user.id;
    const bizId = req.params.id;
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener mínimo 6 caracteres' });
    }

    const { data: biz } = await supabase
      .from('businesses')
      .select('owner_id, password_hash')
      .eq('id', bizId)
      .single();

    if (!biz) return res.status(404).json({ message: 'Comercio no encontrado' });
    if (biz.owner_id !== userId) return res.status(403).json({ message: 'No eres el dueño' });

    // Si ya existe contraseña, exigir la actual para cambiarla
    if (biz.password_hash) {
      if (!currentPassword) return res.status(400).json({ message: 'Contraseña actual requerida' });
      const currentHash = createHash('sha256').update(currentPassword).digest('hex');
      if (currentHash !== biz.password_hash) {
        return res.status(401).json({ message: 'Contraseña actual incorrecta' });
      }
    }

    const newHash = createHash('sha256').update(newPassword).digest('hex');
    const { error } = await supabase
      .from('businesses')
      .update({ password_hash: newHash })
      .eq('id', bizId);
    if (error) throw error;

    res.json({ message: 'Contraseña actualizada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al cambiar la contraseña' });
  }
});

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

    const { data: updated, error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', bizId)
      .select()
      .single();
    if (error) throw error;

    res.json({ message: 'Privacidad actualizada', business: updated });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar privacidad' });
  }
});

export default router;
