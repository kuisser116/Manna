import axios from 'axios';

const bizAPI = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || location.origin),
  headers: { 'Content-Type': 'application/json' },
});

bizAPI.interceptors.request.use((config) => {
  const token = localStorage.getItem('Shekael_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

bizAPI.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('Shekael_token');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export const getBusinesses = (params) => bizAPI.get('/businesses', { params });
export const getBusiness = (id) => bizAPI.get(`/businesses/${id}`);
export const createBusiness = (formData) =>
  bizAPI.post('/businesses', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const updateBusiness = (id, data) => {
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
  return bizAPI.put(`/businesses/${id}`, data, {
    headers: isFormData
      ? { 'Content-Type': 'multipart/form-data' }
      : { 'Content-Type': 'application/json' },
  });
};
export const deleteBusiness = (id) => bizAPI.delete(`/businesses/${id}`);
export const verifyBusinessPassword = (id, password) => bizAPI.post(`/businesses/${id}/verify-password`, { password });
export const updateBusinessPassword = (id, { currentPassword, newPassword }) =>
  bizAPI.put(`/businesses/${id}/password`, { currentPassword, newPassword });

export const getProducts = (bizId) => bizAPI.get(`/businesses/${bizId}/products`);
export const createProduct = (bizId, formData) =>
  bizAPI.post(`/businesses/${bizId}/products`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const deleteProduct = (productId) => bizAPI.delete(`/businesses/products/${productId}`);

export const createReview = (bizId, data) => bizAPI.post(`/businesses/${bizId}/reviews`, data);
export const toggleFollowBusiness = (bizId) => bizAPI.post(`/businesses/${bizId}/follow`);

export const updateBusinessPrivacy = (bizId, data) => bizAPI.put(`/businesses/${bizId}/privacy`, data);
export const checkBusinessName = (name) => bizAPI.get('/businesses/check-name', { params: { name } });

export default bizAPI;
