import { useState, useEffect, useCallback } from 'react';
import { getAdEarnings, getAdStats, claimMonthlyEarnings } from '../api/ads.api';

export default function useAdEarnings() {
    const [earnings, setEarnings] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchEarnings = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getAdEarnings();
            setEarnings(data.earnings);
        } catch (err) {
            setError(err.message);
            setEarnings(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const data = await getAdStats();
            setStats(data);
        } catch {
            // Silencioso — no crítico
        }
    }, []);

    const claimMonthly = useCallback(async () => {
        try {
            const result = await claimMonthlyEarnings();
            if (result.success) {
                await fetchEarnings();
            }
            return result;
        } catch (err) {
            return { success: false, message: err.message };
        }
    }, [fetchEarnings]);

    useEffect(() => {
        fetchEarnings();
        fetchStats();
    }, [fetchEarnings, fetchStats]);

    return {
        earnings,
        stats,
        loading,
        error,
        fetchEarnings,
        fetchStats,
        claimMonthly,
        balance: earnings?.balance || 0,
        totalEarned: earnings?.total_earned || 0,
        totalWithdrawn: earnings?.total_withdrawn || 0,
        canClaimMonthly: earnings?.can_claim_monthly || false,
        nextClaimDate: earnings?.next_claim_date || null
    };
}
