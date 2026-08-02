import { useCallback } from 'react';
import { getWalletBalance, sendSupport as apiSupport } from '../api/transactions.api';
import useStore from '../store';

export function useWallet() {
    const { user, activeProfile, setBalance, setBalanceLoading, updatePostSupports } = useStore();

    const fetchBalance = useCallback(async () => {
        // Si el perfil activo es un comercio, consultar el saldo del comercio
        const isBiz = activeProfile?.type === 'business';
        const pubKey = isBiz ? activeProfile.business?.stellarPublicKey || activeProfile.business?.stellar_public_key : user?.stellarPublicKey;
        if (!pubKey) return;
        setBalanceLoading(true);
        try {
            const businessId = isBiz ? activeProfile.business?.id : null;
            const { data } = await getWalletBalance(businessId);
            setBalance(
                data.balance || '0.00',
                data.currency || 'XLM',
                data.notFunded || false,
                data.usdcActive || false
            );
        } catch (err) {
            console.error('Error fetching balance:', err);
        } finally {
            setBalanceLoading(false);
        }
    }, [user, activeProfile, setBalance, setBalanceLoading]);

    const sendSupport = useCallback(async (recipientPublicKey, postId, amount = '0.01') => {
        const { data } = await apiSupport({ to: recipientPublicKey, amount, postId });
        if (data.newBalance) setBalance(data.newBalance, data.currency || 'USDC');
        if (postId) updatePostSupports(postId);
        return data;
    }, [setBalance, updatePostSupports]);

    return { fetchBalance, sendSupport };
}

export default useWallet;
