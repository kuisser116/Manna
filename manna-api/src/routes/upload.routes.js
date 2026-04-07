import { Router } from 'express';
import multer from 'multer';
import authMiddleware from '../middleware/authMiddleware.js';
import { uploadToR2, computeCID, uploadJSON } from '../services/ipfs.service.js';
import { triggerTranscoding } from '../services/livepeer.service.js';
import { registerContentOwnership } from '../services/stellar.service.js';
import { decrypt } from '../services/crypto.service.js';
import { ensureFaststart } from '../services/video-preprocess.service.js';
import { processThumbnail } from '../services/thumbnail.service.js';
import getDB from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import { analyzeContentWithAI } from '../services/moderation.service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.post('/image', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file' });
        const contentCID = await computeCID(req.file.buffer);
        const fileUrl = await uploadToR2(req.file.buffer, `${contentCID}-${req.file.originalname}`, req.file.mimetype);
        
        const supabase = getDB();
        const postId = uuidv4();
        const caption = req.body.caption || '';
        const finalContent = `${fileUrl}|||${contentCID}|||${caption}`;

        // Moderación por IA (Imagen real + Pie de foto)
        const aiCheck = await analyzeContentWithAI(fileUrl, 'image', caption);
        if (aiCheck.verdict === 'rejected' && aiCheck.confidence > 0.8) {
            return res.status(400).json({ message: 'Contenido rechazado por la IA', reason: aiCheck.reason });
        }

        const { data: post, error } = await supabase.from('posts').insert({
            id: postId, author_id: req.user.id, type: 'image', content: finalContent, trust_deposit_locked: true
        }).select().single();

        res.status(201).json({ post, cid: contentCID, fileUrl });

        const { data: user } = await supabase.from('users').select('stellar_secret_key_encrypted').eq('id', req.user.id).single();
        if (user?.stellar_secret_key_encrypted) {
            const secretKey = decrypt(user.stellar_secret_key_encrypted);
            registerContentOwnership(secretKey, contentCID).catch(() => {});
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/video', authMiddleware, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
    try {
        const videoFile = req.files?.video?.[0];
        if (!videoFile) return res.status(400).json({ message: 'No video' });

        const processedBuffer = await ensureFaststart(videoFile.buffer, videoFile.mimetype);
        const fileUrl = await uploadToR2(processedBuffer, `video-${uuidv4()}`, videoFile.mimetype);
        
        // Procesar miniatura: usa la subida por usuario o genera automática
        const thumbnailFile = req.files?.thumbnail?.[0];
        console.log('[Upload DEBUG]: Iniciando procesamiento de miniatura...');
        const thumbnailUrl = await processThumbnail(processedBuffer, thumbnailFile, videoFile.originalname);
        console.log('[Upload DEBUG]: Miniatura procesada, URL:', thumbnailUrl);

        const metadata = { title: req.body.title, authorId: req.user.id, rawVideoUrl: fileUrl, type: 'video' };
        const contentCID = await uploadJSON(metadata);

        // Moderación por IA (Título/Descripción + Miniatura si existe)
        const textContent = `${req.body.title || ''} ${req.body.description || ''}`.trim();
        const aiCheck = await analyzeContentWithAI(thumbnailUrl, 'video', textContent);
        
        if (aiCheck.verdict === 'rejected' && aiCheck.confidence > 0.8) {
            return res.status(400).json({ message: 'Video rechazado por la IA (Contenido inapropiado)', reason: aiCheck.reason });
        }
        
        const supabase = getDB();
        const postId = uuidv4();
        const { error: insertError } = await supabase.from('posts').insert({
            id: postId, author_id: req.user.id, type: 'video', content: `${contentCID}|||${req.body.title}`,
            video_status: 'raw', video_r2_url: fileUrl, video_title: req.body.title, video_description: req.body.description || null, video_tags: req.body.tags || null, video_thumbnail_url: thumbnailUrl
        });

        if (insertError) throw insertError;

        res.status(201).json({ postId, fileUrl, thumbnailUrl, message: 'Video uploaded' });
    } catch (err) {
        console.error('[Upload Video ERROR]:', err);
        res.status(500).json({ message: err.message });
    }
});

export default router;
