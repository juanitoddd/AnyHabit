import { apiClient } from './apiClient';

export const fetchHomeDashboardApi = () => apiClient.get('/dashboard/home');

export const fetchDashboardSummaryApi = () => apiClient.get('/dashboard/summary');

export const saveHomeDashboardApi = (payload) => apiClient.put('/dashboard/home', payload);
