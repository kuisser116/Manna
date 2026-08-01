import { useState, useEffect, useCallback, useRef } from 'react';
import { updateUserLocation } from '../api/venues.api';

/**
 * Hook para geolocalización en tiempo real.
 * Pide permiso 1 vez y actualiza ubicación periódicamente.
 * 
 * @param {Object} options
 * @param {number} options.interval - Intervalo de actualización en ms (default: 5 min)
 * @param {boolean} options.autostart - Empezar automáticamente (default: false)
 */
export default function useGeolocation({ interval = 300000, autostart = false } = {}) {
    const [location, setLocation] = useState(null);
    const [error, setError] = useState(null);
    const [permission, setPermission] = useState('prompt');
    const [isWatching, setIsWatching] = useState(false);
    const watchIdRef = useRef(null);
    const intervalRef = useRef(null);

    const startWatching = useCallback(() => {
        if (!navigator.geolocation) {
            setError('Geolocalización no soportada');
            return;
        }

        // Éxito
        const onSuccess = (pos) => {
            const loc = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                timestamp: Date.now(),
            };
            setLocation(loc);
            setError(null);
            setPermission('granted');

            // Enviar al servidor
            updateUserLocation(loc.lat, loc.lng);
        };

        // Error
        const onError = (err) => {
            if (err.code === err.PERMISSION_DENIED) {
                setPermission('denied');
                setError('Permiso de ubicación denegado');
            } else {
                setError(`Error: ${err.message}`);
            }
        };

        // Obtener posición inicial
        navigator.geolocation.getCurrentPosition(onSuccess, onError, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000,
        });

        // Watch para cambios en tiempo real
        watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 60000,
        });

        // Actualización periódica al servidor
        intervalRef.current = setInterval(() => {
            if (location) {
                updateUserLocation(location.lat, location.lng);
            }
        }, interval);

        setIsWatching(true);
    }, [interval]);

    const stopWatching = useCallback(() => {
        if (watchIdRef.current) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsWatching(false);
    }, []);

    // Autostart
    useEffect(() => {
        if (autostart) {
            startWatching();
        }
        return () => {
            stopWatching();
        };
    }, [autostart, startWatching, stopWatching]);

    return {
        location,
        error,
        permission,
        isWatching,
        startWatching,
        stopWatching,
    };
}
