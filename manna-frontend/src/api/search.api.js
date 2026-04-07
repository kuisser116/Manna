import axios from 'axios';
import useStore from '../store'; // para obtener el token si es necesario manual, aunque usualmente se maneja por axios interceptors

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const searchGlobal = async (query) => {
    const token = useStore.getState().token;
    return axios.get(`${API_URL}/search`, {
        params: { q: query },
        headers: { Authorization: `Bearer ${token}` }
    });
};
