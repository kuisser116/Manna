import { useState, useEffect, useCallback } from 'react';
import { getAdEarnings, getAdStats, getPoolStatus, claimMonthlyEarnings } from '../api/ads.api';

export default function useAdEarnings() {
    const [earnings, setEarnings] = useState(null);
    const [stats, setStats] = useState(null);
    const [pool, setPool] = useState(null);
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
            // Silencioso
        }
    }, []);

    const fetchPool = useCallback(async () => {
        try {
            const data = await getPoolStatus();
            setPool(data);
        } catch {
            // Silencioso
        }
    }, []);

    const claimMonthly = useCallback(async () => {
        try {
            const result = await claimMonthlyEarnings();
            if (result.success) {
                await fetchEarnings();
                await fetchPool();
            }
            return result;
        } catch (err) {
            return { success: false, message: err.message };
        }
    }, [fetchEarnings, fetchPool]);

    useEffect(() => {
        fetchEarnings();
        fetchStats();
        fetchPool();
    }, [fetchEarnings, fetchStats, fetchPool]);

    return {
        earnings,
        stats,
        pool,
        loading,
        error,
        fetchEarnings,
        fetchStats,
        fetchPool,
        claimMonthly,
        balance: earnings?.balance || 0,
        totalEarned: earnings?.total_earned || 0,
        totalWithdrawn: earnings?.total_withdrawn || 0,
        canClaimMonthly: earnings?.can_claim_monthly || false,
        nextClaimDate: earnings?.next_claim_date || null,
        perViewRate: stats?.perViewMxn || pool?.pool?.perViewMxn || 0.05,
        poolSettled: stats?.poolSettled || pool?.pool?.isSettled || false,
        monthlyImpressions: earnings?.monthly_impressions || 0
    };
}
