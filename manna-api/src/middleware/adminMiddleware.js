import { getDB } from '../database/db.js';

/**
 * Middleware de Admin — se encadena DESPUÉS de authMiddleware.
 * Verifica que el usuario autenticado tenga is_admin = 1 en la DB.
 */
export async function adminMiddleware(req, res, next) {
    const supabase = getDB();

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('is_admin')
            .eq('id', req.user.id)
            .single();

        if (error || !user || !user.is_admin) {
            return res.status(403).json({ message: 'Acceso denegado: se requiere rol de administrador.' });
        }
        next();
    } catch (err) {
        console.error('Admin check error:', err.message);
        return res.status(500).json({ message: 'Error verificando permisos de administrador' });
    }
}

export default adminMiddleware;
