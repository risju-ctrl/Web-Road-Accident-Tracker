import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api'
});

api.interceptors.response.use(
  res => res,
  err => {
    // A 401 from the login request itself means "wrong credentials", not "session
    // expired". Redirecting there would reload the page and wipe the error message.
    const isLoginRequest = String(err.config?.url || '').includes('/auth/login');
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      delete api.defaults.headers.common.Authorization;
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;