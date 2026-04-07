import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token requerido' });
    }

    const token = authHeader.slice(7);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    } catch {
        return res.status(401).json({ message: 'Token inválido o expirado' });
    }
}

export default authMiddleware;
