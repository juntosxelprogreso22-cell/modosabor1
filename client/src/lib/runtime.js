const RAW_API_URL = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');

export const API_ORIGIN = RAW_API_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : '');

export const API_BASE_URL = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';
export const SOCKET_URL = API_ORIGIN || undefined;
export const UPLOADS_BASE_URL = API_ORIGIN || '';
