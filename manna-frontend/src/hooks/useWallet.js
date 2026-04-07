import { useCallback } from 'react';
import { getWalletBalance, sendSupport as apiSupport } from '../api/transactions.api';
import useStore from '../store';

export function useWallet() {
    const { user, setBalance, setBalanceLoading, updatePostSupports } = useStore();

    const fetchBalance = useCallback(async () => {
        if (!user?.stellarPublicKey) return;
        setBalanceLoading(true);
        try {
            const { data } = await getWalletBalance();
            setBalance(data.balance || '0.00', data.currency || 'XLM', data.balanceMXN || '0.00', data.mxne || '0.00');
        } catch (err) {
            console.error('Error fetching balance:', err);
        } finally {
            setBalanceLoading(false);
        }
    }, [user, setBalance, setBalanceLoading]);

    const sendSupport = useCallback(async (recipientPublicKey, postId, amount = '0.01') => {
        const { data } = await apiSupport({ to: recipientPublicKey, amount, postId });
        if (data.newBalance) setBalance(data.newBalance, data.currency || 'USDC', data.balanceMXN || '0.00', data.mxne || '0.00');
        if (postId) updatePostSupports(postId);
        return data;
    }, [setBalance, updatePostSupports]);

    return { fetchBalance, sendSupport };
}

export default useWallet;
