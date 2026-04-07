import { useState, useCallback } from 'react';
import { loginWithGoogle as apiLoginWithGoogle } from '../api/auth.api';
import useStore from '../store';

export function useAuth() {
    const { setUser, setToken, logout: storeLogout } = useStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const loginWithGoogle = useCallback(async (credential) => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await apiLoginWithGoogle({ credential });
            setToken(data.token);
            setUser(data.user);
            return data;
        } catch (err) {
            const msg = err.response?.data?.message || 'Error al iniciar sesión con Google';
            setError(msg);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    }, [setToken, setUser]);

    const logout = useCallback(() => {
        storeLogout();
    }, [storeLogout]);

    return { loginWithGoogle, logout, loading, error };
}

export default useAuth;
