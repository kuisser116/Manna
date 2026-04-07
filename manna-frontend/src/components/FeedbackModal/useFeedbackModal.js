import { useState, useCallback } from 'react';

const INITIAL_STATE = {
    isOpen: false,
    type: 'loading', // 'loading' | 'success' | 'error' | 'warning'
    title: '',
    message: '',
    showCloseButton: true,
    autoClose: false,
    autoCloseDelay: 2000,
};

export function useFeedbackModal() {
    const [modalState, setModalState] = useState(INITIAL_STATE);

    const showModal = useCallback((overrides) => {
        setModalState({ ...INITIAL_STATE, isOpen: true, ...overrides });
    }, []);

    const hideModal = useCallback(() => {
        setModalState((prev) => ({ ...prev, isOpen: false }));
    }, []);

    const showLoading = useCallback((title = 'Procesando...', message = '') => {
        showModal({ type: 'loading', title, message, showCloseButton: false, autoClose: false });
    }, [showModal]);

    const showSuccess = useCallback((title = '¡Listo!', message = '', autoClose = true) => {
        showModal({
            type: 'success',
            title,
            message,
            showCloseButton: true,
            autoClose,
            autoCloseDelay: 2500,
        });
    }, [showModal]);

    const showError = useCallback((title = 'Error', message = '') => {
        showModal({ type: 'error', title, message, showCloseButton: true, autoClose: false });
    }, [showModal]);

    const showWarning = useCallback((title = 'Atención', message = '') => {
        showModal({ type: 'warning', title, message, showCloseButton: true, autoClose: false });
    }, [showModal]);

    return { modalState, setModalState, showModal, hideModal, showLoading, showSuccess, showError, showWarning };
}

export default useFeedbackModal;
