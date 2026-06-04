import api from '../config/api';

export const exportDataApi = async (params) => {
  const response = await api.get('/export/', { 
    params,
    responseType: 'blob' 
  });
  return response.data;
};

export const importDataApi = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/export/import/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};