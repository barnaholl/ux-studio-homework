import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (import.meta.env.DEV) {
    (config as any)._startTime = performance.now();
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

api.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      const duration = Math.round(
        performance.now() - ((response.config as any)._startTime ?? 0),
      );
      console.debug(
        `[API] ${response.config.method?.toUpperCase()} ${response.config.url} → ${response.status} (${duration}ms)`,
      );
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Don't attempt token refresh for auth endpoints — their 401s are intentional
    const isAuthRequest = originalRequest.url?.includes('/auth/');
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
      originalRequest._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${api.defaults.baseURL}/auth/refresh`, null, { withCredentials: true })
            .then(({ data }) => {
              localStorage.setItem('access_token', data.accessToken);
              return data.accessToken as string;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }

        const newToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError: any) {
        // Only nuke the token if the refresh endpoint itself returned a 4xx
        // (revoked / invalid refresh token). Network errors leave the token intact
        // so the user stays logged in when the backend is temporarily unreachable.
        if (refreshError?.response?.status) {
          localStorage.removeItem('access_token');
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
