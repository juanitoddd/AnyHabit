import { apiClient } from './apiClient';

export const fetchGroupsApi = () => apiClient.get('/groups/');

export const fetchGroupApi = (groupId) => apiClient.get(`/groups/${groupId}`);

export const createGroupApi = (payload) => apiClient.post('/groups/', payload);

export const joinGroupApi = (payload) => apiClient.post('/groups/join', payload);

export const renameGroupApi = (groupId, name) => apiClient.patch(`/groups/${groupId}`, { name });

export const rotateJoinCodeApi = (groupId) => apiClient.post(`/groups/${groupId}/rotate-code`);

export const removeGroupMemberApi = (groupId, userId) =>
  apiClient.delete(`/groups/${groupId}/members/${userId}`);

export const leaveGroupApi = (groupId) => apiClient.post(`/groups/${groupId}/leave`);

export const deleteGroupApi = (groupId) => apiClient.delete(`/groups/${groupId}`);
