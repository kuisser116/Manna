import { Router } from 'express';
import multer from 'multer';
import authMiddleware from '../middleware/authMiddleware.js';
import { uploadToR2 } from '../services/ipfs.service.js';
import { analyzeContentWithAI } from '../services/moderation.service.js';
import getDB from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router({ strict: false });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// POST /upload/image — Subir imagen (directo a R2, sin IPFS ni moderación IA)
router.post('/image', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file' });

        const filename = `img-${uuidv4()}-${req.file.originalname}`;
        let fileUrl;
        try {
            fileUrl = await uploadToR2(req.file.buffer, filename, req.file.mimetype);
        } catch {
            const { writeFileSync, mkdirSync, existsSync } = await import('fs');
            const { join, dirname } = await import('path');
            const { fileURLToPath } = await import('url');
            const __dir = dirname(fileURLToPath(import.meta.url));
            const upDir = join(__dir, '..', 'uploads');
            if (!existsSync(upDir)) mkdirSync(upDir, { recursive: true });
            const localName = `img-${uuidv4()}.jpg`;
            writeFileSync(join(upDir, localName), req.file.buffer);
            fileUrl = `http://localhost:3001/uploads/${localName}`;
        }

        const caption = req.body.caption || '';
        const content = `${fileUrl}|||${caption}`;

        // Moderación local (sin IA)
        const modCheck = await analyzeContentWithAI(content, 'image', caption, req.user.id);
        if (modCheck.verdict === 'rejected') {
            return res.status(400).json({ message: modCheck.reason });
        }

        const supabase = getDB();
        const postId = uuidv4();
        const { data: post, error } = await supabase.from('posts').insert({
            id: postId, author_id: req.user.id, type: 'image', content, trust_deposit_locked: true
        }).select().single();

        if (error) throw error;

        res.status(201).json({ post, fileUrl });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /upload/video — Subir video (MP4 directo a R2, sin Livepeer)
router.post('/video', authMiddleware, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
    try {
        const videoFile = req.files?.video?.[0];
        if (!videoFile) return res.status(400).json({ message: 'No video' });

        const filename = `video-${uuidv4()}.mp4`;
        let fileUrl;
        try {
            fileUrl = await uploadToR2(videoFile.buffer, filename, videoFile.mimetype);
        } catch {
            const { writeFileSync, mkdirSync, existsSync } = await import('fs');
            const { join, dirname } = await import('path');
            const { fileURLToPath } = await import('url');
            const __dir = dirname(fileURLToPath(import.meta.url));
            const upDir = join(__dir, '..', 'uploads');
            if (!existsSync(upDir)) mkdirSync(upDir, { recursive: true });
            const localName = `video-${uuidv4()}.mp4`;
            writeFileSync(join(upDir, localName), videoFile.buffer);
            fileUrl = `http://localhost:3001/uploads/${localName}`;
        }

        // Moderación local sobre título/descripción
        const textContent = `${req.body.title || ''} ${req.body.description || ''}`.trim();
        const modCheck = await analyzeContentWithAI(textContent, 'video', textContent, req.user.id);
        if (modCheck.verdict === 'rejected') {
            return res.status(400).json({ message: modCheck.reason });
        }

        // Miniatura: si subieron una, la guardamos; si no, sin thumbnail
        let thumbnailUrl = null;
        const thumbFile = req.files?.thumbnail?.[0];
        if (thumbFile) {
            const thumbFilename = `thumb-${uuidv4()}-${thumbFile.originalname}`;
            try {
                thumbnailUrl = await uploadToR2(thumbFile.buffer, thumbFilename, thumbFile.mimetype);
            } catch {
                const { writeFileSync, mkdirSync, existsSync } = await import('fs');
                const { join, dirname } = await import('path');
                const { fileURLToPath } = await import('url');
                const __dir = dirname(fileURLToPath(import.meta.url));
                const upDir = join(__dir, '..', 'uploads');
                if (!existsSync(upDir)) mkdirSync(upDir, { recursive: true });
                const localName = `thumb-${uuidv4()}-${thumbFile.originalname}`;
                writeFileSync(join(upDir, localName), thumbFile.buffer);
                thumbnailUrl = `http://localhost:3001/uploads/${localName}`;
            }
        }

        const supabase = getDB();
        const postId = uuidv4();
        const { error: insertError } = await supabase.from('posts').insert({
            id: postId,
            author_id: req.user.id,
            type: 'video',
            content: req.body.title || '',
            video_status: 'raw',
            video_r2_url: fileUrl,
            video_title: req.body.title || 'Sin título',
            video_description: req.body.description || null,
            video_tags: req.body.tags || null,
            video_thumbnail_url: thumbnailUrl,
        });

        if (insertError) throw insertError;

        res.status(201).json({ postId, fileUrl, thumbnailUrl, message: 'Video subido como MP4 directo' });
    } catch (err) {
        console.error('[Upload Video ERROR]:', err);
        res.status(500).json({ message: err.message });
    }
});

export default router;
