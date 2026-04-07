import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/posts.api'; // Reusing the axios instance
import useStore from '../store';

export default function useAntiAFK({ adId, postId, proofToken, targetSeconds = 3, onComplete }) {
    const [progress, setProgress] = useState(0);
    const [isCompleted, setIsCompleted] = useState(false);
    const elementRef = useRef(null);
    const timerRef = useRef(null);
    const lastActivityRef = useRef(Date.now());
    const isVisibleRef = useRef(false);
    const isPageVisibleRef = useRef(!document.hidden);
    const accumulatedTimeRef = useRef(0);

    const { getWalletBalance } = useStore();

    // 1. Detect subtle activity
    useEffect(() => {
        const updateActivity = () => { lastActivityRef.current = Date.now(); };
        window.addEventListener('mousemove', updateActivity);
        window.addEventListener('scroll', updateActivity);
        window.addEventListener('touchstart', updateActivity);
        window.addEventListener('keydown', updateActivity);

        return () => {
            window.removeEventListener('mousemove', updateActivity);
            window.removeEventListener('scroll', updateActivity);
            window.removeEventListener('touchstart', updateActivity);
            window.removeEventListener('keydown', updateActivity);
        };
    }, []);

    // 2. Page Visibility API
    useEffect(() => {
        const handleVisibilityChange = () => {
            isPageVisibleRef.current = !document.hidden;
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    const claimReward = useCallback(async () => {
        try {
            const { data } = await api.post('/ads/view-confirmed', {
                adId,
                postId,
                viewSeconds: targetSeconds,
                proofToken
            });
            console.log("Recompensa reclamada:", data);
            getWalletBalance(); // Recargar billetera
            if (onComplete) onComplete(data);
        } catch (error) {
            console.error("Error al reclamar recompensa de Ad:", error);
        }
    }, [adId, postId, targetSeconds, proofToken, onComplete, getWalletBalance]);

    // 3. Central Tick function
    const tick = useCallback(() => {
        if (isCompleted) return;

        const now = Date.now();
        const timeSinceActivity = now - lastActivityRef.current;
        const isAFK = timeSinceActivity > 30000; // 30s sin actividad = AFK

        if (isVisibleRef.current && isPageVisibleRef.current && !isAFK) {
            accumulatedTimeRef.current += 100; // 100ms interval
            setProgress(Math.min((accumulatedTimeRef.current / (targetSeconds * 1000)) * 100, 100));

            if (accumulatedTimeRef.current >= targetSeconds * 1000) {
                // Completed!
                setIsCompleted(true);
                claimReward();
            }
        }
    }, [isCompleted, targetSeconds, claimReward]);

    // Setup interval
    useEffect(() => {
        if (!isCompleted) {
            timerRef.current = setInterval(tick, 100);
        }
        return () => clearInterval(timerRef.current);
    }, [tick, isCompleted]);

    // 4. Intersection Observer
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                isVisibleRef.current = entry.isIntersecting;
            });
        }, { threshold: 0.5 }); // Require 50% visibility

        if (elementRef.current) observer.observe(elementRef.current);

        return () => observer.disconnect();
    }, [elementRef]);

    return { elementRef, progress, isCompleted };
}
