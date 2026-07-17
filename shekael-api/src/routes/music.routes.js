import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '..', '..', '.music-cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true } );

// Cache en memoria para URLs
const streamCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

async function ytExec(args) {
  const { stdout, stderr } = await execFileAsync('yt-dlp', args, {
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
  if (stderr && !stdout) throw new Error(stderr.trim());
  return stdout.trim();
}

// ─── Buscar canciones ───
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0)
      return res.status(400).json({ error: 'Se requiere un término de búsqueda' });

    const query = q.trim();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const raw = await ytExec([
      '--flat-playlist', '--dump-json', '--no-warnings',
      `ytsearch${limit}:${query}`,
    ]);

    const results = [];
    if (!raw) return res.json({ results: [] });
    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        const item = JSON.parse(line);
        if (item?.id && item?.title) {
          results.push({
            id: item.id,
            title: item.title,
            duration: item.duration || 0,
            durationLabel: formatDuration(item.duration),
            thumbnail: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
            channel: item.channel || item.uploader || 'Desconocido',
            channelUrl: item.channel_url || '',
            url: item.webpage_url || `https://www.youtube.com/watch?v=${item.id}`,
            views: item.view_count || 0,
          });
        }
      } catch {}
    }
    res.json({ results });
  } catch (err) {
    console.error('[Music] Search error:', err.message);
    res.status(500).json({ error: 'Error al buscar música' });
  }
});

// ─── Proxy con SOPORTE COMPLETO DE SEEK ───
// Descarga el audio a un archivo temporal y lo sirve con sendFile
// Express maneja Range requests nativamente con sendFile
router.get('/proxy/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    // Sanitizar videoId (solo caracteres seguros)
    if (!/^[\w-]+$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }
    const cachePath = path.join(CACHE_DIR, `${videoId}.webm`);

    // ¿Ya tenemos el archivo descargado?
    if (!fs.existsSync(cachePath)) {
      console.log(`[Music] Descargando ${videoId}...`);
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Descargar con yt-dlp a archivo temporal
      await execFileAsync('yt-dlp', [
        '-f', 'bestaudio[abr<=128]/bestaudio',
        '-o', cachePath,
        '--no-warnings',
        '--user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        videoUrl,
      ], { timeout: 120000, windowsHide: true });

      console.log(`[Music] Descargado ${videoId}`);
    }

    // Express sendFile soporta Range requests nativamente
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const stat = fs.statSync(cachePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Parse Range header: bytes=X-Y
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'audio/webm',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      });

      const stream = fs.createReadStream(cachePath, { start, end });
      stream.pipe(res);
      stream.on('error', () => { if (!res.headersSent) res.end(); });
      req.on('close', () => stream.destroy());
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'audio/webm',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      });

      const stream = fs.createReadStream(cachePath);
      stream.pipe(res);
      stream.on('error', () => { if (!res.headersSent) res.end(); });
      req.on('close', () => stream.destroy());
    }

  } catch (err) {
    console.error('[Music] Proxy error:', err.message);
    if (!res.headersSent)
      res.status(500).json({ error: 'Error al reproducir audio' });
  }
});

// ─── Limpiar caché de archivos viejos (>1 hora) ───
setInterval(() => {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    const now = Date.now();
    for (const f of files) {
      const fp = path.join(CACHE_DIR, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 60 * 60 * 1000) {
        fs.unlinkSync(fp);
        console.log(`[Music] Cache limpiado: ${f}`);
      }
    }
  } catch {}
}, 5 * 60 * 1000);

// ─── Canciones relacionadas (Mix de YouTube) ───
router.get('/related/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!/^[\w-]+$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 30, 50);
    const mixUrl = `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`;

    const raw = await ytExec([
      '--flat-playlist', '--dump-json', '--no-warnings',
      '--playlist-end', String(limit),
      '--user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      mixUrl,
    ]);

    const results = [];
    if (!raw) return res.json({ results: [] });
    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        const item = JSON.parse(line);
        // Skip el primer item (es el mismo video)
        if (item?.id === videoId) continue;
        if (item?.id && item?.title) {
          results.push({
            id: item.id,
            title: item.title,
            duration: item.duration || 0,
            durationLabel: formatDuration(item.duration),
            thumbnail: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
            channel: item.channel || item.uploader || 'Desconocido',
            channelUrl: item.channel_url || '',
            url: item.webpage_url || `https://www.youtube.com/watch?v=${item.id}`,
            views: item.view_count || 0,
          });
        }
      } catch {}
    }
    res.json({ results });
  } catch (err) {
    console.error('[Music] Related error:', err.message);
    res.status(500).json({ error: 'Error al obtener canciones relacionadas' });
  }
});

function formatDuration(sec) {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default router;
