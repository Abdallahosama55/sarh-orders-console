import type { LoginInput, SessionUser } from '@orders/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
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

/**
 * The user <RequireAuth> let through. Pages read it here rather than from the session query:
 * when the session ends (sign-out, a 401), a page can re-render before <RequireAuth> has
 * redirected, and it must still see the user it was rendered for, never "no user".
 */
export const CurrentUserContext = createContext<SessionUser | null>(null);

/** Only valid below <RequireAuth>, which provides the user. */
export function useCurrentUser(): SessionUser {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error('useCurrentUser() must be rendered inside <RequireAuth>');
  return user;
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

const DEFAULT_NEXT_PATH = '/orders';

/**
 * Only same-origin paths, so `?next=https://evil.example` cannot redirect off-site. The value
 * is resolved the way the browser will resolve it: the URL parser drops tabs and newlines, so
 * a prefix check alone would let `/<tab>/evil.example` through as `//evil.example`.
 */
export function safeNextPath(next: string | null): string {
  if (!next?.startsWith('/')) return DEFAULT_NEXT_PATH;
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return DEFAULT_NEXT_PATH;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_NEXT_PATH;
  }
}
