import { apiClient } from './apiClient';

export const fetchHomeDashboardApi = () => apiClient.get('/dashboard/home');

export const fetchDashboardSummaryApi = () => apiClient.get('/dashboard/summary');

export const saveHomeDashboardApi = (payload) => apiClient.put('/dashboard/home', payload);

/** Recent logs and journal entries across every tracker, for the feed widgets. */
export const fetchActivityApi = (limit = 20) => apiClient.get(`/dashboard/activity?limit=${limit}`);
