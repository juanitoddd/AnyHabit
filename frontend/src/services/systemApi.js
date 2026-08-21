import { apiClient } from './apiClient';

/** Version and boot-time migration report, shown in Settings → About. */
export const fetchSystemInfoApi = () => apiClient.get('/health');
