'use client';
import axios, {
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import { accessTokenRefresher } from '@/app/utils/accessTokenRefresher';

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL_BASE,
  withCredentials: true,
});

// ── Request interceptor ────────────────────────────────────────────────────────
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const accessToken = localStorage.getItem('accessToken');
      const email = localStorage.getItem('email');

      if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
      if (email) config.headers.email = email;
    }

    config.headers.client = 'web';
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ── Response interceptor ───────────────────────────────────────────────────────
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    const newAccessToken = response.data?.response?.access_token;
    if (newAccessToken) accessTokenRefresher(newAccessToken);
    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      console.error(
        `[Axios] ${error.response.status} error on ${error.config?.url}:`,
        error.response.data,
      );

      // Uncomment to handle 401s with route-aware redirects:
      // if (error.response.status === 401) {
      //   const isAdmin = window.location.pathname.includes('admin');
      //   window.location.href = isAdmin ? '/admin/log-in' : '/log-in';
      // }
    } else if (error.request) {
      console.error('[Axios] No response received:', error.request);
    } else {
      console.error('[Axios] Request setup error:', error.message);
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
