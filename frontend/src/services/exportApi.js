import { API_URL, API_FETCH_OPTIONS } from '../config/api';

export const exportDataApi = async (params) => {
  const urlParams = new URLSearchParams();
  
  if (params.data_type) urlParams.append('data_type', params.data_type);
  if (params.format) urlParams.append('format', params.format);
  
  if (params.tracker_ids && params.tracker_ids.length > 0) {
    params.tracker_ids.forEach(id => urlParams.append('tracker_id', id));
  }

  const response = await fetch(`${API_URL}/export/?${urlParams.toString()}`, {
    ...API_FETCH_OPTIONS,
    method: 'GET',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to export data');
  }

  return await response.text();
};

export const importDataApi = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/export/import/`, {
    ...API_FETCH_OPTIONS,
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to import backup');
  }

  return await response.json();
};
