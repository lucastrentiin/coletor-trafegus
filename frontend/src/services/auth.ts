import { request } from './http';
import type { AuthMe, SessionProfile, SessionUser } from '@/types/api';

export const authService = {
  me: () => request<AuthMe>('/api/auth/me', { allowUnauthorized: true }),

  login: (login: string, password: string) =>
    request<{ ok: true; user: SessionUser; permissions: string[]; profiles: SessionProfile[] }>('/api/auth/login', {
      method: 'POST',
      body: { login, password },
      allowUnauthorized: true,
    }),

  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST', allowUnauthorized: true }),

  changePassword: (newPassword: string) =>
    request<{ ok: true }>('/api/auth/change-password', { method: 'POST', body: { newPassword } }),
};
