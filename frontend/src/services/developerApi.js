import { apiClient } from './apiClient';

// --- Personal access tokens -------------------------------------------------

export const fetchTokensApi = () => apiClient.get('/developer/tokens');

/** The response is the only place the token value ever appears. */
export const createTokenApi = (payload) => apiClient.post('/developer/tokens', payload);

export const revokeTokenApi = (tokenId) => apiClient.delete(`/developer/tokens/${tokenId}`);

// --- Webhooks ---------------------------------------------------------------

export const fetchWebhooksApi = () => apiClient.get('/developer/webhooks');

export const fetchWebhookEventsApi = () => apiClient.get('/developer/webhooks/events');

export const createWebhookApi = (payload) => apiClient.post('/developer/webhooks', payload);

export const updateWebhookApi = (webhookId, payload) =>
  apiClient.patch(`/developer/webhooks/${webhookId}`, payload);

export const testWebhookApi = (webhookId) => apiClient.post(`/developer/webhooks/${webhookId}/test`);

export const deleteWebhookApi = (webhookId) => apiClient.delete(`/developer/webhooks/${webhookId}`);
