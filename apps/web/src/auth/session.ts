import type { LoginInput, SessionUser } from '@orders/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ApiError, apiRequest } from '../lib/api-client';
import { clearSessionStore } from '../lib/storage';

export const sessionKey = ['session'] as const;

/** The signed-in user, or null. The token itself is an httpOnly cookie this code never sees. */
async function fetchSession(signal: AbortSignal): Promise<SessionUser | null> {
  try {
    const { data } = await apiRequest<{ user: SessionUser }>('/auth/me', { signal });
    return data.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => fetchSession(signal),
    staleTime: Infinity,
    retry: false,
  });
}

/** Only valid below <RequireAuth>, which guarantees a user. */
export function useCurrentUser(): SessionUser {
  const { data } = useSession();
  if (!data) throw new Error('useCurrentUser() must be rendered inside <RequireAuth>');
  return data;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) =>
      (await apiRequest<{ user: SessionUser }>('/auth/login', { method: 'POST', body: input })).data
        .user,
    onSuccess: (user) => queryClient.setQueryData(sessionKey, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      clearSessionStore();
      queryClient.clear();
      queryClient.setQueryData(sessionKey, null);
      void navigate('/login', { replace: true });
    },
  });
}

/** Only same-site relative paths, so `?next=https://evil.example` cannot redirect off-site. */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return '/orders';
  return next;
}
