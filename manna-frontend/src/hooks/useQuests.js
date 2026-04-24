import { useCallback } from 'react';
import { sendHeartbeat } from '../api/quests.api';
import useStore from '../store';

export function useQuests() {
    const { 
        questProgress, 
        questStatus, 
        questHints, 
        questTasks,
        setQuestData, 
        refreshQuest 
    } = useStore();

    // Latido silencioso (Para el SmartVideoPlayer)
    const pingHeartbeat = useCallback(async (seconds, postId) => {
        try {
            const res = await sendHeartbeat(seconds, postId);
            
            // Actualizar el estado global inmediatamente
            await refreshQuest();
            
            // Notificar a otros componentes que escuchen eventos (WalletWidget)
            window.dispatchEvent(new CustomEvent('Ehise:quest-refresh'));

            if (res.data.missionCompleted) {
                window.dispatchEvent(new CustomEvent('Ehise:celebration'));
            }
        } catch (err) {
            console.warn('Heartbeat failed:', err);
        }
    }, [refreshQuest]);

    // Función universal para cuando un like o follow avisa que se completó
    const verifyCompletion = useCallback((isCompleted) => {
        refreshQuest(); 
        window.dispatchEvent(new CustomEvent('Ehise:quest-refresh'));
        if (isCompleted) {
            window.dispatchEvent(new CustomEvent('Ehise:celebration'));
        }
    }, [refreshQuest]);

    return {
        progress: questProgress,
        status: questStatus,
        hints: questHints,
        tasks: questTasks,
        hint: questHints[0] ?? null,
        fetchStatus: refreshQuest,
        refreshQuest,
        pingHeartbeat,
        verifyCompletion
    };
}

export default useQuests;
